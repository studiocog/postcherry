import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { SocialAbstract } from '../social.abstract';
import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from './social.integrations.interface';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { sign } from 'jsonwebtoken';
import { GhostDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/ghost.dto';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

type GhostDetails = { url: string; apiKey: string };

const GHOST_ACCEPT_VERSION = 'v5.0';

@Rules(
  'Ghost publishes the content as a blog post: pictures go inside the content as <img src="..."> where they should appear, the src must be a picture from the media library (upload it with uploadFromUrlTool first), the first picture becomes the feature image'
)
export class GhostProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 5; // Ghost sites are the customer's own servers
  identifier = 'ghost';
  name = 'Ghost';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'html' as const;
  dto = GhostDto;

  maxLength() {
    return 100000;
  }

  inlineImages() {
    return true;
  }

  async customFields() {
    return [
      {
        key: 'url',
        label: 'Site URL',
        validation: `/^https?:\\/\\/(?:www\\.)?[\\w\\-]+(\\.[\\w\\-]+)+([\\/?#][^\\s]*)?$/`,
        type: 'text' as const,
      },
      {
        key: 'apiKey',
        label: 'Admin API key',
        validation: `/^\\s*[a-fA-F0-9]{24}:[a-fA-F0-9]{64}\\s*$/`,
        type: 'password' as const,
        hint: 'Ghost Admin -> Settings -> Integrations -> Add custom integration',
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
    if (status < 400 || status >= 500 || status === 401 || status === 429) {
      return undefined;
    }

    try {
      const error = JSON.parse(body)?.errors?.[0];
      if (error?.message) {
        return {
          type: 'bad-body' as const,
          value: `Ghost: ${[error.message, error.context]
            .filter(Boolean)
            .join(' ')}`,
        };
      }
    } catch (err) {
      /** not a JSON body **/
    }

    return undefined;
  }

  // Users paste the site address with a trailing slash or the /ghost admin path
  private normalizeUrl(url: string) {
    return url
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/ghost$/i, '');
  }

  // Admin API JWT: HS256, kid = key id, aud /admin/, 5 minutes, secret is hex
  private adminToken(apiKey: string) {
    const [id, secret] = apiKey.trim().split(':');
    return sign({}, Buffer.from(secret, 'hex'), {
      keyid: id,
      algorithm: 'HS256',
      expiresIn: '5m',
      audience: '/admin/',
    });
  }

  private headers(apiKey: string) {
    return {
      Authorization: `Ghost ${this.adminToken(apiKey)}`,
      'Accept-Version': GHOST_ACCEPT_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private details(integration: Integration): GhostDetails {
    const body: GhostDetails = JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );
    return { url: this.normalizeUrl(body.url), apiKey: body.apiKey.trim() };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body: GhostDetails = JSON.parse(
      Buffer.from(params.code, 'base64').toString()
    );
    const url = this.normalizeUrl(body.url || '');
    const apiKey = (body.apiKey || '').trim();

    if (!/^[a-fA-F0-9]{24}:[a-fA-F0-9]{64}$/.test(apiKey)) {
      return 'The Admin API key must look like id:secret, copy it from Ghost Admin -> Settings -> Integrations';
    }

    try {
      // An authenticated read proves the key, /site/ alone is public
      const check = await fetch(
        `${url}/ghost/api/admin/posts/?limit=1&fields=id`,
        {
          headers: this.headers(apiKey),
          // @ts-ignore - undici-only option; blocks SSRF to internal IPs
          dispatcher: getSsrfSafeDispatcher(),
        }
      );

      if (check.status === 401 || check.status === 403) {
        return 'Ghost rejected the Admin API key';
      }

      if (!check.ok) {
        return `Could not reach the Ghost Admin API (HTTP ${check.status}), check the Site URL`;
      }

      const site = await (
        await fetch(`${url}/ghost/api/admin/site/`, {
          headers: this.headers(apiKey),
          // @ts-ignore - undici-only option; blocks SSRF to internal IPs
          dispatcher: getSsrfSafeDispatcher(),
        })
      ).json();

      const siteUrl = this.normalizeUrl(site?.site?.url || url);

      return {
        refreshToken: apiKey,
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: apiKey,
        id: siteUrl,
        name: site?.site?.title || siteUrl,
        picture: site?.site?.icon || site?.site?.logo || '',
        username: siteUrl.replace(/^https?:\/\//, ''),
      };
    } catch (err) {
      return 'Could not reach your Ghost site, check the Site URL';
    }
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<GhostDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const { url, apiKey } = this.details(integration);
    const [firstPost] = postDetails;

    const featureImage =
      firstPost.media?.find((m) => m.type === 'image')?.path ||
      /<img[^>]+src="([^"]+)"/i.exec(firstPost.message || '')?.[1];

    const tags = (firstPost.settings.tags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    const { posts } = await (
      await this.fetch(`${url}/ghost/api/admin/posts/?source=html`, {
        method: 'POST',
        headers: this.headers(apiKey),
        body: JSON.stringify({
          posts: [
            {
              title: firstPost.settings.title,
              html: firstPost.message,
              status: 'published',
              ...(featureImage ? { feature_image: featureImage } : {}),
              ...(tags.length ? { tags } : {}),
            },
          ],
        }),
      })
    ).json();

    return [
      {
        id: firstPost.id,
        status: 'completed',
        postId: String(posts[0].id),
        releaseURL: posts[0].url || '',
      },
    ];
  }
}
