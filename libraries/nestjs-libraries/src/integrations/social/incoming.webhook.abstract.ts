import { createHash } from 'crypto';
import dayjs from 'dayjs';
import { Integration } from '@prisma/client';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { timer } from '@gitroom/helpers/utils/timer';
import {
  BadBody,
  Disconnect,
  RefreshToken,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { AuthTokenDetails } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import { setHeartbeatDetails } from '@gitroom/nestjs-libraries/temporal/temporal.heartbeat';

// A healthy webhook answers in about a second; this only stops a stalled
// request from holding the activity's worker slot.
const WEBHOOK_TIMEOUT = 60_000;

// Base for channels that post through an incoming webhook URL the user pastes
// (Teams, Google Chat, Mattermost, Rocket.Chat, generic webhooks). The URL is
// the credential: it lives only in the encrypted customInstanceDetails, the
// channel id is a hash of it, and it never goes into heartbeats or failures.
//
// Webhooks answer 202 / 204 as often as 200, which this.fetch treats as an
// error, so they are sent with sendWebhook (same SSRF-safe dispatcher, retry
// and handleErrors classification).
export abstract class IncomingWebhookAbstract extends SocialAbstract {
  abstract name: string;
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;

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

  override handleErrors(
    body: string,
    status: number
  ):
    | {
        type: 'refresh-token' | 'bad-body' | 'retry' | 'disconnect';
        value: string;
      }
    | undefined {
    if (status === 404 || status === 410) {
      return {
        type: 'refresh-token',
        value: `The ${this.name} webhook no longer exists, please remove this channel and add it again with a new webhook URL`,
      };
    }

    if (status === 401 || status === 403) {
      return {
        type: 'refresh-token',
        value: `${this.name} rejected the webhook URL, please remove this channel and add it again with a new webhook URL`,
      };
    }

    if (status === 413) {
      return {
        type: 'bad-body',
        value: `The post is too large for ${this.name}, please shorten it`,
      };
    }

    return undefined;
  }

  // The fields the user typed in the connect form (base64 JSON in `code`)
  protected decodeFields<T>(code: string): T | undefined {
    try {
      return JSON.parse(Buffer.from(code, 'base64').toString());
    } catch (err) {
      return undefined;
    }
  }

  protected integrationFields<T>(integration: Integration): T {
    return JSON.parse(
      AuthService.fixedDecryption(integration.customInstanceDetails!)
    );
  }

  // Stable id per destination that never exposes the URL (the URL is the secret)
  protected webhookId(url: string) {
    return createHash('sha256').update(url.trim()).digest('hex').slice(0, 24);
  }

  // https only, and when `hosts` is set the host must be one of them or a
  // sub-domain of one of them
  protected parseWebhookUrl(value: string, hosts?: string[]): URL | undefined {
    let url: URL;
    try {
      url = new URL((value || '').trim());
    } catch (err) {
      return undefined;
    }

    if (url.protocol !== 'https:' || !url.hostname) {
      return undefined;
    }

    const hostname = url.hostname.toLowerCase();
    if (
      hosts?.length &&
      !hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))
    ) {
      return undefined;
    }

    return url;
  }

  protected webhookTokenDetails(
    id: string,
    name: string,
    picture = ''
  ): AuthTokenDetails {
    return {
      id,
      name,
      // the URL stays in customInstanceDetails, the token only has to be set
      accessToken: id,
      refreshToken: id,
      expiresIn: dayjs().add(100, 'years').unix() - dayjs().unix(),
      picture,
      username: name,
    };
  }

  // POSTs a JSON body to the webhook. Any 2xx is a success; the rest goes
  // through the same retry / handleErrors rules as this.fetch.
  // `totalRetries` = 3 sends a single attempt (used to test a URL on connect).
  protected async sendWebhook(
    url: string,
    body: string,
    headers: Record<string, string> = {},
    totalRetries = 0,
    timeout = WEBHOOK_TIMEOUT
  ): Promise<{ status: number; body: string }> {
    // only the origin: the path / query of a webhook URL is its secret
    setHeartbeatDetails(`webhook ${new URL(url).origin}`);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body,
        signal: AbortSignal.timeout(timeout),
        // @ts-ignore - undici-only option, not in the lib.dom RequestInit type
        dispatcher: getSsrfSafeDispatcher(),
      });
    } catch (err: any) {
      // A stall or a dropped connection can come after the webhook already
      // delivered the post, so it is not retried (a retry could post twice).
      // Only the error name is kept: the message can carry the URL.
      throw new BadBody(
        this.identifier,
        JSON.stringify({ error: err?.cause?.name || err?.name || 'Error' }),
        '{}',
        `Could not reach ${this.name} or confirm that the post was delivered`
      );
    }

    let text = '';
    try {
      text = await response.text();
    } catch (err) {
      text = '';
    }

    if (response.status >= 200 && response.status < 300) {
      return { status: response.status, body: text };
    }

    const json = text || '{}';
    const handleError = this.handleErrors(json, response.status);

    // like this.fetch, a 502 / 504 is not retried: a gateway can answer it
    // after the post was already delivered
    if (
      totalRetries < 3 &&
      (response.status === 429 ||
        ((response.status === 500 || response.status === 503) &&
          !handleError) ||
        handleError?.type === 'retry')
    ) {
      await timer(5000);
      return this.sendWebhook(url, body, headers, totalRetries + 1, timeout);
    }

    if (handleError?.type === 'disconnect') {
      throw new Disconnect(this.identifier, json, '{}', handleError.value);
    }

    if (handleError?.type === 'refresh-token') {
      throw new RefreshToken(this.identifier, json, '{}', handleError.value);
    }

    throw new BadBody(
      this.identifier,
      json,
      '{}',
      handleError?.value ||
        `${this.name} refused the post (HTTP ${response.status})`
    );
  }
}
