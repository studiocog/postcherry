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
import { BrevoDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/brevo.dto';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

type BrevoDetails = { apiKey: string };

const BREVO_API = 'https://api.brevo.com/v3';

@Rules(
  'Brevo sends the content as an email campaign to the selected list: pictures go inside the content as <img src="..."> where they should appear, the src must be a picture from the media library (upload it with uploadFromUrlTool first), attachments are not sent'
)
export class BrevoProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 5;
  identifier = 'brevo';
  name = 'Brevo';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'html' as const;
  dto = BrevoDto;

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
        validation: `/^\\s*\\S{10,}\\s*$/`,
        type: 'password' as const,
        hint: 'SMTP & API -> API keys, it starts with xkeysib-',
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
    if (status === 402) {
      return {
        type: 'bad-body' as const,
        value: 'Brevo: not enough email credits to send this campaign',
      };
    }

    if (status < 400 || status >= 500 || status === 401 || status === 429) {
      return undefined;
    }

    try {
      const error = JSON.parse(body);
      if (error?.message) {
        return {
          type: 'bad-body' as const,
          value: `Brevo: ${error.message}`,
        };
      }
    } catch (err) {
      /** not a JSON body **/
    }

    return undefined;
  }

  private headers(apiKey: string) {
    return {
      'api-key': apiKey.trim(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private details(integration: Integration): BrevoDetails {
    return JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body: BrevoDetails = JSON.parse(
      Buffer.from(params.code, 'base64').toString()
    );
    const apiKey = (body.apiKey || '').trim();

    try {
      const response = await fetch(`${BREVO_API}/account`, {
        headers: this.headers(apiKey),
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });

      if (!response.ok) {
        return 'Brevo rejected the API key';
      }

      const account = await response.json();
      const fullName = [account.firstName, account.lastName]
        .filter(Boolean)
        .join(' ');

      return {
        refreshToken: apiKey,
        expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
        accessToken: apiKey,
        id: `brevo:${account.organization_id || account.email}`,
        name: account.companyName || fullName || account.email,
        picture: '',
        username: account.email,
      };
    } catch (err) {
      return 'Could not reach Brevo, check the API key';
    }
  }

  @Tool({ description: 'List of available contact lists', dataSchema: [] })
  async list(
    token: string,
    data: any,
    internalId: string,
    integration: Integration
  ) {
    const { apiKey } = this.details(integration);

    // Brevo caps a page at 50 lists
    const all: { id: number; name: string }[] = [];
    for (let offset = 0; offset < 500; offset += 50) {
      const page = await (
        await this.fetch(
          `${BREVO_API}/contacts/lists?limit=50&offset=${offset}`,
          {
            headers: this.headers(apiKey),
          }
        )
      ).json();

      const lists = page.lists || [];
      all.push(...lists.map((p: any) => ({ id: p.id, name: p.name })));

      if (lists.length < 50) {
        break;
      }
    }

    return all;
  }

  @Tool({ description: 'List of available senders', dataSchema: [] })
  async senders(
    token: string,
    data: any,
    internalId: string,
    integration: Integration
  ) {
    const { apiKey } = this.details(integration);

    const senders = await (
      await this.fetch(`${BREVO_API}/senders`, {
        headers: this.headers(apiKey),
      })
    ).json();

    return (senders.senders || [])
      .filter((p: any) => p.active !== false)
      .map((p: any) => ({ id: p.id, name: `${p.name} <${p.email}>` }));
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<BrevoDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const { apiKey } = this.details(integration);
    const [firstPost] = postDetails;

    const campaign = await (
      await this.fetch(`${BREVO_API}/emailCampaigns`, {
        method: 'POST',
        headers: this.headers(apiKey),
        body: JSON.stringify({
          name: `${firstPost.settings.subject} - ${dayjs().format(
            'YYYY-MM-DD HH:mm'
          )}`,
          subject: firstPost.settings.subject,
          sender: { id: +firstPost.settings.sender },
          htmlContent: `<div style="font-size:15px;line-height:1.6;">${firstPost.message}</div>
<p style="font-size:12px;color:#888888;"><a href="{{ unsubscribe }}">Unsubscribe</a></p>`,
          recipients: { listIds: [+firstPost.settings.list] },
        }),
      })
    ).json();

    // sendNow answers 204 No Content, which this.fetch treats as an error, so
    // it is a plain fetch (still SSRF-safe) with its own error.
    const send = await fetch(
      `${BREVO_API}/emailCampaigns/${campaign.id}/sendNow`,
      {
        method: 'POST',
        headers: this.headers(apiKey),
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      }
    );

    if (!send.ok) {
      const error = await send.text().catch(() => '{}');
      throw new BadBody(
        this.identifier,
        error,
        '{}',
        this.handleErrors(error, send.status)?.value ||
          'Brevo could not send the campaign'
      );
    }

    return [
      {
        id: firstPost.id,
        status: 'completed',
        postId: String(campaign.id),
        releaseURL: '',
      },
    ];
  }
}
