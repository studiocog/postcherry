import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { chunk, orderBy, uniq } from 'lodash';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { BrandKitService } from '@gitroom/nestjs-libraries/database/prisma/brand-kit/brand-kit.service';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { generationError } from '@gitroom/nestjs-libraries/openai/generation.error';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  AI_PLANNER_MAX_DAYS,
  AiPlanItem,
  AiPlannerEvent,
  GeneratePlanDto,
  plannedPostsCount,
  plannerContentMix,
  PlannerContentMix,
  plannerLanguages,
} from '@gitroom/nestjs-libraries/dtos/ai-planner/ai.planner.dto';

dayjs.extend(utc);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_TIME = '10:00';
// a provider without a limit still gets a post of a sane length
const DEFAULT_MAX_LENGTH = 3000;
const MAX_LENGTH = 5000;
const TITLE_LENGTH = 120;
const POSTS_PER_BATCH = 10;
// longer than the worst case of the outline and the posts with one retry each
const LOCK_SECONDS = 10 * 60;

export interface PreparedPlan {
  startDate: string;
  endDate: string;
  postsPerWeek: number;
  total: number;
  // only plain values of the channels, never the integration rows
  channels: {
    id: string;
    name: string;
    identifier: string;
    maxLength: number;
  }[];
  contentMix: PlannerContentMix[];
  // English name of the language, for the prompt
  language: string;
  goals: string;
}

interface PlannedIdea {
  number: number;
  date: string;
  time: string;
  integrationIds: string[];
  title: string;
  category: AiPlanItem['category'];
}

const isRealDate = (date: string) =>
  DATE.test(date) && dayjs.utc(date).format('YYYY-MM-DD') === date;

// '9:30', '09:30' and '9:30 PM' become '09:30' / '21:30', anything else the default
const toTime = (value?: string) => {
  const text = (value || '').trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(text);
  if (!match) {
    return DEFAULT_TIME;
  }

  let hours = +match[1];
  if (/pm$/i.test(text) && hours < 12) {
    hours += 12;
  }
  if (/am$/i.test(text) && hours === 12) {
    hours = 0;
  }

  const time = `${String(hours).padStart(2, '0')}:${match[2]}`;
  return TIME.test(time) ? time : DEFAULT_TIME;
};

// Cut at the last space before the limit, so no word is cut in half
const toLength = (text: string, limit: number) => {
  if (text.length <= limit) {
    return text;
  }

  const cut = text.slice(0, limit).replace(/[\uD800-\uDBFF]$/, '');
  const space = cut.search(/\s\S*$/);
  return (space > 0 ? cut.slice(0, space) : cut).trim();
};

// 'behind the scenes' and 'Behind-the-scenes' are 'behind_the_scenes', anything unknown is 'other'
const toCategory = (value?: string): AiPlanItem['category'] => {
  const category = (value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return plannerContentMix.find((mix) => mix === category) || 'other';
};

const toContent = (value?: string) => {
  const text = (value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\*\*/g, '')
    .trim();

  // the whole post wrapped in quotes, not a post that starts and ends with two quotes
  const unquoted = /^["“][^"“”]*["”]$/.test(text)
    ? text.slice(1, -1).trim()
    : text;

  return unquoted.replace(/\n{3,}/g, '\n\n');
};

@Injectable()
export class AiPlannerService {
  constructor(
    private _integrationService: IntegrationService,
    private _integrationManager: IntegrationManager,
    private _brandKitService: BrandKitService,
    private _openaiService: OpenaiService
  ) {}

  isConfigured() {
    return !!process.env.OPENAI_API_KEY;
  }

  // Everything that can be wrong with the request, checked before the stream starts
  async preparePlan(orgId: string, body: GeneratePlanDto): Promise<PreparedPlan> {
    const days =
      dayjs.utc(body.endDate).diff(dayjs.utc(body.startDate), 'day') + 1;

    // a day of tolerance for the timezone of the user
    if (
      !isRealDate(body.startDate) ||
      !isRealDate(body.endDate) ||
      body.startDate <
        dayjs.utc().subtract(1, 'day').format('YYYY-MM-DD') ||
      days < 1 ||
      days > AI_PLANNER_MAX_DAYS
    ) {
      throw new BadRequestException('Invalid date range');
    }

    const requested = uniq(body.integrations || []);
    const channels = (
      await this._integrationService.getIntegrationsList(orgId)
    )
      .filter(
        (integration) =>
          requested.includes(integration.id) &&
          !integration.disabled &&
          !integration.inBetweenSteps
      )
      .map((integration) => ({
        id: integration.id,
        name: integration.name,
        identifier: integration.providerIdentifier,
        maxLength: this.channelLimit(
          integration.providerIdentifier,
          integration.additionalSettings
        ),
      }));

    if (!channels.length) {
      throw new BadRequestException('Pick at least one active channel');
    }

    return {
      startDate: body.startDate,
      endDate: body.endDate,
      postsPerWeek: body.postsPerWeek,
      total: plannedPostsCount(body.postsPerWeek, days),
      channels,
      contentMix: uniq(
        (body.contentMix || []).filter((mix) =>
          plannerContentMix.includes(mix)
        )
      ),
      language:
        plannerLanguages.find((p) => p.code === body.language)?.name ||
        'English',
      goals: body.goals.trim(),
    };
  }

  // Nothing is saved, the user reviews the plan and adds the posts as drafts
  async *generatePlan(
    orgId: string,
    plan: PreparedPlan,
    signal?: AbortSignal
  ): AsyncGenerator<AiPlannerEvent> {
    if (!this.isConfigured()) {
      yield { name: 'result', status: 'not_configured' };
      return;
    }

    // one plan at a time per workspace, every plan is several OpenAI calls
    const lock = `ai-planner:${orgId}`;
    if (!(await ioRedis.set(lock, '1', 'EX', LOCK_SECONDS, 'NX'))) {
      throw new HttpException(
        'A plan is already being generated for this workspace, please wait.',
        429
      );
    }

    try {
      const { brandContext, brandVoice } = await this.getBrandContext(orgId);

      yield { name: 'outline' };

      let outline: Awaited<ReturnType<OpenaiService['planContentOutline']>>;
      try {
        outline = await this._openaiService.planContentOutline(
          {
            startDate: plan.startDate,
            endDate: plan.endDate,
            total: plan.total,
            postsPerWeek: plan.postsPerWeek,
            channels: plan.channels.map((channel, index) => ({
              number: index + 1,
              name: channel.name,
              identifier: channel.identifier,
              maxLength: channel.maxLength,
            })),
            categories: plannerContentMix.map((mix) => mix.replace(/_/g, ' ')),
            contentMix: plan.contentMix.map((mix) => mix.replace(/_/g, ' ')),
            language: plan.language,
            goals: plan.goals,
            brandContext,
          },
          signal
        );
      } catch (err) {
        if (signal?.aborted) {
          return;
        }
        throw generationError(err);
      }

      const ideas = this.clampOutline(plan, outline);
      if (!ideas.length) {
        throw new HttpException(
          'The AI did not return a usable plan, please try again.',
          422
        );
      }

      const batches = chunk(ideas, POSTS_PER_BATCH);
      yield { name: 'writing', done: 0, total: ideas.length };

      // all the batches run together, the progress follows them in order
      const allTitles = ideas.map((idea) => idea.title);
      const requests = batches.map((batch) =>
        this._openaiService
          .writePlannedPosts(
            {
              ideas: batch.map((idea) => ({
                number: idea.number,
                date: idea.date,
                title: idea.title,
                category: idea.category.replace(/_/g, ' '),
                channels: plan.channels
                  .filter((channel) => idea.integrationIds.includes(channel.id))
                  .map((channel) => channel.name)
                  .join(', '),
                maxLength: this.itemLimit(plan, idea.integrationIds),
              })),
              allTitles,
              language: plan.language,
              goals: plan.goals,
              brandContext,
            },
            signal
          )
          .then(
            (posts) => ({ posts, error: null }),
            (error) => ({ posts: [], error })
          )
      );

      const items: AiPlanItem[] = [];
      let lastError: unknown = null;
      let written = 0;
      for (const [index, request] of requests.entries()) {
        const { posts, error } = await request;
        if (error) {
          lastError = error;
          if (!signal?.aborted) {
            Logger.warn(
              `AI planner could not write a batch of ${orgId}: ${error}`
            );
          }
        } else {
          items.push(...this.clampContent(plan, batches[index], posts));
        }

        // the progress counts posts, a batch holds several of them
        written += batches[index].length;
        yield { name: 'writing', done: written, total: ideas.length };
      }

      if (signal?.aborted) {
        return;
      }

      if (!items.length) {
        throw lastError
          ? generationError(lastError)
          : new HttpException(
              'The AI did not return a usable plan, please try again.',
              422
            );
      }

      yield {
        name: 'result',
        status: 'ok',
        items,
        brandVoice,
        channelLimits: Object.fromEntries(
          plan.channels.map((channel) => [channel.id, channel.maxLength])
        ),
      };
    } finally {
      await ioRedis.del(lock);
    }
  }

  private channelLimit(identifier: string, additionalSettings: string | null) {
    try {
      const limit = this._integrationManager
        .getSocialIntegration(identifier)
        ?.maxLength(JSON.parse(additionalSettings || '[]'), {});

      return Math.min(limit > 0 ? limit : DEFAULT_MAX_LENGTH, MAX_LENGTH);
    } catch (err) {
      return DEFAULT_MAX_LENGTH;
    }
  }

  // a post that goes to several channels has to fit the strictest one
  private itemLimit(plan: PreparedPlan, integrationIds: string[]) {
    return Math.min(
      ...plan.channels
        .filter((channel) => integrationIds.includes(channel.id))
        .map((channel) => channel.maxLength),
      MAX_LENGTH
    );
  }

  // the brand voice, plus the hashtags it may use since these posts are full posts
  private async getBrandContext(orgId: string) {
    // never throws, '' when there is no voice, do's or don'ts
    const voice = await this._brandKitService.getAiContext(orgId);

    let hashtags: string[] = [];
    try {
      hashtags =
        (await this._brandKitService.getBrandKit(orgId))?.hashtags || [];
    } catch (err) {
      Logger.warn(`Could not load the brand hashtags of ${orgId}: ${err}`);
    }

    return {
      brandContext: [
        ...(voice ? [voice] : []),
        ...(hashtags.length
          ? [`Brand hashtags you can use when they fit: ${hashtags.join(' ')}`]
          : []),
      ].join('\n'),
      // what the "Brand voice applied" badge tells the user, hashtags alone are not a voice
      brandVoice: !!voice,
    };
  }

  // The model is never trusted: dates, times, channels and the number of posts are all checked
  private clampOutline(
    plan: PreparedPlan,
    outline: Awaited<ReturnType<OpenaiService['planContentOutline']>>
  ): PlannedIdea[] {
    const allIds = plan.channels.map((channel) => channel.id);

    const ideas = (outline || []).flatMap((item) => {
      const date = (item?.date || '').trim();
      const title = (item?.title || '').trim().slice(0, TITLE_LENGTH);
      if (
        !title ||
        !isRealDate(date) ||
        date < plan.startDate ||
        date > plan.endDate
      ) {
        return [];
      }

      const integrationIds = uniq(
        (item.channels || [])
          .filter(
            (number) =>
              Number.isInteger(number) &&
              number >= 1 &&
              number <= plan.channels.length
          )
          .map((number) => plan.channels[number - 1].id)
      );

      return [
        {
          date,
          time: toTime(item.time),
          integrationIds: integrationIds.length ? integrationIds : allIds,
          title,
          category: toCategory(item.category),
        },
      ];
    });

    // never more than postsPerWeek in a week counted from the start date
    const start = dayjs.utc(plan.startDate);
    const perWeek: Record<number, number> = {};
    const seen = new Set<string>();

    return orderBy(ideas, ['date', 'time'])
      .filter((idea) => {
        const key = `${idea.date} ${idea.time} ${idea.title.toLowerCase()}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);

        const week = Math.floor(dayjs.utc(idea.date).diff(start, 'day') / 7);
        perWeek[week] = (perWeek[week] || 0) + 1;
        return perWeek[week] <= plan.postsPerWeek;
      })
      .slice(0, plan.total)
      .map((idea, index) => ({ ...idea, number: index + 1 }));
  }

  private clampContent(
    plan: PreparedPlan,
    ideas: PlannedIdea[],
    posts: Awaited<ReturnType<OpenaiService['writePlannedPosts']>>
  ): AiPlanItem[] {
    return ideas.flatMap((idea) => {
      const content = toLength(
        toContent(posts.find((post) => post?.number === idea.number)?.content),
        this.itemLimit(plan, idea.integrationIds)
      );

      if (!content) {
        return [];
      }

      return [
        {
          id: makeId(10),
          date: idea.date,
          time: idea.time,
          integrationIds: idea.integrationIds,
          title: idea.title,
          category: idea.category,
          content,
        },
      ];
    });
  }
}
