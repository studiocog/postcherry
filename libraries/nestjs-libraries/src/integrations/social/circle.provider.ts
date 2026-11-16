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
import { CircleDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/circle.dto';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Integration } from '@prisma/client';
import { createHash } from 'crypto';
import dayjs from 'dayjs';

const CIRCLE_API = 'https://app.circle.so/api/admin/v2';

const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

@Rules(
  'Circle publishes the post in a community space, the text is plain (no formatting) and the attached pictures are shown below it'
)
export class CircleProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 3;
  identifier = 'circle';
  name = 'Circle';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;
  dto = CircleDto;

  maxLength() {
    return 50000;
  }

  override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    if (body.includes('The API token is invalid')) {
      return {
        type: 'refresh-token',
        value: 'The Circle API token is no longer valid, please reconnect the channel',
      };
    }

    if (body.includes('not eligible for admin API v2 access')) {
      return {
        type: 'bad-body',
        value: 'This Circle community plan does not include the Admin API',
      };
    }

    if (status === 404) {
      return {
        type: 'bad-body',
        value:
          'Circle could not find the selected space or the token owner, please pick another space or reconnect the channel',
      };
    }

    return undefined;
  }

  async customFields() {
    return [
      {
        key: 'token',
        label: 'Admin API token',
        validation: `/^.{8,}$/`,
        type: 'password' as const,
        hint: 'Circle > Settings > Developers > Tokens > Create token, type Admin V2',
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

  private headers(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
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

    let response: Response;
    try {
      response = await fetch(`${CIRCLE_API}/community`, {
        headers: this.headers(token),
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });
    } catch (err) {
      return 'Could not reach Circle, please try again';
    }

    if (response.status === 401) {
      return 'Circle rejected the API token, check it is an Admin V2 token';
    }

    if (response.status === 403) {
      return 'This Circle community plan does not include the Admin API';
    }

    if (!response.ok) {
      return `Circle returned an unexpected error (HTTP ${response.status})`;
    }

    const community = await response.json().catch(() => ({} as any));
    if (!community?.id) {
      return 'Circle did not return the community of this token';
    }

    return {
      refreshToken: '',
      expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
      accessToken: token,
      id: `circle:${community.id}`,
      name: community.name || community.slug || 'Circle',
      picture: '',
      username: community.slug || String(community.id),
    };
  }

  @Tool({ description: 'List of the community spaces', dataSchema: [] })
  async spaces(
    token: string,
    data: any,
    internalId: string,
    integration: Integration
  ) {
    const apiToken = this.getToken(integration);
    const spaces: { id: string; name: string }[] = [];

    // Paginated; capped so a huge community can't loop for long.
    for (let page = 1; page <= 10; page++) {
      const list = await (
        await this.fetch(
          `${CIRCLE_API}/spaces?per_page=100&page=${page}`,
          { headers: this.headers(apiToken) },
          this.identifier
        )
      ).json();

      for (const space of list?.records || []) {
        // Basic posts can only be created in basic (posts) spaces
        if (!space.space_type || space.space_type === 'basic') {
          spaces.push({ id: String(space.id), name: space.name });
        }
      }

      if (!list?.has_next_page) {
        break;
      }
    }

    return spaces;
  }

  // Circle stores files through a direct upload: ask for a presigned URL
  // (size + base64 md5 of the content), PUT the bytes there, then reference
  // the file by its signed_id in the post body.
  private async uploadImage(token: string, media: MediaContent) {
    const buffer = await this.readOrFetch(media.path);
    const filename = media.path.split('/').pop()?.split('?')[0] || 'image.jpg';
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    const contentType = IMAGE_TYPES[extension] || 'image/jpeg';

    const upload = await (
      await this.fetch(
        `${CIRCLE_API}/direct_uploads`,
        {
          method: 'POST',
          headers: this.headers(token),
          body: JSON.stringify({
            blob: {
              filename,
              content_type: contentType,
              byte_size: buffer.length,
              checksum: createHash('md5').update(buffer).digest('base64'),
            },
          }),
        },
        this.identifier
      )
    ).json();

    // The presigned storage URL can answer 200 or 204, so axios (any 2xx)
    // instead of this.fetch, which only accepts 200 / 201.
    await this.runStreamedUpload(
      () =>
        this.getSsrfSafeAxios().put(upload.direct_upload.url, buffer, {
          headers: upload.direct_upload.headers || {
            'Content-Type': contentType,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }),
      this.identifier
    );

    return {
      type: 'image',
      attrs: {
        signed_id: upload.signed_id,
        url: upload.url,
        content_type: contentType,
        width: '100%',
        alignment: 'center',
      },
    };
  }

  // Plain text to Tiptap: blank lines split paragraphs, single line breaks
  // become hard breaks inside a paragraph.
  private toTiptap(message: string) {
    return (message || '')
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => ({
        type: 'paragraph',
        content: block
          .split('\n')
          .flatMap((line, index) => [
            ...(index ? [{ type: 'hardBreak' }] : []),
            ...(line ? [{ type: 'text', text: line }] : []),
          ]),
      }));
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<CircleDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const token = this.getToken(integration);

    const images: Array<Record<string, any>> = [];
    for (const media of (firstPost.media || []).filter(
      (p) => p.type !== 'video'
    )) {
      images.push(await this.uploadImage(token, media));
    }

    const { post } = await (
      await this.fetch(
        `${CIRCLE_API}/posts`,
        {
          method: 'POST',
          headers: this.headers(token),
          body: JSON.stringify({
            space_id: +firstPost.settings.space,
            name: firstPost.settings.title,
            status: 'published',
            tiptap_body: {
              body: {
                type: 'doc',
                content: [...this.toTiptap(firstPost.message), ...images],
              },
            },
          }),
        },
        this.identifier
      )
    ).json();

    return [
      {
        id: firstPost.id,
        postId: String(post?.id || ''),
        releaseURL: post?.url || '',
        status: 'completed',
      },
    ];
  }
}
