import {
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { IncomingWebhookAbstract } from '@gitroom/nestjs-libraries/integrations/social/incoming.webhook.abstract';
import { Integration } from '@prisma/client';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

@Rules(
  'Rocket.Chat posts the text into a channel and renders Markdown, maximum 5000 characters; pictures and videos are shown under the text'
)
export class RocketChatProvider
  extends IncomingWebhookAbstract
  implements SocialProvider
{
  override maxConcurrentJob = 10;
  identifier = 'rocketchat';
  name = 'Rocket.Chat';

  maxLength() {
    return 5000;
  }

  async customFields() {
    return [
      {
        key: 'url',
        label: 'Webhook URL',
        validation: `/^https:\\/\\/\\S+\\/hooks\\/\\S+$/`,
        type: 'password' as const,
        hint: 'In Rocket.Chat go to Administration > Workspace > Integrations > New > Incoming, pick the channel, enable it, save, then copy the Webhook URL',
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
    if (body.includes('Invalid integration')) {
      return {
        type: 'refresh-token' as const,
        value:
          'The Rocket.Chat webhook no longer exists, please remove this channel and add it again with a new webhook URL',
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

    // hooks/{integrationId}/{token}
    const url = this.parseWebhookUrl(body?.url || '');
    if (!url || !/\/hooks\/[^/]+\/[^/]+\/?$/.test(url.pathname)) {
      return 'This is not a Rocket.Chat incoming webhook URL';
    }

    // Rocket.Chat has no read-only call for an incoming webhook, so it cannot
    // be tested without posting into the channel
    return this.webhookTokenDetails(
      this.webhookId(url.toString()),
      (body?.name || '').trim() || 'Rocket.Chat'
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

    const attachments = (firstPost.media || []).map((p) =>
      p.type === 'video' ? { video_url: p.path } : { image_url: p.path }
    );

    const { body } = await this.sendWebhook(
      url,
      JSON.stringify({
        text: firstPost.message,
        ...(attachments.length ? { attachments } : {}),
      })
    );

    let response: { success?: boolean; error?: string } = {};
    try {
      response = JSON.parse(body);
    } catch (err) {
      response = {};
    }

    if (response.success === false) {
      throw new BadBody(
        this.identifier,
        body,
        '{}',
        response.error || 'Rocket.Chat refused the post'
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
