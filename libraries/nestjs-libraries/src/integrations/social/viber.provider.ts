import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import {
  BadBody,
  RefreshToken,
  SocialAbstract,
  ValidityMedia,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { timer } from '@gitroom/helpers/utils/timer';
import { setHeartbeatDetails } from '@gitroom/nestjs-libraries/temporal/temporal.heartbeat';
import dayjs from 'dayjs';

const VIBER_API = 'https://chatapi.viber.com/pa';
const MAX_CAPTION = 768;
const MAX_PICTURE_SIZE = 1024 * 1024; // picture messages: JPEG up to 1 MB
const MAX_MEDIA_SIZE = 50 * 1024 * 1024; // video and file messages: up to 50 MB

type ViberResponse = {
  status: number;
  status_message?: string;
  message_token?: number | string;
  [key: string]: any;
};

type ViberMedia = {
  path: string;
  thumbnail?: string;
  size: number;
  video: boolean;
};

@Rules(
  'Viber Channels accept text, JPEG pictures and MP4 videos up to 50 MB, a picture caption is limited to 768 characters'
)
export class ViberProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 3;
  identifier = 'viber';
  name = 'Viber';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;
  // Viber picture messages only take JPEG
  convertToJPEG = true;
  toolTip =
    'Only a super admin of the Viber Channel can get its token: Channel info > Developer tools > copy token.';

  maxLength() {
    return 7000;
  }

  override async checkValidity(
    posts: Array<ValidityMedia[]>
  ): Promise<string | true> {
    if (
      posts?.some((p) =>
        p?.some(
          (a) =>
            !hasExtension(a?.path, 'mp4') &&
            !hasExtension(a?.path, 'jpg') &&
            !hasExtension(a?.path, 'jpeg') &&
            !hasExtension(a?.path, 'png')
        )
      )
    ) {
      return 'Viber only accepts JPEG or PNG pictures and MP4 videos.';
    }

    return true;
  }

  async customFields() {
    return [
      {
        key: 'token',
        label: 'Channel authentication token',
        validation: `/^\\S{10,}$/`,
        type: 'password' as const,
        hint: 'In the Viber app: your Channel > Channel info > Developer tools > copy token (super admins only)',
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

  // Plain fetch rather than this.fetch: the Channels API takes the token in
  // the JSON body, and this.fetch copies the request body into its errors
  // (Temporal history and the Errors table). Every failure here is described
  // without it.
  private async request(
    endpoint: string,
    token: string,
    data: Record<string, any> = {},
    attempt = 0
  ): Promise<ViberResponse> {
    setHeartbeatDetails(`fetch ${VIBER_API}/${endpoint}`);

    const response = await fetch(`${VIBER_API}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Viber-Auth-Token': token,
      },
      body: JSON.stringify({ auth_token: token, ...data }),
    });

    const text = await response.text().catch(() => '');

    if (response.ok) {
      try {
        return JSON.parse(text);
      } catch (err) {
        throw new BadBody(
          this.identifier,
          JSON.stringify({ status: response.status }),
          '{}',
          'Viber returned an invalid response'
        );
      }
    }

    // same transient handling as this.fetch
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await timer(5000);
      return this.request(endpoint, token, data, attempt + 1);
    }

    throw new BadBody(
      this.identifier,
      JSON.stringify({ status: response.status, body: text.slice(0, 1000) }),
      '{}',
      `Viber returned an unexpected error (HTTP ${response.status})`
    );
  }

  // Only a superadmin can be the sender of a Channel post
  private superAdmin(account: ViberResponse) {
    return (account?.members || []).find(
      (m: any) => m?.role === 'superadmin'
    );
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    try {
      const body: { token: string } = JSON.parse(
        Buffer.from(params.code, 'base64').toString()
      );
      const token = (body.token || '').trim();

      const account = await this.request('get_account_info', token);
      if (account.status !== 0) {
        return account.status === 2 || account.status === 8
          ? 'Invalid channel token, please copy it again from Channel info > Developer tools'
          : `Viber refused the connection: ${account.status_message || 'unknown error'}`;
      }

      if (!this.superAdmin(account)) {
        return 'No super admin found for this Channel, only a Channel super admin can post with the API';
      }

      const id = String(account.id || account.Id || '');
      if (!id) {
        return 'Could not read the Viber Channel, please check the token';
      }

      const name = account.name || account.chat_hostname || 'Viber Channel';
      const uri = String(account.uri || '');

      return {
        refreshToken: '',
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: token,
        id,
        name,
        picture: account.icon || '',
        username: uri && !uri.startsWith('http') ? uri : name,
      };
    } catch (err) {
      return 'Invalid channel token, please copy it again from Channel info > Developer tools';
    }
  }

  private fail(response: ViberResponse): never {
    const json = JSON.stringify(response);
    const reason = response.status_message || 'unknown error';

    switch (response.status) {
      case 2:
      case 8:
        throw new RefreshToken(
          this.identifier,
          json,
          '{}',
          'The Viber channel token is no longer valid, please reconnect the channel with a new token.'
        );
      case 7:
        throw new BadBody(
          this.identifier,
          json,
          '{}',
          'This Viber Channel is blocked, so the post was not sent.'
        );
      case 9:
        throw new BadBody(
          this.identifier,
          json,
          '{}',
          'This Viber Channel is suspended, so the post was not sent.'
        );
      case 12:
        throw new BadBody(
          this.identifier,
          json,
          '{}',
          'Viber rate limit reached, please try again later.'
        );
      default:
        throw new BadBody(
          this.identifier,
          json,
          '{}',
          `Viber rejected the post: ${reason}`
        );
    }
  }

  // Viber answers HTTP 200 with a status code in the body (0 = ok)
  private async send(
    token: string,
    message: Record<string, any>,
    attempt = 0
  ): Promise<ViberResponse> {
    const response = await this.request('post', token, message);

    if (response.status === 0) {
      return response;
    }

    // tooManyRequests: Viber did not take the message, wait and resend
    if (response.status === 12 && attempt < 2) {
      await timer(5000);
      return this.send(token, message, attempt + 1);
    }

    // webhookNotSet: Channels must have a webhook before they can post. It
    // is only set when missing, so a webhook the user already has is kept.
    if (response.status === 10 && attempt < 2) {
      const webhook = await this.request('set_webhook', token, {
        url: `${process.env.NEXT_PUBLIC_BACKEND_URL}/public/viber/webhook`,
      });

      if (webhook.status !== 0) {
        throw new BadBody(
          this.identifier,
          JSON.stringify(webhook),
          '{}',
          'Viber needs a webhook for this Channel and PostCherry could not set it, please try again later.'
        );
      }

      return this.send(token, message, 2);
    }

    return this.fail(response);
  }

  private fileName(path: string) {
    return (path.split('?')[0].split('/').pop() || 'file').slice(-256);
  }

  private mediaMessage(media: ViberMedia, caption: string) {
    if (media.video) {
      return {
        type: 'video',
        media: media.path,
        size: media.size,
        // thumbnails must be JPEG (max 100 KB)
        ...(media.thumbnail &&
        (hasExtension(media.thumbnail, 'jpg') ||
          hasExtension(media.thumbnail, 'jpeg'))
          ? { thumbnail: media.thumbnail }
          : {}),
      };
    }

    const isJpeg =
      hasExtension(media.path, 'jpg') || hasExtension(media.path, 'jpeg');
    if (isJpeg && media.size <= MAX_PICTURE_SIZE) {
      return { type: 'picture', media: media.path, text: caption };
    }

    // larger (or non JPEG) pictures go as a file, which allows up to 50 MB
    return {
      type: 'file',
      media: media.path,
      size: media.size,
      file_name: this.fileName(media.path),
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;

    const account = await this.request('get_account_info', accessToken);
    if (account.status !== 0) {
      this.fail(account);
    }

    const sender = this.superAdmin(account);
    if (!sender?.id) {
      throw new BadBody(
        this.identifier,
        '{}',
        '{}',
        'This Viber Channel has no super admin, only a super admin can post with the API.'
      );
    }

    // Sizes are read before anything is sent, so a file Viber cannot take
    // fails the post without publishing half of it
    const media: ViberMedia[] = [];
    for (const item of firstPost.media || []) {
      const size = await this.mediaSize(item.path, this.identifier);
      if (size > MAX_MEDIA_SIZE) {
        throw new BadBody(
          this.identifier,
          JSON.stringify({ size }),
          '{}',
          'Viber accepts media files up to 50 MB.'
        );
      }

      media.push({
        path: item.path,
        thumbnail: item.thumbnail,
        size,
        video: hasExtension(item.path, 'mp4'),
      });
    }

    const text = (firstPost.message || '').trim();
    const from = sender.id;

    const single = media.length === 1 ? this.mediaMessage(media[0], text) : null;
    const captioned =
      single?.type === 'picture' && text.length <= MAX_CAPTION ? single : null;

    let messageToken: string | undefined;
    if (captioned) {
      const sent = await this.send(accessToken, { from, ...captioned });
      messageToken = String(sent.message_token || '');
    } else {
      if (text) {
        const sent = await this.send(accessToken, {
          from,
          type: 'text',
          text,
        });
        messageToken = String(sent.message_token || '');
      }

      for (const item of media) {
        const sent = await this.send(accessToken, {
          from,
          ...this.mediaMessage(item, ''),
        });
        messageToken = messageToken || String(sent.message_token || '');
      }
    }

    const uri = String(account.uri || '');

    return [
      {
        id: firstPost.id,
        postId: messageToken || makeSecureId(10),
        releaseURL: uri.startsWith('https://') ? uri : '',
        status: 'completed',
      },
    ];
  }
}
