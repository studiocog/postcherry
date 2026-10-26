import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { MetaCallbacksRepository } from '@gitroom/nestjs-libraries/database/prisma/meta/meta.callbacks.repository';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

// Deauthorize and data deletion callbacks of the Meta apps. Each Meta app
// signs its callbacks with its own secret, the secret that matches tells which
// app sent it and so which channels the app-scoped user id belongs to.
//
// These run from Meta webhooks: nothing here may throw, every failure is
// caught and logged, and the callbacks always answer.
@Injectable()
export class MetaCallbacksService {
  constructor(private _metaCallbacksRepository: MetaCallbacksRepository) {}

  private metaApps() {
    return [
      {
        secret: process.env.FACEBOOK_APP_SECRET,
        providers: ['facebook', 'instagram'],
      },
      {
        secret: process.env.INSTAGRAM_APP_SECRET,
        providers: ['instagram-standalone'],
      },
      {
        secret: process.env.THREADS_APP_SECRET,
        providers: ['threads'],
      },
    ];
  }

  // signed_request is `base64url(HMAC-SHA256(payload, app secret)).payload`
  // where payload is the base64url JSON { algorithm, user_id, issued_at }
  private parseSignedRequest(
    signedRequest: unknown
  ): { userId: string; providers: string[] } | undefined {
    if (typeof signedRequest !== 'string') {
      return undefined;
    }

    const [encodedSignature, payload] = signedRequest.split('.');
    if (!encodedSignature || !payload) {
      return undefined;
    }

    const signature = Buffer.from(encodedSignature, 'base64url');
    const providers = this.metaApps()
      .filter((app) => {
        if (!app.secret) {
          return false;
        }

        const expected = createHmac('sha256', app.secret)
          .update(payload)
          .digest();

        return (
          expected.length === signature.length &&
          timingSafeEqual(expected, signature)
        );
      })
      .flatMap((app) => app.providers);

    if (!providers.length) {
      return undefined;
    }

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (
      String(data?.algorithm).toUpperCase() !== 'HMAC-SHA256' ||
      !data?.user_id
    ) {
      return undefined;
    }

    return { userId: String(data.user_id), providers };
  }

  private confirmationSignature(value: string) {
    return createHmac('sha256', process.env.JWT_SECRET || '')
      .update(`meta-data-deletion:${value}`)
      .digest('hex')
      .slice(0, 16);
  }

  // Stateless code: `{time base36}-{random}-{signature}`, the status page can
  // tell it was issued by us and when, without storing anything about the user
  private createConfirmationCode() {
    const value = `${Date.now().toString(36)}-${makeId(8)}`;
    return `${value}-${this.confirmationSignature(value)}`;
  }

  async deauthorize(signedRequest: unknown) {
    try {
      const request = this.parseSignedRequest(signedRequest);
      if (!request) {
        console.warn('Meta deauthorize callback: invalid signed_request');
        return { success: true };
      }

      const integrations =
        await this._metaCallbacksRepository.getIntegrationsByMetaUser(
          request.providers,
          request.userId,
          false
        );

      if (integrations.length) {
        await this._metaCallbacksRepository.disconnectIntegrations(
          integrations.map((p) => p.id)
        );
      }

      console.log(
        `Meta deauthorize callback: ${integrations.length} channel(s) disconnected`
      );
    } catch (err) {
      console.error(
        'Meta deauthorize callback failed:',
        (err as any)?.message || err
      );
    }

    return { success: true };
  }

  async dataDeletion(signedRequest: unknown) {
    // Meta always gets a code, but only a processed request gets a signed one:
    // the status page reports any other code as unknown
    let confirmationCode = makeId(16);
    try {
      const request = this.parseSignedRequest(signedRequest);
      if (!request) {
        console.warn('Meta data deletion callback: invalid signed_request');
      } else {
        // deleted channels too: deleting a channel only hides it
        const integrations =
          await this._metaCallbacksRepository.getIntegrationsByMetaUser(
            request.providers,
            request.userId,
            true
          );

        if (integrations.length) {
          await this._metaCallbacksRepository.deleteIntegrationsData(
            integrations.map((p) => p.id)
          );
        }

        confirmationCode = this.createConfirmationCode();
        console.log(
          `Meta data deletion callback ${confirmationCode}: ${integrations.length} channel(s) deleted`
        );
      }
    } catch (err) {
      console.error(
        `Meta data deletion callback ${confirmationCode} failed:`,
        (err as any)?.message || err
      );
    }

    return {
      url: `${process.env.NEXT_PUBLIC_BACKEND_URL}/public/meta/deletion-status?code=${encodeURIComponent(
        confirmationCode
      )}`,
      confirmation_code: confirmationCode,
    };
  }

  deletionStatus(code: unknown): { code: string; requestedAt: Date } | false {
    try {
      if (typeof code !== 'string') {
        return false;
      }

      const match = code.match(/^([a-z0-9]{1,12})-([A-Za-z0-9]{8})-([a-f0-9]{16})$/);
      if (!match) {
        return false;
      }

      const expected = Buffer.from(
        this.confirmationSignature(`${match[1]}-${match[2]}`)
      );
      const received = Buffer.from(match[3]);
      if (
        expected.length !== received.length ||
        !timingSafeEqual(expected, received)
      ) {
        return false;
      }

      return { code, requestedAt: new Date(parseInt(match[1], 36)) };
    } catch (err) {
      return false;
    }
  }
}
