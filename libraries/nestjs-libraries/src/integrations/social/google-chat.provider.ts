import {
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { IncomingWebhookAbstract } from '@gitroom/nestjs-libraries/integrations/social/incoming.webhook.abstract';
import { Integration } from '@prisma/client';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

@Rules(
  'Google Chat posts plain text into a space (supports *bold*, _italic_, ~strike~ and links), maximum 4096 characters; pictures are shown in a card under the text, videos are posted as links'
)
export class GoogleChatProvider
  extends IncomingWebhookAbstract
  implements SocialProvider
{
  override maxConcurrentJob = 10; // 1 message per second per space
  identifier = 'google-chat';
  name = 'Google Chat';

  maxLength() {
    return 4096;
  }

  async customFields() {
    return [
      {
        key: 'url',
        label: 'Webhook URL',
        validation: `/^https:\\/\\/chat\\.googleapis\\.com\\/v1\\/spaces\\/\\S+$/`,
        type: 'password' as const,
        hint: 'In Google Chat open the space, Apps & integrations > Webhooks > Add webhook, then copy the URL',
      },
      {
        key: 'name',
        label: 'Space name',
        validation: `/^.{1,100}$/`,
        type: 'text' as const,
      },
    ];
  }

  override handleErrors(body: string, status: number) {
    if (body.includes('API key not valid')) {
      return {
        type: 'refresh-token' as const,
        value:
          'Google Chat rejected the webhook URL, please remove this channel and add it again with a new webhook URL',
      };
    }

    if (status === 400 && body.includes('INVALID_ARGUMENT')) {
      return {
        type: 'bad-body' as const,
        value:
          'Google Chat refused the message, please check its text and pictures',
      };
    }

    return super.handleErrors(body, status);
  }

  // spaces/{space}/messages with key and token in the query
  private spaceId(url: URL) {
    return url.pathname.match(/^\/v1\/spaces\/([^/]+)\/messages$/)?.[1];
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body = this.decodeFields<{ url: string; name: string }>(params.code);

    const url = this.parseWebhookUrl(body?.url || '');
    if (
      !url ||
      url.hostname !== 'chat.googleapis.com' ||
      !this.spaceId(url) ||
      !url.searchParams.get('key') ||
      !url.searchParams.get('token')
    ) {
      return 'This is not a Google Chat webhook URL';
    }

    // a Google Chat webhook cannot be tested without posting into the space
    return this.webhookTokenDetails(
      this.webhookId(url.toString()),
      (body?.name || '').trim() || 'Google Chat'
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

    const text = [firstPost.message, ...videos.map((p) => p.path)]
      .filter((p) => p && p.trim())
      .join('\n\n');

    const { body } = await this.sendWebhook(
      url,
      JSON.stringify({
        ...(text ? { text } : {}),
        ...(images.length
          ? {
              cardsV2: [
                {
                  cardId: 'media',
                  card: {
                    sections: [
                      {
                        widgets: images.map((p) => ({
                          image: {
                            imageUrl: p.path,
                            altText: p.alt || '',
                          },
                        })),
                      },
                    ],
                  },
                },
              ],
            }
          : {}),
      }),
      { 'Content-Type': 'application/json; charset=UTF-8' }
    );

    // the webhook answers with the message, only name and thread are set
    let name = '';
    try {
      name = JSON.parse(body)?.name || '';
    } catch (err) {
      name = '';
    }

    const spaceId = this.spaceId(new URL(url));

    return [
      {
        id: firstPost.id,
        postId: name || firstPost.id,
        releaseURL: spaceId ? `https://chat.google.com/room/${spaceId}` : '',
        status: 'completed',
      },
    ];
  }
}
