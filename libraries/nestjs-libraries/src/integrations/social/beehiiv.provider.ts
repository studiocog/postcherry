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
import { BeehiivDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/beehiiv.dto';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

type BeehiivDetails = { apiKey: string; publicationId: string };

const BEEHIIV_API = 'https://api.beehiiv.com/v2';

@Rules(
  'beehiiv publishes the content as a newsletter post and emails it to the subscribers: pictures go inside the content as <img src="..."> where they should appear, the src must be a picture from the media library (upload it with uploadFromUrlTool first), attachments are not sent'
)
export class BeehiivProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 3;
  identifier = 'beehiiv';
  name = 'beehiiv';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'html' as const;
  dto = BeehiivDto;

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
        hint: 'Settings -> Workspace settings -> API',
      },
      {
        key: 'publicationId',
        label: 'Publication ID',
        validation: `/^\\s*pub_[a-zA-Z0-9-]+\\s*$/`,
        type: 'text' as const,
        hint: 'Shown next to the API keys, starts with pub_',
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
    // Creating posts through the API is limited to some beehiiv plans
    if (status === 403) {
      return {
        type: 'bad-body' as const,
        value:
          'beehiiv refused to create the post: publishing through the API needs a beehiiv plan that includes it (Pro or Enterprise)',
      };
    }

    if (status < 400 || status >= 500 || status === 401 || status === 429) {
      return undefined;
    }

    try {
      const error = JSON.parse(body)?.errors?.[0];
      if (error?.message) {
        return {
          type: 'bad-body' as const,
          value: `beehiiv: ${error.message}`,
        };
      }
    } catch (err) {
      /** not a JSON body **/
    }

    return undefined;
  }

  private headers(apiKey: string) {
    return {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private details(integration: Integration): BeehiivDetails {
    const body: BeehiivDetails = JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );
    return {
      apiKey: body.apiKey.trim(),
      publicationId: body.publicationId.trim(),
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body: BeehiivDetails = JSON.parse(
      Buffer.from(params.code, 'base64').toString()
    );
    const apiKey = (body.apiKey || '').trim();
    const publicationId = (body.publicationId || '').trim();

    try {
      const response = await fetch(
        `${BEEHIIV_API}/publications/${encodeURIComponent(publicationId)}`,
        {
          headers: this.headers(apiKey),
          // @ts-ignore - undici-only option; blocks SSRF to internal IPs
          dispatcher: getSsrfSafeDispatcher(),
        }
      );

      if (response.status === 404) {
        return 'beehiiv could not find this publication, check the Publication ID';
      }

      if (!response.ok) {
        return 'beehiiv rejected the API key';
      }

      const { data } = await response.json();

      return {
        refreshToken: apiKey,
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: apiKey,
        id: String(data.id),
        name: data.name,
        picture: '',
        username: data.organization_name || data.name,
      };
    } catch (err) {
      return 'Could not reach beehiiv, check the API key';
    }
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<BeehiivDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const { apiKey, publicationId } = this.details(integration);
    const [firstPost] = postDetails;

    const thumbnail =
      firstPost.media?.find((m) => m.type === 'image')?.path ||
      /<img[^>]+src="([^"]+)"/i.exec(firstPost.message || '')?.[1];

    const { data } = await (
      await this.fetch(
        `${BEEHIIV_API}/publications/${encodeURIComponent(
          publicationId
        )}/posts`,
        {
          method: 'POST',
          headers: this.headers(apiKey),
          body: JSON.stringify({
            title: firstPost.settings.title,
            ...(firstPost.settings.subtitle
              ? { subtitle: firstPost.settings.subtitle }
              : {}),
            body_content: firstPost.message,
            status: 'confirmed',
            ...(thumbnail ? { thumbnail_image_url: thumbnail } : {}),
          }),
        }
      )
    ).json();

    return [
      {
        id: firstPost.id,
        status: 'completed',
        postId: String(data.id),
        releaseURL: data.web_url || '',
      },
    ];
  }
}
