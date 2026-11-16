import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { BadBody, SocialAbstract } from '../social.abstract';
import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from './social.integrations.interface';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { NotionDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/notion.dto';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

type NotionDetails = { token: string };

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2026-03-11';
// Notion limits: 2000 characters per rich text item, 100 blocks per request
const NOTION_TEXT_LIMIT = 2000;
const NOTION_BLOCKS_LIMIT = 100;

@Rules(
  'Notion adds the content as a new page in the selected database: the text becomes paragraphs, the attached pictures are added at the end of the page'
)
export class NotionProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 3; // Notion allows about 3 requests per second
  identifier = 'notion';
  name = 'Notion';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;
  dto = NotionDto;

  maxLength() {
    return 100000;
  }

  async customFields() {
    return [
      {
        key: 'token',
        label: 'Internal integration secret',
        validation: `/^\\s*\\S{10,}\\s*$/`,
        type: 'password' as const,
        hint: 'notion.so/profile/integrations, then share your database with the integration',
      },
    ];
  }

  async refreshToken(refreshToken: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  async generateAuthUrl() {
    const state = makeSecureId(6);
    return {
      url: state,
      codeVerifier: makeSecureId(10),
      state,
    };
  }

  override handleErrors(body: string, status: number) {
    if (status === 404) {
      return {
        type: 'bad-body' as const,
        value:
          'Notion could not find the database, share it with the integration (database menu -> Connections)',
      };
    }

    if (status < 400 || status >= 500 || status === 401 || status === 429) {
      return undefined;
    }

    try {
      const error = JSON.parse(body);
      if (error?.message) {
        return {
          type: 'bad-body' as const,
          value: `Notion: ${error.message}`,
        };
      }
    } catch (err) {
      /** not a JSON body **/
    }

    return undefined;
  }

  private headers(token: string) {
    return {
      Authorization: `Bearer ${token.trim()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private details(integration: Integration): NotionDetails {
    return JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );
  }

  private richText(text: string) {
    const chunks: { type: 'text'; text: { content: string } }[] = [];
    for (let i = 0; i < text.length; i += NOTION_TEXT_LIMIT) {
      chunks.push({
        type: 'text',
        text: { content: text.slice(i, i + NOTION_TEXT_LIMIT) },
      });
    }
    return chunks;
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body: NotionDetails = JSON.parse(
      Buffer.from(params.code, 'base64').toString()
    );
    const token = (body.token || '').trim();

    try {
      const response = await fetch(`${NOTION_API}/users/me`, {
        headers: this.headers(token),
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });

      if (!response.ok) {
        return 'Notion rejected the integration secret';
      }

      const bot = await response.json();

      return {
        refreshToken: token,
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: token,
        id: String(bot.id),
        name: bot.bot?.workspace_name || bot.name,
        picture: bot.avatar_url || '',
        username: bot.name || bot.bot?.workspace_name,
      };
    } catch (err) {
      return 'Could not reach Notion, check the integration secret';
    }
  }

  @Tool({
    description: 'List of databases shared with the integration',
    dataSchema: [],
  })
  async databases(
    token: string,
    data: any,
    internalId: string,
    integration: Integration
  ) {
    const { token: apiToken } = this.details(integration);

    // Since 2025-09-03 pages are created in a data source (a database table)
    const { results } = await (
      await this.fetch(`${NOTION_API}/search`, {
        method: 'POST',
        headers: this.headers(apiToken),
        body: JSON.stringify({
          filter: { property: 'object', value: 'data_source' },
          page_size: 100,
        }),
      })
    ).json();

    return (results || []).map((p: any) => ({
      id: p.id,
      name:
        (p.title || []).map((t: any) => t.plain_text).join('') || 'Untitled',
    }));
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<NotionDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const { token } = this.details(integration);
    const [firstPost] = postDetails;
    const dataSourceId = encodeURIComponent(firstPost.settings.database);

    const dataSource = await (
      await this.fetch(`${NOTION_API}/data_sources/${dataSourceId}`, {
        headers: this.headers(token),
      })
    ).json();

    const titleProperty = Object.entries<any>(
      dataSource.properties || {}
    ).find(([, value]) => value.type === 'title')?.[0];

    if (!titleProperty) {
      throw new BadBody(
        this.identifier,
        '{}',
        '{}',
        'Notion: the selected database has no title property'
      );
    }

    const blocks = [
      ...(firstPost.message || '')
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line.trim())
        .map((line) => ({
          object: 'block',
          type: 'paragraph',
          paragraph: { rich_text: this.richText(line) },
        })),
      ...(firstPost.media || [])
        .filter((m) => m.type === 'image')
        .map((m) => ({
          object: 'block',
          type: 'image',
          image: { type: 'external', external: { url: m.path } },
        })),
    ];

    const page = await (
      await this.fetch(`${NOTION_API}/pages`, {
        method: 'POST',
        headers: this.headers(token),
        body: JSON.stringify({
          parent: {
            type: 'data_source_id',
            data_source_id: firstPost.settings.database,
          },
          properties: {
            [titleProperty]: {
              title: this.richText(
                firstPost.settings.title.slice(0, NOTION_TEXT_LIMIT)
              ),
            },
          },
          children: blocks.slice(0, NOTION_BLOCKS_LIMIT),
        }),
      })
    ).json();

    // The rest of a long post is appended to the page 100 blocks at a time
    for (
      let i = NOTION_BLOCKS_LIMIT;
      i < blocks.length;
      i += NOTION_BLOCKS_LIMIT
    ) {
      await this.fetch(`${NOTION_API}/blocks/${page.id}/children`, {
        method: 'PATCH',
        headers: this.headers(token),
        body: JSON.stringify({
          children: blocks.slice(i, i + NOTION_BLOCKS_LIMIT),
        }),
      });
    }

    return [
      {
        id: firstPost.id,
        status: 'completed',
        postId: String(page.id),
        releaseURL: page.url || '',
      },
    ];
  }
}
