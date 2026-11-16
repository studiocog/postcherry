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
import { KitDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/kit.dto';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

type KitDetails = { apiKey: string };

const KIT_API = 'https://api.kit.com/v4';

@Rules(
  'Kit sends the content as a broadcast email to all subscribers and publishes it on the web: pictures go inside the content as <img src="..."> where they should appear, the src must be a picture from the media library (upload it with uploadFromUrlTool first), attachments are not sent'
)
export class KitProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 5; // Kit allows 120 requests per minute per key
  identifier = 'kit';
  name = 'Kit';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'html' as const;
  dto = KitDto;

  maxLength() {
    return 100000;
  }

  inlineImages() {
    return true;
  }

  async customFields() {
    return [
      {
        key: 'apiKey',
        label: 'API key',
        validation: `/^\\s*\\S{10,}\\s*$/`,
        type: 'password' as const,
        hint: 'Settings -> Developer -> API keys (v4 key)',
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
    if (status === 403) {
      return {
        type: 'bad-body' as const,
        value: 'Kit: this account is not allowed to create broadcasts',
      };
    }

    if (status < 400 || status >= 500 || status === 401 || status === 429) {
      return undefined;
    }

    try {
      const errors = JSON.parse(body)?.errors;
      if (Array.isArray(errors) && errors.length) {
        return {
          type: 'bad-body' as const,
          value: `Kit: ${errors.join(', ')}`,
        };
      }
    } catch (err) {
      /** not a JSON body **/
    }

    return undefined;
  }

  private headers(apiKey: string) {
    return {
      'X-Kit-Api-Key': apiKey.trim(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private details(integration: Integration): KitDetails {
    return JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body: KitDetails = JSON.parse(
      Buffer.from(params.code, 'base64').toString()
    );
    const apiKey = (body.apiKey || '').trim();

    try {
      const response = await fetch(`${KIT_API}/account`, {
        headers: this.headers(apiKey),
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });

      if (!response.ok) {
        return 'Kit rejected the API key, make sure it is a v4 API key';
      }

      const { account, user } = await response.json();

      return {
        refreshToken: apiKey,
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: apiKey,
        id: `kit:${account.id}`,
        name: account.name || user?.email,
        picture: '',
        username: account.primary_email_address || user?.email || account.name,
      };
    } catch (err) {
      return 'Could not reach Kit, check the API key';
    }
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<KitDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const { apiKey } = this.details(integration);
    const [firstPost] = postDetails;
    const now = new Date().toISOString();

    const thumbnail =
      firstPost.media?.find((m) => m.type === 'image')?.path ||
      /<img[^>]+src="([^"]+)"/i.exec(firstPost.message || '')?.[1];

    // No subscriber_filter: the broadcast goes to every subscriber
    const { broadcast } = await (
      await this.fetch(`${KIT_API}/broadcasts`, {
        method: 'POST',
        headers: this.headers(apiKey),
        body: JSON.stringify({
          subject: firstPost.settings.subject,
          description: firstPost.settings.subject,
          preview_text: firstPost.settings.preview || '',
          content: firstPost.message,
          public: true,
          published_at: now,
          send_at: now,
          ...(thumbnail ? { thumbnail_url: thumbnail } : {}),
        }),
      })
    ).json();

    return [
      {
        id: firstPost.id,
        status: 'completed',
        postId: String(broadcast.id),
        releaseURL: broadcast.public_url || '',
      },
    ];
  }
}
