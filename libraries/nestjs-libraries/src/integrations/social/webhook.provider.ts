import { createHmac } from 'crypto';
import {
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { IncomingWebhookAbstract } from '@gitroom/nestjs-libraries/integrations/social/incoming.webhook.abstract';
import { Integration } from '@prisma/client';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

type WebhookFields = { url: string; secret?: string };

@Rules(
  'Webhook sends the post as JSON to the URL the user connected (Zapier, Make, n8n or any other service): plain text, maximum 100000 characters, pictures and videos are sent as public URLs'
)
export class WebhookProvider
  extends IncomingWebhookAbstract
  implements SocialProvider
{
  override maxConcurrentJob = 10;
  identifier = 'webhook';
  name = 'Webhook';

  maxLength() {
    return 100000;
  }

  async customFields() {
    return [
      {
        key: 'url',
        label: 'Webhook URL',
        validation: `/^https:\\/\\/\\S+$/`,
        type: 'password' as const,
        hint: 'The https URL that receives the posts, for example the URL of a Zapier "Catch Hook", a Make "Custom webhook" or an n8n "Webhook" node',
      },
      {
        key: 'secret',
        label: 'Signing secret',
        defaultValue: '-',
        validation: `/^.{1,200}$/`,
        type: 'password' as const,
        hint: 'Every request gets an X-PostCherry-Signature header (sha256= HMAC of the body with this secret). Leave - to send unsigned requests',
      },
    ];
  }

  // "-" (the default) means no signing, the connect form requires every field
  private signingSecret(fields: WebhookFields) {
    const secret = (fields.secret || '').trim();
    return secret && secret !== '-' ? secret : '';
  }

  private async send(fields: WebhookFields, payload: object, test = false) {
    const body = JSON.stringify(payload);
    const secret = this.signingSecret(fields);

    // the connect test is a single short attempt so the connect request
    // cannot hang on a slow endpoint
    return this.sendWebhook(
      fields.url,
      body,
      {
        'User-Agent': 'PostCherry-Webhook',
        ...(secret
          ? {
              'X-PostCherry-Signature': `sha256=${createHmac('sha256', secret)
                .update(body)
                .digest('hex')}`,
            }
          : {}),
      },
      test ? 3 : 0,
      test ? 15_000 : undefined
    );
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const fields = this.decodeFields<WebhookFields>(params.code);

    const url = this.parseWebhookUrl(fields?.url || '');
    if (!fields || !url) {
      return 'The webhook URL must be a valid https URL';
    }

    try {
      await this.send(
        { ...fields, url: url.toString() },
        { event: 'ping', sentAt: new Date().toISOString() },
        true
      );
    } catch (err) {
      return 'The webhook URL did not accept a test request (it must answer with a 2xx status)';
    }

    return this.webhookTokenDetails(this.webhookId(url.toString()), url.host);
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const fields = this.integrationFields<WebhookFields>(integration);

    await this.send(fields, {
      event: 'post.published',
      postId: firstPost.id,
      message: firstPost.message,
      media: (firstPost.media || []).map((p) => ({
        type: p.type,
        url: p.path,
      })),
      publishedAt: new Date().toISOString(),
    });

    return [
      {
        id: firstPost.id,
        postId: firstPost.id,
        releaseURL: '',
        status: 'completed',
      },
    ];
  }
}
