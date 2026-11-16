import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import {
  SocialAbstract,
  ValidityMedia,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { VimeoDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/vimeo.dto';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Integration } from '@prisma/client';
import dayjs from 'dayjs';

const VIMEO_API = 'https://api.vimeo.com';
const VIMEO_ACCEPT = 'application/vnd.vimeo.*+json;version=3.4';

export class VimeoProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 3;
  identifier = 'vimeo';
  name = 'Vimeo';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;
  dto = VimeoDto;

  maxLength() {
    return 5000;
  }

  override async checkValidity(
    items: Array<ValidityMedia[]>
  ): Promise<string | true> {
    const [firstItems] = items ?? [];
    if (firstItems?.length !== 1) {
      return 'Vimeo needs exactly one video';
    }
    if ((firstItems?.[0]?.path?.indexOf?.('mp4') ?? -1) === -1) {
      return 'Item must be a video';
    }
    return true;
  }

  override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    // 4101 / 4102: storage or weekly upload quota reached
    if (body.includes('"error_code":4101') || body.includes('"error_code":4102')) {
      return {
        type: 'bad-body',
        value: 'Your Vimeo upload quota is reached, free some space or wait for the quota to reset',
      };
    }

    // Any other 403 on upload is a permission problem, most often a token
    // generated without the Upload scope.
    if (status === 403) {
      return {
        type: 'bad-body',
        value:
          'Vimeo refused the upload, make sure the token has the Upload scope (generate a new one and reconnect the channel)',
      };
    }

    if (body.includes('"error_code":8002') || body.includes('"error_code":8003')) {
      return {
        type: 'refresh-token',
        value: 'The Vimeo token is no longer valid, please reconnect the channel',
      };
    }

    return undefined;
  }

  async customFields() {
    return [
      {
        key: 'token',
        label: 'Personal access token',
        validation: `/^.{8,}$/`,
        type: 'password' as const,
        hint: 'developer.vimeo.com > My apps > Generate an access token with the Public, Private, Upload and Edit scopes',
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

  private getToken(integration: Integration) {
    const body: { token: string } = JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );
    return body.token.trim();
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body: { token: string } = JSON.parse(
      Buffer.from(params.code, 'base64').toString()
    );
    const token = (body.token || '').trim();

    // /oauth/verify returns the token scopes together with its user, so a
    // token without the upload scope is caught here instead of on the first
    // publish.
    let response: Response;
    try {
      response = await fetch(`${VIMEO_API}/oauth/verify`, {
        headers: {
          Accept: VIMEO_ACCEPT,
          Authorization: `Bearer ${token}`,
        },
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });
    } catch (err) {
      return 'Could not reach Vimeo, please try again';
    }

    if (response.status === 401) {
      return 'Vimeo rejected the access token, check it and try again';
    }

    if (!response.ok) {
      return `Vimeo returned an unexpected error (HTTP ${response.status})`;
    }

    const auth = await response.json().catch(() => ({} as any));
    const scopes = String(auth?.scope || '').split(/[\s,]+/);
    if (!scopes.includes('upload')) {
      return 'The Vimeo token is missing the Upload scope, generate a new one with the Public, Private, Upload and Edit scopes';
    }

    const user = auth?.user;
    if (!user?.uri) {
      return 'Vimeo did not return the account of this token';
    }

    const sizes = [...(user.pictures?.sizes || [])].sort(
      (a: any, b: any) => (b?.width || 0) - (a?.width || 0)
    );

    return {
      refreshToken: '',
      expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
      accessToken: token,
      id: `vimeo:${String(user.uri).split('/').pop()}`,
      name: user.name || '',
      picture: sizes[0]?.link || '',
      username: String(user.link || '').split('/').pop() || user.name || '',
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<VimeoDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const [video] = firstPost.media || [];
    const token = this.getToken(integration);

    // "pull" upload: Vimeo downloads the video from its public URL itself, so
    // nothing is streamed through PostCherry.
    const size = await this.mediaSize(video.path, this.identifier);

    const created = await (
      await this.fetch(
        `${VIMEO_API}/me/videos`,
        {
          method: 'POST',
          headers: {
            Accept: VIMEO_ACCEPT,
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            upload: {
              approach: 'pull',
              size: String(size),
              link: video.path,
            },
            name: firstPost.settings.title,
            ...(firstPost.message?.trim()
              ? { description: firstPost.message }
              : {}),
            privacy: { view: 'anybody' },
          }),
        },
        this.identifier
      )
    ).json();

    return [
      {
        id: firstPost.id,
        postId: String(created.uri || '').split('/').pop() || '',
        releaseURL: created.link || '',
        status: 'completed',
      },
    ];
  }
}
