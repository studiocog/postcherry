import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import {
  BadBody,
  RefreshToken,
  SocialAbstract,
  ValidityMedia,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { PeertubeDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/peertube.dto';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Integration } from '@prisma/client';
import dayjs from 'dayjs';
import FormDataUpload from 'form-data';

type PeertubeDetails = { url: string; username: string; password: string };

type PeertubeLoginError = {
  kind: 'unreachable' | 'credentials' | 'two-factor' | 'other';
  status: number;
  message: string;
};

type PeertubeLogin = { accessToken: string } | PeertubeLoginError;

export class PeertubeProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 2; // video uploads to self-hosted instances
  identifier = 'peertube';
  name = 'PeerTube';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;
  dto = PeertubeDto;

  // PeerTube video descriptions are capped at 10000 characters
  maxLength() {
    return 10000;
  }

  override async checkValidity(
    items: Array<ValidityMedia[]>
  ): Promise<string | true> {
    const [firstItems] = items ?? [];
    if (firstItems?.length !== 1) {
      return 'PeerTube needs exactly one video';
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
    if (body.includes('quota_reached')) {
      return {
        type: 'bad-body',
        value: 'Your PeerTube video quota is reached, free some space and post again',
      };
    }

    if (status === 413) {
      return {
        type: 'bad-body',
        value: 'The video is too large for this PeerTube instance',
      };
    }

    if (status === 415) {
      return {
        type: 'bad-body',
        value: 'This PeerTube instance does not accept this video format',
      };
    }

    if (status === 422) {
      return {
        type: 'bad-body',
        value: 'PeerTube could not read the video file',
      };
    }

    if (status === 408) {
      return {
        type: 'retry',
        value: 'The PeerTube upload timed out, please try again',
      };
    }

    if (status === 403) {
      return {
        type: 'bad-body',
        value: 'PeerTube refused the video, check the channel and that your account can upload',
      };
    }

    return undefined;
  }

  async customFields() {
    return [
      {
        key: 'url',
        label: 'Instance URL',
        defaultValue: '',
        validation: `/^(https?:\\/\\/)(?:\\S+(?::\\S*)?@)?(?:(?:localhost)|(?:\\d{1,3}(?:\\.\\d{1,3}){3})|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63})(?::\\d{2,5})?(?:\\/[^\\s?#]*)?(?:\\?[^\\s#]*)?(?:#[^\\s]*)?$/`,
        type: 'text' as const,
      },
      {
        key: 'username',
        label: 'Username',
        validation: `/^.+$/`,
        type: 'text' as const,
      },
      {
        key: 'password',
        label: 'Password',
        validation: `/^.{3,}$/`,
        type: 'password' as const,
        hint: 'Accounts with two-factor authentication can not be connected',
      },
    ];
  }

  // Not used: PeerTube tokens expire after a day, so every publish logs in
  // again with the stored (encrypted) instance details instead.
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

  private normalizeUrl(url: string) {
    return (url || '').trim().replace(/\/+$/, '');
  }

  private getDetails(integration: Integration): PeertubeDetails {
    const body: PeertubeDetails = JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );
    return { ...body, url: this.normalizeUrl(body.url) };
  }

  // Plain fetch (with the SSRF guard) rather than this.fetch: the token
  // request body holds the password, and this.fetch copies the request body
  // into its errors (Temporal history and the Errors table). Every failure
  // here is described without it.
  private async login(details: PeertubeDetails): Promise<PeertubeLogin> {
    let client: { client_id: string; client_secret: string };
    try {
      const clientResponse = await fetch(
        `${details.url}/api/v1/oauth-clients/local`,
        {
          // @ts-ignore - undici-only option; blocks SSRF to internal IPs
          dispatcher: getSsrfSafeDispatcher(),
        }
      );
      if (!clientResponse.ok) {
        return {
            kind: 'other',
          status: clientResponse.status,
          message: 'This URL does not look like a PeerTube instance',
        };
      }
      client = await clientResponse.json();
    } catch (err) {
      return {
        kind: 'unreachable',
        status: 0,
        message: 'Could not reach the PeerTube instance, check the instance URL',
      };
    }

    if (!client?.client_id || !client?.client_secret) {
      return {
        kind: 'other',
        status: 0,
        message: 'This URL does not look like a PeerTube instance',
      };
    }

    let tokenResponse: Response;
    try {
      tokenResponse = await fetch(`${details.url}/api/v1/users/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: client.client_id,
          client_secret: client.client_secret,
          grant_type: 'password',
          response_type: 'code',
          username: details.username,
          password: details.password,
        }).toString(),
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });
    } catch (err) {
      return {
        kind: 'unreachable',
        status: 0,
        message: 'Could not reach the PeerTube instance, check the instance URL',
      };
    }

    const text = await tokenResponse.text().catch(() => '');

    if (tokenResponse.ok) {
      try {
        const { access_token } = JSON.parse(text);
        if (access_token) {
          return { accessToken: access_token };
        }
      } catch (err) {
        /** handled below **/
      }
      return {
        kind: 'other',
        status: tokenResponse.status,
        message: 'PeerTube did not return an access token',
      };
    }

    if (text.includes('missing_two_factor')) {
      return {
        kind: 'two-factor',
        status: tokenResponse.status,
        message:
          'This PeerTube account uses two-factor authentication, which PostCherry can not use. Connect an account without it',
      };
    }

    if (text.includes('invalid_grant') || tokenResponse.status === 400) {
      return {
        kind: 'credentials',
        status: tokenResponse.status,
        message: 'Invalid PeerTube username or password',
      };
    }

    if (tokenResponse.status === 429) {
      return {
        kind: 'other',
        status: 429,
        message: 'Too many PeerTube login attempts, please try again later',
      };
    }

    return {
      kind: 'other',
      status: tokenResponse.status,
      message: `PeerTube returned an unexpected error (HTTP ${tokenResponse.status})`,
    };
  }

  // Login for publishing / tools: a failed login becomes the matching
  // provider error, built only from the status (never the request body).
  private async accessToken(details: PeertubeDetails) {
    const login = await this.login(details);
    if ('accessToken' in login) {
      return login.accessToken;
    }

    const json = JSON.stringify({ status: login.status, kind: login.kind });

    if (login.kind === 'unreachable') {
      // transient: let Temporal retry the activity, nothing was published
      throw new Error(login.message);
    }

    if (login.kind === 'credentials' || login.kind === 'two-factor') {
      throw new RefreshToken(this.identifier, json, '{}', login.message);
    }

    throw new BadBody(this.identifier, json, '{}', login.message);
  }

  private async me(url: string, accessToken: string) {
    return (
      await this.fetch(
        `${url}/api/v1/users/me`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
        this.identifier
      )
    ).json();
  }

  private pickAvatar(url: string, avatars: any[] = []) {
    const biggest = [...(avatars || [])].sort(
      (a, b) => (b?.width || 0) - (a?.width || 0)
    )[0];
    const path = biggest?.fileUrl || biggest?.path || '';
    if (!path) {
      return '';
    }
    return path.indexOf('http') === 0 ? path : `${url}${path}`;
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body: PeertubeDetails = JSON.parse(
      Buffer.from(params.code, 'base64').toString()
    );
    const details = { ...body, url: this.normalizeUrl(body.url) };

    const login = await this.login(details);
    if (!('accessToken' in login)) {
      return login.message;
    }

    let user: any;
    try {
      const response = await fetch(`${details.url}/api/v1/users/me`, {
        headers: {
          Authorization: `Bearer ${login.accessToken}`,
        },
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });
      user = await response.json();
    } catch (err) {
      return 'Could not read the PeerTube account';
    }

    if (!user?.id) {
      return 'Could not read the PeerTube account';
    }

    if (!user?.videoChannels?.length) {
      return 'This PeerTube account has no channel, create one and connect again';
    }

    return {
      refreshToken: '',
      expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
      accessToken: login.accessToken,
      // user ids are only unique per instance
      id: `${new URL(details.url).host}:${user.id}`,
      name: user.account?.displayName || user.username,
      picture: this.pickAvatar(details.url, user.account?.avatars),
      username: user.username,
    };
  }

  @Tool({ description: 'List of the account video channels', dataSchema: [] })
  async channels(
    token: string,
    data: any,
    internalId: string,
    integration: Integration
  ) {
    const details = this.getDetails(integration);
    const user = await this.me(details.url, await this.accessToken(details));

    return (user?.videoChannels || []).map((channel: any) => ({
      id: String(channel.id),
      name: channel.displayName || channel.name,
    }));
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<PeertubeDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const details = this.getDetails(integration);
    const token = await this.accessToken(details);

    let channelId = firstPost.settings?.channel;
    if (!channelId) {
      const user = await this.me(details.url, token);
      channelId = String(user?.videoChannels?.[0]?.id || '');
    }

    if (!channelId) {
      throw new BadBody(
        this.identifier,
        '{}',
        '{}',
        'This PeerTube account has no channel to upload to'
      );
    }

    const [video] = firstPost.media || [];
    const description = (firstPost.message || '').trim();

    // Streams the video from storage into PeerTube's single-request upload.
    // Rebuilt per attempt by runStreamedUpload since a consumed stream can't
    // be replayed.
    const uploaded = await this.runStreamedUpload<{
      video: { id: number; uuid: string; shortUUID: string };
    }>(async () => {
      const fileSize = await this.mediaSize(video.path, this.identifier);
      const stream = await this.mediaStream(video.path, this.identifier);

      const form = new FormDataUpload();
      form.append('channelId', String(channelId));
      form.append('name', firstPost.settings.title);
      form.append('privacy', '1'); // public
      form.append('waitTranscoding', 'true');
      // PeerTube rejects descriptions shorter than 3 characters
      if (description.length >= 3) {
        form.append('description', description);
      }
      form.append('videofile', stream, {
        filename: video.path.split('/').pop()?.split('?')[0] || 'video.mp4',
        knownLength: fileSize,
      });

      const { data } = await this.getSsrfSafeAxios().post(
        `${details.url}/api/v1/videos/upload`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${token}`,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );

      return data;
    }, this.identifier);

    return [
      {
        id: firstPost.id,
        postId: String(uploaded.video.id),
        releaseURL: `${details.url}/w/${
          uploaded.video.shortUUID || uploaded.video.uuid
        }`,
        status: 'completed',
      },
    ];
  }
}
