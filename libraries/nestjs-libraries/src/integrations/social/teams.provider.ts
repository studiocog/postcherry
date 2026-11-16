import {
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { IncomingWebhookAbstract } from '@gitroom/nestjs-libraries/integrations/social/incoming.webhook.abstract';
import { Integration } from '@prisma/client';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

// Workflows (Power Automate) webhooks, plus the retired Office 365 connector
// URLs that some tenants still have
const TEAMS_HOSTS = [
  'logic.azure.com',
  'webhook.office.com',
  'powerplatform.com',
];

@Rules(
  'Microsoft Teams shows the post as an Adaptive Card in a channel: basic Markdown only (bold, italic, links, lists), no HTML, the whole card must stay under 28 KB; pictures are shown under the text, videos are posted as links'
)
export class TeamsProvider
  extends IncomingWebhookAbstract
  implements SocialProvider
{
  override maxConcurrentJob = 10; // each webhook is throttled above 4 requests per second
  identifier = 'teams';
  name = 'Microsoft Teams';

  maxLength() {
    // the limit is 28 KB for the whole card, leave room for the card itself
    return 25000;
  }

  async customFields() {
    return [
      {
        key: 'url',
        label: 'Webhook URL',
        validation: `/^https:\\/\\/\\S+$/`,
        type: 'password' as const,
        hint: 'In Teams open the channel, ... > Workflows > "Post to a channel when a webhook request is received", then copy the URL it gives you',
      },
      {
        key: 'name',
        label: 'Channel name',
        validation: `/^.{1,100}$/`,
        type: 'text' as const,
      },
    ];
  }

  override handleErrors(body: string, status: number) {
    if (
      body.includes('DirectApiAuthorizationRequired') ||
      body.includes('MisMatchingOAuthClaims')
    ) {
      return {
        type: 'refresh-token' as const,
        value:
          'Teams refused the request: in the workflow trigger set "Who can trigger the flow" to "Anyone", then remove this channel and add it again',
      };
    }

    if (body.includes('WorkflowNotEnabled') || body.includes('FlowDisabled')) {
      return {
        type: 'bad-body' as const,
        value:
          'The Teams workflow is turned off, turn it on in the Workflows app',
      };
    }

    return super.handleErrors(body, status);
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body = this.decodeFields<{ url: string; name: string }>(params.code);

    const url = this.parseWebhookUrl(body?.url || '', TEAMS_HOSTS);
    if (!url) {
      return 'This is not a Microsoft Teams webhook URL';
    }

    // a Teams webhook cannot be tested without posting into the channel
    return this.webhookTokenDetails(
      this.webhookId(url.toString()),
      (body?.name || '').trim() || 'Microsoft Teams'
    );
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const { url } = this.integrationFields<{ url: string }>(integration);

    const images = (firstPost.media || []).filter((p) => p.type !== 'video');
    const videos = (firstPost.media || []).filter((p) => p.type === 'video');

    const text = [
      firstPost.message,
      ...videos.map((p, index) => `[Video ${index + 1}](${p.path})`),
    ]
      .filter((p) => p && p.trim())
      .join('\n\n');

    const { body } = await this.sendWebhook(
      url,
      JSON.stringify({
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            contentUrl: null,
            content: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.4',
              msteams: { width: 'Full' },
              body: [
                ...(text ? [{ type: 'TextBlock', text, wrap: true }] : []),
                ...images.map((p) => ({
                  type: 'Image',
                  url: p.path,
                  altText: p.alt || '',
                  size: 'Stretch',
                })),
              ],
            },
          },
        ],
      })
    );

    // retired Office 365 connectors answer 200 with the failure in the body
    if (body.includes('Webhook message delivery failed')) {
      throw new BadBody(
        this.identifier,
        body,
        '{}',
        'Teams could not deliver the message, please check the webhook'
      );
    }

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
