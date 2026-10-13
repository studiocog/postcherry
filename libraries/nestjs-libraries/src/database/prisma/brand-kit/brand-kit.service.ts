import { Injectable, Logger } from '@nestjs/common';
import { uniq, uniqBy } from 'lodash';
import { BrandKitRepository } from '@gitroom/nestjs-libraries/database/prisma/brand-kit/brand-kit.repository';
import {
  BrandKitDto,
  BrandKitView,
  LearnVoiceResult,
} from '@gitroom/nestjs-libraries/dtos/brand-kit/brand-kit.dto';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { generationError } from '@gitroom/nestjs-libraries/openai/generation.error';

const LEARN_VOICE_POSTS = 30;
const LEARN_VOICE_POST_LENGTH = 1500;

// '' and spaces only are stored as null
const toNullable = (value?: string | null) => value?.trim() || null;

const toList = (values: string[] = [], maxItems: number, maxLength: number) =>
  uniq(
    values
      .map((value) => (value || '').trim().slice(0, maxLength))
      .filter((value) => !!value)
  ).slice(0, maxItems);

@Injectable()
export class BrandKitService {
  constructor(
    private _brandKitRepository: BrandKitRepository,
    private _openaiService: OpenaiService
  ) {}

  async getBrandKit(orgId: string): Promise<BrandKitView | null> {
    const kit = await this._brandKitRepository.getBrandKit(orgId);
    if (!kit) {
      return null;
    }

    const { organization, logoMediaId, logoPath, ...rest } = kit;
    return {
      ...rest,
      name: kit.brandName || organization.name,
      logo: logoPath ? { id: logoMediaId, path: logoPath } : null,
    };
  }

  async saveBrandKit(orgId: string, body: BrandKitDto) {
    // the path is never taken from the client, only from the media of the workspace
    const logoMediaId = toNullable(body.logoMediaId);
    const logo = logoMediaId
      ? await this._brandKitRepository.getOrgMediaPath(orgId, logoMediaId)
      : null;

    return this._brandKitRepository.upsertBrandKit(orgId, {
      brandName: toNullable(body.brandName),
      logoMediaId: logo?.id || null,
      logoPath: logo?.path || null,
      primaryColor: toNullable(body.primaryColor),
      secondaryColor: toNullable(body.secondaryColor),
      accentColor: toNullable(body.accentColor),
      headingFont: toNullable(body.headingFont),
      bodyFont: toNullable(body.bodyFont),
      voice: toNullable(body.voice),
      dos: toList(body.dos, 20, 200),
      donts: toList(body.donts, 20, 200),
      hashtags: toList(
        (body.hashtags || []).map((hashtag) => {
          const value = (hashtag || '').replace(/[\s#]+/g, '');
          return value ? `#${value}` : '';
        }),
        30,
        100
      ),
      website: toNullable(body.website),
    });
  }

  // The brand voice as a prompt block, '' when nothing is set so prompts stay as they are.
  // AI writing must never fail because of the brand kit, so this never throws
  async getAiContext(orgId: string): Promise<string> {
    try {
      const kit = await this._brandKitRepository.getBrandKit(orgId);
      if (!kit || (!kit.voice && !kit.dos.length && !kit.donts.length)) {
        return '';
      }

      // hashtags are left out on purpose, several prompts ask for no hashtags
      return [
        ...(kit.voice ? [`Brand voice of this workspace:\n${kit.voice}`] : []),
        ...(kit.dos.length
          ? [`Do:\n${kit.dos.map((p) => `- ${p}`).join('\n')}`]
          : []),
        ...(kit.donts.length
          ? [`Don't:\n${kit.donts.map((p) => `- ${p}`).join('\n')}`]
          : []),
      ].join('\n');
    } catch (err) {
      Logger.warn(`Could not load the brand voice of ${orgId}: ${err}`);
      return '';
    }
  }

  // Suggests a voice from the last published posts, the user reviews it and saves it
  async learnVoice(orgId: string): Promise<LearnVoiceResult> {
    if (!process.env.OPENAI_API_KEY) {
      return { status: 'not_configured' };
    }

    // a post sent to several channels is one group, it is read once
    const posts = uniq(
      uniqBy(
        await this._brandKitRepository.getRecentPublishedContent(
          orgId,
          LEARN_VOICE_POSTS * 3
        ),
        (post) => post.group
      )
        .map((post) =>
          stripHtmlValidation('normal', post.content || '', false, true)
            .trim()
            .slice(0, LEARN_VOICE_POST_LENGTH)
        )
        .filter((post) => !!post)
    ).slice(0, LEARN_VOICE_POSTS);

    if (!posts.length) {
      return { status: 'no_posts' };
    }

    try {
      const { voice, dos, donts } =
        await this._openaiService.proposeBrandVoice(posts);

      return {
        status: 'ok',
        voice: (voice || '').trim().slice(0, 2000),
        dos: toList(dos, 20, 200),
        donts: toList(donts, 20, 200),
        postsUsed: posts.length,
      };
    } catch (err) {
      throw generationError(err);
    }
  }
}
