import {
  AuthTokenDetails,
  MediaContent,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Integration } from '@prisma/client';
import dayjs from 'dayjs';
import FormDataUpload from 'form-data';

type MisskeyDetails = { url: string; token: string };

export class MisskeyProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 5; // Misskey instances are self-hosted, keep it gentle
  identifier = 'misskey';
  name = 'Misskey';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;

  // MAX_NOTE_TEXT_LENGTH in Misskey's backend
  maxLength() {
    return 3000;
  }

  override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    // Misskey errors look like {"error":{"code":"...","message":"..."}}
    if (body.includes('AUTHENTICATION_FAILED') || body.includes('CREDENTIAL_REQUIRED')) {
      return {
        type: 'refresh-token',
        value: 'The Misskey access token is no longer valid, please reconnect the channel',
      };
    }

    if (body.includes('PERMISSION_DENIED')) {
      return {
        type: 'bad-body',
        value:
          'The Misskey access token is missing a permission, create a new one with "Compose or delete notes" and "Access your Drive files" write permissions and reconnect',
      };
    }

    if (body.includes('RATE_LIMIT_EXCEEDED')) {
      return {
        type: 'retry',
        value: 'Misskey rate limit reached, please try again later',
      };
    }

    if (body.includes('NO_FREE_SPACE')) {
      return {
        type: 'bad-body',
        value: 'Your Misskey drive is full, free some space and post again',
      };
    }

    if (body.includes('INAPPROPRIATE') || body.includes('UNALLOWED_FILE_TYPE')) {
      return {
        type: 'bad-body',
        value: 'The Misskey instance rejected one of the attached files',
      };
    }

    return undefined;
  }

  async customFields() {
    return [
      {
        key: 'url',
        label: 'Instance URL',
        defaultValue: 'https://misskey.io',
        validation: `/^(https?:\\/\\/)(?:\\S+(?::\\S*)?@)?(?:(?:localhost)|(?:\\d{1,3}(?:\\.\\d{1,3}){3})|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63})(?::\\d{2,5})?(?:\\/[^\\s?#]*)?(?:\\?[^\\s#]*)?(?:#[^\\s]*)?$/`,
        type: 'text' as const,
      },
      {
        key: 'token',
        label: 'Access token',
        validation: `/^.{8,}$/`,
        type: 'password' as const,
        hint: 'Settings > API > Generate access token, allow "Compose or delete notes" and "Access your Drive files"',
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

  private normalizeUrl(url: string) {
    return (url || '').trim().replace(/\/+$/, '');
  }

  private getDetails(integration: Integration): MisskeyDetails {
    const body: MisskeyDetails = JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );
    return { url: this.normalizeUrl(body.url), token: body.token.trim() };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body: MisskeyDetails = JSON.parse(
      Buffer.from(params.code, 'base64').toString()
    );
    const url = this.normalizeUrl(body.url);
    const token = (body.token || '').trim();

    // Plain fetch (with the SSRF guard) so the status can be turned into a
    // readable message instead of a thrown error.
    let response: Response;
    try {
      response = await fetch(`${url}/api/i`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });
    } catch (err) {
      return 'Could not reach the Misskey instance, check the instance URL';
    }

    if (response.status === 401 || response.status === 403) {
      return 'Misskey rejected the access token, check it and try again';
    }

    if (!response.ok) {
      return `Misskey returned an unexpected error (HTTP ${response.status}), check the instance URL`;
    }

    let user: any;
    try {
      user = await response.json();
    } catch (err) {
      return 'This URL does not look like a Misskey instance';
    }

    if (!user?.id || !user?.username) {
      return 'This URL does not look like a Misskey instance';
    }

    return {
      refreshToken: '',
      expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
      accessToken: token,
      // Misskey ids are only unique per instance
      id: `${new URL(url).host}:${user.id}`,
      name: user.name || user.username,
      picture: user.avatarUrl || '',
      username: user.username,
    };
  }

  // Streams the media from storage into Misskey's drive (multipart). The
  // request is rebuilt per attempt by runStreamedUpload since a consumed
  // stream can't be replayed.
  private async uploadFile(
    details: MisskeyDetails,
    media: MediaContent
  ): Promise<string> {
    const file = await this.runStreamedUpload<{ id: string }>(async () => {
      const fileSize = await this.mediaSize(media.path, this.identifier);
      const stream = await this.mediaStream(media.path, this.identifier);

      // Misskey reads the multipart fields that come before the file, so the
      // fields are appended first.
      const form = new FormDataUpload();
      form.append('isSensitive', 'false');
      if (media.alt) {
        form.append('comment', media.alt);
      }
      form.append('file', stream, {
        filename: media.path.split('/').pop()?.split('?')[0] || 'file',
        knownLength: fileSize,
      });

      const { data } = await this.getSsrfSafeAxios().post(
        `${details.url}/api/drive/files/create`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${details.token}`,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );

      return data;
    }, this.identifier);

    return file.id;
  }

  private async createNote(
    details: MisskeyDetails,
    post: PostDetails,
    replyId?: string
  ) {
    const fileIds: string[] = [];
    for (const media of post.media || []) {
      fileIds.push(await this.uploadFile(details, media));
    }

    const { createdNote } = await (
      await this.fetch(
        `${details.url}/api/notes/create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${details.token}`,
          },
          body: JSON.stringify({
            visibility: 'public',
            ...(post.message?.trim() ? { text: post.message } : {}),
            ...(fileIds.length ? { fileIds } : {}),
            ...(replyId ? { replyId } : {}),
          }),
        },
        this.identifier
      )
    ).json();

    return {
      id: post.id,
      postId: String(createdNote.id),
      releaseURL: `${details.url}/notes/${createdNote.id}`,
      status: 'completed',
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    return [await this.createNote(this.getDetails(integration), firstPost)];
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [commentPost] = postDetails;
    return [
      await this.createNote(
        this.getDetails(integration),
        commentPost,
        lastCommentId || postId
      ),
    ];
  }
}
