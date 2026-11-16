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
import slugify from 'slugify';
import { WebflowDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/webflow.dto';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

type WebflowDetails = { token: string };

const WEBFLOW_API = 'https://api.webflow.com/v2';

@Rules(
  'Webflow publishes the content as a live item of the selected CMS collection: the title goes in the name field, the content goes in the first rich text field, pictures go inside the content as <img src="..."> where they should appear, the src must be a picture from the media library (upload it with uploadFromUrlTool first), the first picture also fills the first image field'
)
export class WebflowProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 3; // Webflow allows 60 requests per minute on most plans
  identifier = 'webflow';
  name = 'Webflow';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'html' as const;
  dto = WebflowDto;

  maxLength() {
    return 100000;
  }

  inlineImages() {
    return true;
  }

  async customFields() {
    return [
      {
        key: 'token',
        label: 'Site API token',
        validation: `/^\\s*\\S{10,}\\s*$/`,
        type: 'password' as const,
        hint: 'Site settings -> Apps & integrations -> API access, with Sites read and CMS read and write access',
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

  override handleErrors(body: string, status: number) {
    if (status < 400 || status >= 500 || status === 401 || status === 429) {
      return undefined;
    }

    try {
      const error = JSON.parse(body);
      if (error?.message) {
        const details = (error.details || [])
          .map((d: any) => (typeof d === 'string' ? d : d?.message))
          .filter(Boolean)
          .join(', ');
        return {
          type: 'bad-body' as const,
          value: `Webflow: ${error.message}${details ? ` (${details})` : ''}`,
        };
      }
    } catch (err) {
      /** not a JSON body **/
    }

    return undefined;
  }

  private headers(token: string) {
    return {
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private details(integration: Integration): WebflowDetails {
    return JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );
  }

  private async sites(token: string) {
    const { sites } = await (
      await this.fetch(`${WEBFLOW_API}/sites`, {
        headers: this.headers(token),
      })
    ).json();

    return (sites || []) as any[];
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body: WebflowDetails = JSON.parse(
      Buffer.from(params.code, 'base64').toString()
    );
    const token = (body.token || '').trim();

    try {
      const response = await fetch(`${WEBFLOW_API}/sites`, {
        headers: this.headers(token),
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });

      if (!response.ok) {
        return 'Webflow rejected the API token';
      }

      const { sites } = await response.json();
      const [site] = sites || [];
      if (!site) {
        return 'This Webflow token has no site';
      }

      return {
        refreshToken: token,
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: token,
        id: String(site.id),
        name: site.displayName,
        picture: site.previewUrl || '',
        username: site.customDomains?.[0]?.url || `${site.shortName}.webflow.io`,
      };
    } catch (err) {
      return 'Could not reach Webflow, check the API token';
    }
  }

  @Tool({ description: 'List of available CMS collections', dataSchema: [] })
  async collections(
    token: string,
    data: any,
    internalId: string,
    integration: Integration
  ) {
    const { token: apiToken } = this.details(integration);
    const sites = await this.sites(apiToken);

    const all = await Promise.all(
      sites.map(async (site) => {
        const { collections } = await (
          await this.fetch(`${WEBFLOW_API}/sites/${site.id}/collections`, {
            headers: this.headers(apiToken),
          })
        ).json();

        return (collections || []).map((p: any) => ({
          id: p.id,
          name:
            sites.length > 1
              ? `${site.displayName} - ${p.displayName}`
              : p.displayName,
        }));
      })
    );

    return all.flat();
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<WebflowDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const { token } = this.details(integration);
    const [firstPost] = postDetails;
    const collectionId = encodeURIComponent(firstPost.settings.collection);

    const collection = await (
      await this.fetch(`${WEBFLOW_API}/collections/${collectionId}`, {
        headers: this.headers(token),
      })
    ).json();

    const fields = (collection.fields || []) as any[];
    const richText = fields.find((f) => f.type === 'RichText');
    const imageField = fields.find((f) => f.type === 'Image');

    if (!richText) {
      throw new BadBody(
        this.identifier,
        '{}',
        '{}',
        'Webflow: the selected collection has no rich text field for the content'
      );
    }

    const image =
      firstPost.media?.find((m) => m.type === 'image')?.path ||
      /<img[^>]+src="([^"]+)"/i.exec(firstPost.message || '')?.[1];

    // A short random suffix keeps the slug unique when titles repeat
    const slug = `${
      slugify(firstPost.settings.title, {
        lower: true,
        strict: true,
        trim: true,
      }).slice(0, 80) || 'post'
    }-${makeSecureId(5).toLowerCase()}`;

    const body = JSON.stringify({
      isArchived: false,
      isDraft: false,
      fieldData: {
        name: firstPost.settings.title,
        slug,
        [richText.slug]: firstPost.message,
        ...(imageField && image ? { [imageField.slug]: { url: image } } : {}),
      },
    });

    // Creating a live item answers 202 Accepted, which this.fetch treats as an
    // error, so it is a plain fetch (still SSRF-safe) with its own error.
    const response = await fetch(
      `${WEBFLOW_API}/collections/${collectionId}/items/live`,
      {
        method: 'POST',
        headers: this.headers(token),
        body,
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      }
    );

    const text = await response.text().catch(() => '{}');
    if (!response.ok) {
      throw new BadBody(
        this.identifier,
        text,
        body,
        this.handleErrors(text, response.status)?.value ||
          'Webflow could not publish the item'
      );
    }

    let item: any = {};
    try {
      item = JSON.parse(text);
    } catch (err) {
      item = {};
    }

    // Best effort, the item is already live: the collection template page
    // usually lives at /<collection slug>/<item slug>
    let releaseURL = '';
    try {
      const sites = await this.sites(token);
      const site = sites.find((s) => s.id === collection.siteId) || sites[0];
      const domain =
        site?.customDomains?.[0]?.url ||
        (site?.shortName ? `${site.shortName}.webflow.io` : '');
      if (domain && collection.slug) {
        releaseURL = `https://${domain}/${collection.slug}/${
          item?.fieldData?.slug || slug
        }`;
      }
    } catch (err) {
      releaseURL = '';
    }

    return [
      {
        id: firstPost.id,
        status: 'completed',
        postId: String(item.id || slug),
        releaseURL,
      },
    ];
  }
}
