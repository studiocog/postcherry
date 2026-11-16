import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { SocialAbstract } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { DiscourseDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/discourse.dto';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Integration } from '@prisma/client';
import dayjs from 'dayjs';

type DiscourseDetails = { url: string; apiKey: string; username: string };

@Rules(
  'Discourse publishes the post as a new forum topic written in markdown, the attached pictures are added at the end of the topic'
)
export class DiscourseProvider
  extends SocialAbstract
  implements SocialProvider
{
  override maxConcurrentJob = 5; // Discourse forums are self-hosted, keep it gentle
  identifier = 'discourse';
  name = 'Discourse';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'markdown' as const;
  dto = DiscourseDto;

  // Discourse's default max_post_length
  maxLength() {
    return 32000;
  }

  override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    if (body.includes('invalid_access') || status === 403) {
      return {
        type: 'bad-body',
        value:
          'Discourse refused the request, check the API key is allowed to post as this user',
      };
    }

    // Validation errors come back as {"errors":["Title is too short ..."]}
    if (status === 422) {
      try {
        const parsed = JSON.parse(body);
        if (Array.isArray(parsed?.errors) && parsed.errors.length) {
          return { type: 'bad-body', value: String(parsed.errors[0]) };
        }
      } catch (err) {
        /** not json **/
      }
    }

    return undefined;
  }

  async customFields() {
    return [
      {
        key: 'url',
        label: 'Forum URL',
        defaultValue: '',
        validation: `/^(https?:\\/\\/)(?:\\S+(?::\\S*)?@)?(?:(?:localhost)|(?:\\d{1,3}(?:\\.\\d{1,3}){3})|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63})(?::\\d{2,5})?(?:\\/[^\\s?#]*)?(?:\\?[^\\s#]*)?(?:#[^\\s]*)?$/`,
        type: 'text' as const,
      },
      {
        key: 'apiKey',
        label: 'API key',
        validation: `/^.{8,}$/`,
        type: 'password' as const,
        hint: 'Admin > Advanced > API keys > New API key (single user or all users)',
      },
      {
        key: 'username',
        label: 'Username',
        validation: `/^.+$/`,
        type: 'text' as const,
        hint: 'The forum user the posts are published as',
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

  private normalize(body: DiscourseDetails): DiscourseDetails {
    return {
      url: (body.url || '').trim().replace(/\/+$/, ''),
      apiKey: (body.apiKey || '').trim(),
      username: (body.username || '').trim(),
    };
  }

  private getDetails(integration: Integration): DiscourseDetails {
    return this.normalize(
      JSON.parse(AuthService.fixedDecryption(integration.customInstanceDetails!))
    );
  }

  private headers(details: DiscourseDetails) {
    return {
      'Api-Key': details.apiKey,
      'Api-Username': details.username,
      Accept: 'application/json',
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const details = this.normalize(
      JSON.parse(Buffer.from(params.code, 'base64').toString())
    );

    // Discourse rejects an unknown API key (or a single-user key used for
    // another username) on any request that sends it, so this checks the
    // whole Api-Key / Api-Username pair.
    let response: Response;
    try {
      response = await fetch(
        `${details.url}/u/${encodeURIComponent(details.username)}.json`,
        {
          headers: this.headers(details),
          // @ts-ignore - undici-only option; blocks SSRF to internal IPs
          dispatcher: getSsrfSafeDispatcher(),
        }
      );
    } catch (err) {
      return 'Could not reach the Discourse forum, check the forum URL';
    }

    if (response.status === 403 || response.status === 401) {
      return 'Discourse rejected the API key for this username';
    }

    if (response.status === 404) {
      return 'This user does not exist on the Discourse forum';
    }

    if (!response.ok) {
      return `Discourse returned an unexpected error (HTTP ${response.status}), check the forum URL`;
    }

    let data: any;
    try {
      data = await response.json();
    } catch (err) {
      return 'This URL does not look like a Discourse forum';
    }

    const user = data?.user;
    if (!user?.id) {
      return 'This URL does not look like a Discourse forum';
    }

    const avatar = String(user.avatar_template || '').replace('{size}', '240');

    return {
      refreshToken: '',
      expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
      accessToken: details.apiKey,
      // user ids are only unique per forum
      id: `${new URL(details.url).host}:${user.id}`,
      name: user.name || user.username,
      picture: !avatar
        ? ''
        : avatar.indexOf('http') === 0
        ? avatar
        : avatar.indexOf('//') === 0
        ? `https:${avatar}`
        : `${details.url}${avatar}`,
      username: user.username,
    };
  }

  @Tool({ description: 'List of the forum categories', dataSchema: [] })
  async categories(
    token: string,
    data: any,
    internalId: string,
    integration: Integration
  ) {
    const details = this.getDetails(integration);

    const { category_list } = await (
      await this.fetch(
        `${details.url}/categories.json?include_subcategories=true`,
        { headers: this.headers(details) },
        this.identifier
      )
    ).json();

    return (category_list?.categories || []).flatMap((category: any) => [
      { id: String(category.id), name: category.name },
      ...(category.subcategory_list || []).map((sub: any) => ({
        id: String(sub.id),
        name: `${category.name} / ${sub.name}`,
      })),
    ]);
  }

  private withImages(post: PostDetails) {
    const images = (post.media || [])
      .filter((media) => media.type !== 'video')
      .map((media) => `![${media.alt || ''}](${media.path})`);

    return [post.message || '', ...images].filter(Boolean).join('\n\n');
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<DiscourseDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const details = this.getDetails(integration);

    const created = await (
      await this.fetch(
        `${details.url}/posts.json`,
        {
          method: 'POST',
          headers: {
            ...this.headers(details),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: firstPost.settings.title,
            raw: this.withImages(firstPost),
            ...(firstPost.settings?.category
              ? { category: +firstPost.settings.category }
              : {}),
          }),
        },
        this.identifier
      )
    ).json();

    return [
      {
        id: firstPost.id,
        // the topic id: comments are replies inside this topic
        postId: String(created.topic_id),
        releaseURL: `${details.url}/t/${created.topic_slug}/${created.topic_id}`,
        status: 'completed',
      },
    ];
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
    const details = this.getDetails(integration);

    const created = await (
      await this.fetch(
        `${details.url}/posts.json`,
        {
          method: 'POST',
          headers: {
            ...this.headers(details),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            topic_id: +postId,
            raw: this.withImages(commentPost),
          }),
        },
        this.identifier
      )
    ).json();

    return [
      {
        id: commentPost.id,
        postId: String(created.id),
        releaseURL: `${details.url}/t/${created.topic_slug}/${created.topic_id}/${created.post_number}`,
        status: 'completed',
      },
    ];
  }
}
