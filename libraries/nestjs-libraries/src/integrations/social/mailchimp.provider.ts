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
import { MailchimpDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/mailchimp.dto';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

type MailchimpDetails = { apiKey: string };

@Rules(
  'Mailchimp sends the content as an email campaign to the selected audience: pictures go inside the content as <img src="..."> where they should appear, the src must be a picture from the media library (upload it with uploadFromUrlTool first), attachments are not sent'
)
export class MailchimpProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 5; // Mailchimp allows 10 simultaneous connections per key
  identifier = 'mailchimp';
  name = 'Mailchimp';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'html' as const;
  dto = MailchimpDto;

  maxLength() {
    return 100000;
  }

  inlineImages() {
    return true;
  }

  async customFields() {
    return [
      {
        key: 'apiKey',
        label: 'API key',
        validation: `/^\\s*[a-zA-Z0-9]+-[a-z]+[0-9]+\\s*$/`,
        type: 'password' as const,
        hint: 'Profile -> Extras -> API keys, it ends with your data center like -us21',
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
      if (error?.detail) {
        return {
          type: 'bad-body' as const,
          value: `Mailchimp: ${error.detail}`,
        };
      }
    } catch (err) {
      /** not a JSON body **/
    }

    return undefined;
  }

  // The data center is the suffix of the key: xxxx-us21 -> us21
  private api(apiKey: string) {
    const dc = apiKey.trim().split('-').pop();
    return `https://${dc}.api.mailchimp.com/3.0`;
  }

  private headers(apiKey: string) {
    return {
      Authorization: `Basic ${Buffer.from(`postcherry:${apiKey.trim()}`).toString(
        'base64'
      )}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private details(integration: Integration): MailchimpDetails {
    return JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body: MailchimpDetails = JSON.parse(
      Buffer.from(params.code, 'base64').toString()
    );
    const apiKey = (body.apiKey || '').trim();

    if (!/^[a-zA-Z0-9]+-[a-z]+[0-9]+$/.test(apiKey)) {
      return 'The API key must end with your data center, like xxxx-us21';
    }

    try {
      const response = await fetch(`${this.api(apiKey)}/`, {
        headers: this.headers(apiKey),
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });

      if (!response.ok) {
        return 'Mailchimp rejected the API key';
      }

      const account = await response.json();

      return {
        refreshToken: apiKey,
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: apiKey,
        id: String(account.account_id),
        name: account.account_name || account.email,
        picture: account.avatar_url || '',
        username: account.email || account.account_name,
      };
    } catch (err) {
      return 'Could not reach Mailchimp, check the API key';
    }
  }

  @Tool({ description: 'List of available audiences', dataSchema: [] })
  async list(
    token: string,
    data: any,
    internalId: string,
    integration: Integration
  ) {
    const { apiKey } = this.details(integration);

    const lists = await (
      await this.fetch(
        `${this.api(apiKey)}/lists?count=1000&fields=lists.id,lists.name`,
        {
          headers: this.headers(apiKey),
        }
      )
    ).json();

    return (lists.lists || []).map((p: any) => ({ id: p.id, name: p.name }));
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<MailchimpDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const { apiKey } = this.details(integration);
    const [firstPost] = postDetails;
    const api = this.api(apiKey);

    // The audience defaults hold the verified from name / reply-to address
    const audience = await (
      await this.fetch(
        `${api}/lists/${encodeURIComponent(firstPost.settings.list)}`,
        {
          headers: this.headers(apiKey),
        }
      )
    ).json();

    const { from_name, from_email } = audience.campaign_defaults || {};
    if (!from_name || !from_email) {
      throw new BadBody(
        this.identifier,
        '{}',
        '{}',
        'Mailchimp: the audience has no default from name and email, set them in the audience settings'
      );
    }

    const campaign = await (
      await this.fetch(`${api}/campaigns`, {
        method: 'POST',
        headers: this.headers(apiKey),
        body: JSON.stringify({
          type: 'regular',
          recipients: { list_id: firstPost.settings.list },
          settings: {
            subject_line: firstPost.settings.subject,
            preview_text: firstPost.settings.preview || '',
            title: firstPost.settings.subject,
            from_name,
            reply_to: from_email,
          },
        }),
      })
    ).json();

    // Custom HTML campaigns must carry the unsubscribe link and the address
    await this.fetch(`${api}/campaigns/${campaign.id}/content`, {
      method: 'PUT',
      headers: this.headers(apiKey),
      body: JSON.stringify({
        html: `<div style="font-size:15px;line-height:1.6;">${firstPost.message}</div>
<p style="font-size:12px;color:#888888;">*|LIST:ADDRESSLINE|*<br /><a href="*|UNSUB|*">Unsubscribe</a></p>`,
      }),
    });

    // The send action answers 204 No Content, which this.fetch treats as an
    // error, so it is a plain fetch (still SSRF-safe) with its own error.
    const send = await fetch(`${api}/campaigns/${campaign.id}/actions/send`, {
      method: 'POST',
      headers: this.headers(apiKey),
      // @ts-ignore - undici-only option; blocks SSRF to internal IPs
      dispatcher: getSsrfSafeDispatcher(),
    });

    if (!send.ok) {
      const error = await send.text().catch(() => '{}');
      throw new BadBody(
        this.identifier,
        error,
        '{}',
        this.handleErrors(error, send.status)?.value ||
          'Mailchimp could not send the campaign'
      );
    }

    return [
      {
        id: firstPost.id,
        status: 'completed',
        postId: String(campaign.id),
        releaseURL: campaign.long_archive_url || campaign.archive_url || '',
      },
    ];
  }
}
