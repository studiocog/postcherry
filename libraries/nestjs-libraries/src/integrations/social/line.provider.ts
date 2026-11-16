import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import {
  SocialAbstract,
  ValidityMedia,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { Integration } from '@prisma/client';
import { createHash } from 'crypto';
import dayjs from 'dayjs';

const LINE_API = 'https://api.line.me/v2/bot';
// A broadcast takes at most 5 message objects: the text plus 4 media
const MAX_MEDIA = 4;

@Rules(
  'LINE broadcasts the post to every friend of the LINE Official Account: up to 4 attachments, pictures must be JPEG or PNG and videos MP4, it can also be without attachments'
)
export class LineProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 2; // Broadcast is limited to 60 requests per hour
  identifier = 'line';
  name = 'LINE';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;
  toolTip =
    'Posts are sent as a broadcast to every friend of the LINE Official Account, and each one counts against the monthly messages of your LINE plan.';

  maxLength() {
    return 5000;
  }

  override async checkValidity(
    posts: Array<ValidityMedia[]>
  ): Promise<string | true> {
    if (posts?.some((p) => (p?.length ?? 0) > MAX_MEDIA)) {
      return `LINE can send up to ${MAX_MEDIA} pictures or videos in one post.`;
    }

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
      return 'LINE only accepts JPEG or PNG pictures and MP4 videos.';
    }

    return true;
  }

  async customFields() {
    return [
      {
        key: 'token',
        label: 'Channel access token (long-lived)',
        validation: `/^\\S{20,}$/`,
        type: 'password' as const,
        hint: 'LINE Developers console > your Messaging API channel > Messaging API tab > Channel access token (long-lived)',
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

      const { userId, displayName, pictureUrl, basicId } = await (
        await this.fetch(`${LINE_API}/info`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      ).json();

      if (!userId) {
        return 'Could not read the LINE Official Account, please check the channel access token';
      }

      return {
        refreshToken: '',
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: token,
        id: userId,
        name: displayName || basicId || 'LINE',
        picture: pictureUrl || '',
        username: basicId || '',
      };
    } catch (err) {
      return 'Invalid channel access token, please copy the long-lived channel access token of your Messaging API channel';
    }
  }

  override handleErrors(
    body: string,
    status: number
  ):
    | {
        type: 'refresh-token' | 'bad-body' | 'retry' | 'disconnect';
        value: string;
      }
    | undefined {
    if (body.includes('You have reached your monthly limit')) {
      return {
        type: 'bad-body',
        value:
          'This LINE Official Account used up its monthly message limit, so the post was not sent. Upgrade the LINE plan or wait for next month.',
      };
    }

    if (body.includes('The API rate limit has been exceeded')) {
      return {
        type: 'bad-body',
        value:
          'LINE allows 60 broadcasts per hour, please try again later.',
      };
    }

    if (status === 401) {
      return {
        type: 'refresh-token',
        value:
          'The LINE channel access token is no longer valid, please reconnect the channel with a new long-lived token.',
      };
    }

    if (status === 403) {
      return {
        type: 'bad-body',
        value:
          'LINE refused the broadcast, please check that the Messaging API is still enabled for this Official Account.',
      };
    }

    if (status === 409) {
      return {
        type: 'bad-body',
        value: 'LINE already accepted this broadcast',
      };
    }

    if (status === 400) {
      return {
        type: 'bad-body',
        value: `LINE rejected the post: ${this.describeError(body)}`,
      };
    }

    return undefined;
  }

  // LINE errors look like { message, details: [{ message, property }] }
  private describeError(body: string) {
    try {
      const { message, details } = JSON.parse(body);
      const list = (details || [])
        .map((d: any) => [d?.property, d?.message].filter(Boolean).join(' '))
        .filter(Boolean);
      return [message, ...list].filter(Boolean).join(', ') || 'invalid post';
    } catch (err) {
      return 'invalid post';
    }
  }

  // The same post always gets the same retry key, so a retried request (or a
  // retried activity, within LINE's 24 hours window) is never broadcast twice.
  private retryKey(postId: string) {
    const hex = createHash('sha256').update(`line:${postId}`).digest('hex');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      `4${hex.slice(13, 16)}`,
      `${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}`,
      hex.slice(20, 32),
    ].join('-');
  }

  private buildMessages(post: PostDetails) {
    const media = post.media || [];
    const videoLinks: string[] = [];

    const mediaMessages = media.flatMap((m) => {
      if (hasExtension(m.path, 'mp4')) {
        if (!m.thumbnail) {
          videoLinks.push(m.path);
          return [];
        }

        return [
          {
            type: 'video',
            originalContentUrl: m.path,
            previewImageUrl: m.thumbnail,
          },
        ];
      }

      return [
        {
          type: 'image',
          originalContentUrl: m.path,
          previewImageUrl: m.path,
        },
      ];
    });

    const text = [post.message?.trim(), ...videoLinks]
      .filter(Boolean)
      .join('\n\n');

    return [
      ...(text ? [{ type: 'text', text }] : []),
      ...mediaMessages,
    ].slice(0, 5);
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const retryKey = this.retryKey(firstPost.id);

    let requestId = retryKey;
    try {
      const response = await this.fetch(
        `${LINE_API}/message/broadcast`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'X-Line-Retry-Key': retryKey,
          },
          body: JSON.stringify({
            messages: this.buildMessages(firstPost),
          }),
        },
        this.identifier
      );
      requestId = response.headers.get('x-line-request-id') || retryKey;
    } catch (err: any) {
      // 409: a previous attempt with this retry key was already broadcast
      if (
        !String(err?.details?.[0]?.json || '').includes(
          'retry key is already accepted'
        )
      ) {
        throw err;
      }
    }

    const basicId = (integration?.profile || '').replace('@', '');

    return [
      {
        id: firstPost.id,
        postId: requestId,
        releaseURL: basicId ? `https://page.line.me/${basicId}` : '',
        status: 'completed',
      },
    ];
  }
}
