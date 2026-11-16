import { createHash } from 'crypto';
import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import FormDataUpload from 'form-data';

type ZulipFields = {
  server: string;
  email: string;
  apiKey: string;
  stream: string;
  topic: string;
};

@Rules(
  'Zulip posts the text into a channel topic and renders Markdown, maximum 10000 characters; pictures and videos are uploaded to Zulip and shown under the text'
)
export class ZulipProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 10;
  identifier = 'zulip';
  name = 'Zulip';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;

  maxLength() {
    return 10000;
  }

  async customFields() {
    return [
      {
        key: 'server',
        label: 'Zulip URL',
        defaultValue: 'https://',
        validation: `/^https:\\/\\/[^\\s\\/]+(\\/\\S*)?$/`,
        type: 'text' as const,
        hint: 'The address of your organization, for example https://yourteam.zulipchat.com',
      },
      {
        key: 'email',
        label: 'Bot email',
        validation: `/^\\S+@\\S+$/`,
        type: 'text' as const,
        hint: 'Personal settings > Bots > Add a new bot (type "Incoming webhook" or "Generic"), then copy its email',
      },
      {
        key: 'apiKey',
        label: 'Bot API key',
        validation: `/^\\S{8,}$/`,
        type: 'password' as const,
        hint: 'Personal settings > Bots, the API key of the bot',
      },
      {
        key: 'stream',
        label: 'Channel',
        validation: `/^.{1,60}$/`,
        type: 'text' as const,
        hint: 'The channel (stream) name, without #. Subscribe the bot to it if it is private',
      },
      {
        key: 'topic',
        label: 'Topic',
        validation: `/^.{1,60}$/`,
        type: 'text' as const,
      },
    ];
  }

  override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    if (
      body.includes('Invalid API key') ||
      body.includes('USER_DEACTIVATED') ||
      body.includes('Account is deactivated')
    ) {
      return {
        type: 'refresh-token',
        value:
          'The Zulip bot API key is no longer valid, please reconnect the channel',
      };
    }

    if (
      body.includes('STREAM_DOES_NOT_EXIST') ||
      body.includes('Invalid channel') ||
      body.includes('Invalid stream')
    ) {
      return {
        type: 'bad-body',
        value: 'The Zulip channel no longer exists or the bot cannot see it',
      };
    }

    if (
      body.includes('Not authorized to send to channel') ||
      body.includes('Not authorized to send to stream')
    ) {
      return {
        type: 'bad-body',
        value: 'The Zulip bot is not allowed to post in this channel',
      };
    }

    if (status === 413 || body.includes('Uploaded file is larger')) {
      return {
        type: 'bad-body',
        value: 'The media is larger than this Zulip server allows',
      };
    }

    if (body.includes('RATE_LIMIT_HIT')) {
      return {
        type: 'retry',
        value: 'Zulip rate limit reached, please try again later',
      };
    }

    return undefined;
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

  private server(fields: ZulipFields) {
    return fields.server.trim().replace(/\/+$/, '');
  }

  private authorization(fields: ZulipFields) {
    return `Basic ${Buffer.from(
      `${fields.email.trim()}:${fields.apiKey.trim()}`
    ).toString('base64')}`;
  }

  private async streamId(fields: ZulipFields): Promise<number> {
    const { stream_id } = await (
      await this.fetch(
        `${this.server(
          fields
        )}/api/v1/get_stream_id?stream=${encodeURIComponent(
          fields.stream.trim()
        )}`,
        { headers: { Authorization: this.authorization(fields) } },
        this.identifier
      )
    ).json();

    return stream_id;
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    let fields: ZulipFields;
    try {
      fields = JSON.parse(Buffer.from(params.code, 'base64').toString());
      if (new URL(fields.server.trim()).protocol !== 'https:') {
        return 'The Zulip URL must start with https://';
      }
    } catch (err) {
      return 'Invalid Zulip URL';
    }

    let me: { email: string; full_name: string; avatar_url?: string };
    try {
      me = await (
        await this.fetch(`${this.server(fields)}/api/v1/users/me`, {
          headers: { Authorization: this.authorization(fields) },
        })
      ).json();
    } catch (err) {
      return 'Invalid Zulip URL, bot email or API key';
    }

    let streamId: number;
    try {
      streamId = await this.streamId(fields);
    } catch (err) {
      return `Channel "${fields.stream.trim()}" was not found, or the bot cannot see it`;
    }

    const topic = fields.topic.trim();
    const avatar = me.avatar_url || '';

    return {
      // the same channel and topic is the same destination (topics ignore case)
      id: createHash('sha256')
        .update(`${this.server(fields)}|${streamId}|${topic.toLowerCase()}`)
        .digest('hex')
        .slice(0, 24),
      name: `#${fields.stream.trim()} > ${topic}`,
      // the key stays in customInstanceDetails
      accessToken: String(streamId),
      refreshToken: String(streamId),
      expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
      picture:
        avatar.indexOf('/') === 0 ? `${this.server(fields)}${avatar}` : avatar,
      username: me.email,
    };
  }

  // Streams each file into user_uploads (Discord style), returns its Markdown
  private async upload(
    fields: ZulipFields,
    media: NonNullable<PostDetails['media']>[number],
    index: number
  ) {
    const filename =
      media.path.split('/').pop()?.split('?')[0] || `media-${index + 1}`;

    const data = await this.runStreamedUpload(async () => {
      const form = new FormDataUpload();
      form.append(
        'filename',
        await this.mediaStream(media.path, this.identifier),
        {
          filename,
          knownLength: await this.mediaSize(media.path, this.identifier),
        }
      );

      return (
        await this.getSsrfSafeAxios().post(
          `${this.server(fields)}/api/v1/user_uploads`,
          form,
          {
            headers: {
              ...form.getHeaders(),
              Authorization: this.authorization(fields),
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          }
        )
      ).data;
    }, this.identifier);

    // url since Zulip 9.0, uri before
    return `[${filename}](${data.url || data.uri})`;
  }

  // Zulip's hash encoding for narrow links
  private encodeHash(value: string) {
    return encodeURIComponent(value).replace(
      /[%().]/g,
      (char) =>
        (({ '%': '.', '(': '.28', ')': '.29', '.': '.2E' } as any)[char])
    );
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const fields: ZulipFields = JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );

    // the stream id saved on connect (as the token) survives a channel rename
    const streamId = Number(accessToken) || (await this.streamId(fields));

    const uploads: string[] = [];
    for (const [index, media] of (firstPost.media || []).entries()) {
      uploads.push(await this.upload(fields, media, index));
    }

    const topic = fields.topic.trim();
    const data = await (
      await this.fetch(
        `${this.server(fields)}/api/v1/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: this.authorization(fields),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            type: 'stream',
            to: String(streamId),
            topic,
            content: [firstPost.message, uploads.join('\n')]
              .filter((p) => p && p.trim())
              .join('\n\n'),
          }),
        },
        this.identifier
      )
    ).json();

    return [
      {
        id: firstPost.id,
        postId: String(data.id),
        releaseURL:
          data.message_url ||
          `${this.server(
            fields
          )}/#narrow/stream/${streamId}/topic/${this.encodeHash(topic)}/near/${
            data.id
          }`,
        status: 'completed',
      },
    ];
  }
}
