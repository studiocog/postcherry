import {
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { IncomingWebhookAbstract } from '@gitroom/nestjs-libraries/integrations/social/incoming.webhook.abstract';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { Integration } from '@prisma/client';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';

@Rules(
  'Mattermost posts the text into a channel and renders Markdown, maximum 16383 characters; pictures are shown under the text, videos are posted as links'
)
export class MattermostProvider
  extends IncomingWebhookAbstract
  implements SocialProvider
{
  override maxConcurrentJob = 10;
  identifier = 'mattermost';
  name = 'Mattermost';

  maxLength() {
    return 16383;
  }

  async customFields() {
    return [
      {
        key: 'url',
        label: 'Webhook URL',
        validation: `/^https:\\/\\/\\S+\\/hooks\\/[A-Za-z0-9]+\\/?$/`,
        type: 'password' as const,
        hint: 'In Mattermost go to Product menu > Integrations > Incoming Webhooks > Add Incoming Webhook, pick the channel, then copy the URL',
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
    if (body.includes('web.incoming_webhook.invalid')) {
      return {
        type: 'refresh-token' as const,
        value:
          'The Mattermost webhook no longer exists, please remove this channel and add it again with a new webhook URL',
      };
    }

    if (body.includes('web.incoming_webhook.disabled') || status === 501) {
      return {
        type: 'bad-body' as const,
        value: 'Incoming webhooks are turned off on this Mattermost server',
      };
    }

    if (body.includes('web.incoming_webhook.channel')) {
      return {
        type: 'bad-body' as const,
        value: 'The Mattermost channel of this webhook no longer exists',
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

    const url = this.parseWebhookUrl(body?.url || '');
    if (!url || !/\/hooks\/[A-Za-z0-9]+\/?$/.test(url.pathname)) {
      return 'This is not a Mattermost incoming webhook URL';
    }

    // An empty payload is refused without posting anything. It catches an
    // unreachable server, a wrong path and webhooks turned off on the server;
    // an unknown webhook id cannot be told apart (Mattermost checks the empty
    // text before it looks the webhook up), that one fails on the first post.
    try {
      const probe = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(30_000),
        // @ts-ignore - undici-only option; blocks SSRF to internal IPs
        dispatcher: getSsrfSafeDispatcher(),
      });
      const text = await probe.text();

      if (
        probe.status === 404 ||
        text.includes('web.incoming_webhook.invalid')
      ) {
        return 'This Mattermost webhook does not exist';
      }

      if (
        probe.status === 501 ||
        text.includes('web.incoming_webhook.disabled')
      ) {
        return 'Incoming webhooks are turned off on this Mattermost server';
      }
    } catch (err) {
      return 'Could not reach the Mattermost server';
    }

    return this.webhookTokenDetails(
      this.webhookId(url.toString()),
      (body?.name || '').trim() || 'Mattermost'
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

    await this.sendWebhook(
      url,
      JSON.stringify({
        text,
        ...(images.length
          ? {
              attachments: images.map((p) => ({
                fallback: p.alt || 'Picture',
                image_url: p.path,
              })),
            }
          : {}),
      })
    );

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
