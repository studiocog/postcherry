import {
  AuthTokenDetails,
  MediaContent,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import {
  BadBody,
  SocialAbstract,
  ValidityMedia,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Integration } from '@prisma/client';
import dayjs from 'dayjs';
import FormDataUpload from 'form-data';

type PixelfedDetails = { url: string; token: string };

export class PixelfedProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 5; // Pixelfed instances are self-hosted, keep it gentle
  identifier = 'pixelfed';
  name = 'Pixelfed';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;

  // Pixelfed's default max_caption_length (MAX_CAPTION_LENGTH env), instances
  // can raise it but 500 is the safe common value.
  maxLength() {
    return 500;
  }

  override async checkValidity(
    items: Array<ValidityMedia[]>
  ): Promise<string | true> {
    const [firstItems] = items ?? [];
    // Pixelfed rejects posts without media ("Empty statuses are not allowed"),
    // replies (comments) can be text only.
    if ((firstItems?.length ?? 0) === 0) {
      return 'Pixelfed needs at least one picture or video';
    }
    return true;
  }

  override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    if (body.includes('Empty statuses are not allowed')) {
      return {
        type: 'bad-body',
        value: 'Pixelfed needs at least one picture or video',
      };
    }

    if (body.includes('Invalid permissions for this action')) {
      return {
        type: 'bad-body',
        value: 'This Pixelfed account is not allowed to post',
      };
    }

    // Laravel validation: "The media ids field must not have more than 4 items."
    if (body.includes('media ids field must not have more than')) {
      return {
        type: 'bad-body',
        value: 'Too many pictures for this Pixelfed instance, remove some and post again',
      };
    }

    // Laravel validation: "The status field must not be greater than 500 characters."
    if (body.includes('status field must not be greater than')) {
      return {
        type: 'bad-body',
        value: 'The caption is too long for this Pixelfed instance',
      };
    }

    if (body.includes('mimetypes') || body.includes('must be a file of type')) {
      return {
        type: 'bad-body',
        value: 'This Pixelfed instance does not accept one of the attached files',
      };
    }

    if (status === 413) {
      return {
        type: 'bad-body',
        value: 'One of the attached files is too large for this Pixelfed instance',
      };
    }

    return undefined;
  }

  async customFields() {
    return [
      {
        key: 'url',
        label: 'Instance URL',
        defaultValue: 'https://pixelfed.social',
        validation: `/^(https?:\\/\\/)(?:\\S+(?::\\S*)?@)?(?:(?:localhost)|(?:\\d{1,3}(?:\\.\\d{1,3}){3})|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63})(?::\\d{2,5})?(?:\\/[^\\s?#]*)?(?:\\?[^\\s#]*)?(?:#[^\\s]*)?$/`,
        type: 'text' as const,
      },
      {
        key: 'token',
        label: 'Personal access token',
        validation: `/^.{8,}$/`,
        type: 'password' as const,
        hint: 'Settings > Applications > Personal access tokens, with read and write scopes',
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

  private getDetails(integration: Integration): PixelfedDetails {
    const body: PixelfedDetails = JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );
    return { url: this.normalizeUrl(body.url), token: body.token.trim() };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body: PixelfedDetails = JSON.parse(
      Buffer.from(params.code, 'base64').toString()
    );
    const url = this.normalizeUrl(body.url);
    const token = (body.token || '').trim();

    let response: Response;
    try {
      response = await fetch(`${url}/api/v1/accounts/verify_credentials`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });
    } catch (err) {
      return 'Could not reach the Pixelfed instance, check the instance URL';
    }

    if (response.status === 401 || response.status === 403) {
      return 'Pixelfed rejected the access token, check it has read and write scopes';
    }

    if (!response.ok) {
      return `Pixelfed returned an unexpected error (HTTP ${response.status}), check the instance URL`;
    }

    let account: any;
    try {
      account = await response.json();
    } catch (err) {
      return 'This URL does not look like a Pixelfed instance';
    }

    if (!account?.id || !account?.username) {
      return 'This URL does not look like a Pixelfed instance';
    }

    return {
      refreshToken: '',
      expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
      accessToken: token,
      // account ids are only unique per instance
      id: `${new URL(url).host}:${account.id}`,
      name: account.display_name || account.username,
      picture: account.avatar || '',
      username: account.username,
    };
  }

  // Streams the media from storage into Pixelfed (Mastodon-compatible
  // multipart upload). Rebuilt per attempt by runStreamedUpload since a
  // consumed stream can't be replayed.
  private async uploadFile(
    details: PixelfedDetails,
    media: MediaContent
  ): Promise<string> {
    const uploaded = await this.runStreamedUpload<{ id: string }>(async () => {
      const fileSize = await this.mediaSize(media.path, this.identifier);
      const stream = await this.mediaStream(media.path, this.identifier);

      const form = new FormDataUpload();
      if (media.alt) {
        form.append('description', media.alt);
      }
      form.append('file', stream, {
        filename: media.path.split('/').pop()?.split('?')[0] || 'file',
        knownLength: fileSize,
      });

      const { data } = await this.getSsrfSafeAxios().post(
        `${details.url}/api/v1/media`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            Accept: 'application/json',
            Authorization: `Bearer ${details.token}`,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );

      return data;
    }, this.identifier);

    if (!uploaded?.id) {
      throw new BadBody(
        this.identifier,
        '{}',
        '{}',
        'Pixelfed did not accept the media, please try again'
      );
    }

    return String(uploaded.id);
  }

  private async createStatus(
    details: PixelfedDetails,
    post: PostDetails,
    replyId?: string
  ): Promise<PostResponse> {
    const mediaIds: string[] = [];
    for (const media of post.media || []) {
      mediaIds.push(await this.uploadFile(details, media));
    }

    const status = await (
      await this.fetch(
        `${details.url}/api/v1/statuses`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${details.token}`,
            // Pixelfed answers a repeated key (for an hour) with the status it
            // already created, so a retried activity after a lost response
            // doesn't publish twice. Stable per post for that reason.
            'Idempotency-Key': `postcherry-${post.id}`,
          },
          body: JSON.stringify({
            status: post.message || '',
            visibility: 'public',
            ...(mediaIds.length ? { media_ids: mediaIds } : {}),
            ...(replyId ? { in_reply_to_id: replyId } : {}),
          }),
        },
        this.identifier
      )
    ).json();

    if (!status?.id) {
      throw new BadBody(
        this.identifier,
        JSON.stringify(status || {}),
        '{}',
        'Pixelfed did not publish the post, open Pixelfed once in the browser and try again'
      );
    }

    return {
      id: post.id,
      postId: String(status.id),
      releaseURL: status.url || '',
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
    return [await this.createStatus(this.getDetails(integration), firstPost)];
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
      await this.createStatus(
        this.getDetails(integration),
        commentPost,
        lastCommentId || postId
      ),
    ];
  }
}
