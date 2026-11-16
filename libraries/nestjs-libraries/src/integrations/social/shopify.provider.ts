import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { BadBody, SocialAbstract } from '../social.abstract';
import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from './social.integrations.interface';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { ShopifyDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/shopify.dto';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

type ShopifyDetails = { domain: string; token: string };

// Stable Admin API versions are supported for 12 months, bump it yearly
const SHOPIFY_API_VERSION = '2026-10';

const SHOP_QUERY = `{ shop { id name myshopifyDomain primaryDomain { url } } }`;

@Rules(
  'Shopify publishes the content as a blog article on the store: pictures go inside the content as <img src="..."> where they should appear, the src must be a picture from the media library (upload it with uploadFromUrlTool first), the first picture becomes the article image'
)
export class ShopifyProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 3;
  identifier = 'shopify';
  name = 'Shopify';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'html' as const;
  dto = ShopifyDto;

  maxLength() {
    return 100000;
  }

  inlineImages() {
    return true;
  }

  async customFields() {
    return [
      {
        key: 'domain',
        label: 'Store domain',
        validation: `/^\\s*(https?:\\/\\/)?[a-zA-Z0-9][a-zA-Z0-9-]*\\.myshopify\\.com\\/?\\s*$/`,
        type: 'text' as const,
        hint: 'your-store.myshopify.com',
      },
      {
        key: 'token',
        label: 'Admin API access token',
        validation: `/^\\s*\\S{10,}\\s*$/`,
        type: 'password' as const,
        hint: 'Custom app with the write_content scope, starts with shpat_',
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

  // Users paste the store with https:// or a trailing slash
  private normalizeDomain(domain: string) {
    return domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
  }

  private details(integration: Integration): ShopifyDetails {
    const body: ShopifyDetails = JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );
    return {
      domain: this.normalizeDomain(body.domain),
      token: body.token.trim(),
    };
  }

  private graphqlRequest(
    { domain, token }: ShopifyDetails,
    query: string,
    variables: Record<string, any> = {}
  ): [string, RequestInit] {
    return [
      `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      },
    ];
  }

  // GraphQL answers 200 even for errors like a missing access scope
  private async graphql(
    details: ShopifyDetails,
    query: string,
    variables: Record<string, any> = {}
  ) {
    const result = await (
      await this.fetch(...this.graphqlRequest(details, query, variables))
    ).json();

    if (result.errors) {
      const message = Array.isArray(result.errors)
        ? result.errors.map((e: any) => e.message).join(', ')
        : String(result.errors);
      throw new BadBody(
        this.identifier,
        JSON.stringify(result.errors),
        '{}',
        `Shopify: ${message}`
      );
    }

    return result.data;
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body: ShopifyDetails = JSON.parse(
      Buffer.from(params.code, 'base64').toString()
    );
    const details = {
      domain: this.normalizeDomain(body.domain || ''),
      token: (body.token || '').trim(),
    };

    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(details.domain)) {
      return 'The store domain must look like your-store.myshopify.com';
    }

    try {
      const [url, options] = this.graphqlRequest(details, SHOP_QUERY);
      const response = await fetch(url, {
        ...options,
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });

      if (response.status === 401 || response.status === 403) {
        return 'Shopify rejected the Admin API access token';
      }

      if (!response.ok) {
        return `Shopify returned an error (HTTP ${response.status}), check the store domain`;
      }

      const { data, errors } = await response.json();
      if (errors || !data?.shop) {
        return 'Shopify rejected the Admin API access token';
      }

      return {
        refreshToken: details.token,
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: details.token,
        id: String(data.shop.id),
        name: data.shop.name,
        picture: '',
        username: data.shop.myshopifyDomain || details.domain,
      };
    } catch (err) {
      return 'Could not reach your Shopify store, check the store domain';
    }
  }

  @Tool({ description: 'List of available blogs', dataSchema: [] })
  async blogs(
    token: string,
    data: any,
    internalId: string,
    integration: Integration
  ) {
    const result = await this.graphql(
      this.details(integration),
      `{ blogs(first: 100) { nodes { id title } } }`
    );

    return (result?.blogs?.nodes || []).map((p: any) => ({
      id: p.id,
      name: p.title,
    }));
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<ShopifyDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const details = this.details(integration);
    const [firstPost] = postDetails;

    const { shop } = await this.graphql(details, SHOP_QUERY);

    const image =
      firstPost.media?.find((m) => m.type === 'image')?.path ||
      /<img[^>]+src="([^"]+)"/i.exec(firstPost.message || '')?.[1];

    const { articleCreate } = await this.graphql(
      details,
      `mutation CreateArticle($article: ArticleCreateInput!) {
        articleCreate(article: $article) {
          article { id handle blog { handle } }
          userErrors { code field message }
        }
      }`,
      {
        article: {
          blogId: firstPost.settings.blog,
          title: firstPost.settings.title,
          author: { name: shop.name },
          body: firstPost.message,
          isPublished: true,
          ...(image ? { image: { url: image } } : {}),
        },
      }
    );

    if (articleCreate?.userErrors?.length || !articleCreate?.article) {
      throw new BadBody(
        this.identifier,
        JSON.stringify(articleCreate?.userErrors || []),
        '{}',
        `Shopify: ${
          (articleCreate?.userErrors || [])
            .map((e: any) => e.message)
            .join(', ') || 'the article was not created'
        }`
      );
    }

    const { article } = articleCreate;
    const storeUrl = (
      shop.primaryDomain?.url || `https://${details.domain}`
    ).replace(/\/+$/, '');

    return [
      {
        id: firstPost.id,
        status: 'completed',
        postId: String(article.id),
        releaseURL: `${storeUrl}/blogs/${article.blog.handle}/${article.handle}`,
      },
    ];
  }
}
