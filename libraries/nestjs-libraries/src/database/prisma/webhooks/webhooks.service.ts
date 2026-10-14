import { Injectable } from '@nestjs/common';
import { WebhooksRepository } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.repository';
import {
  UpdateDto,
  WebhooksDto,
  WebhooksIntegrationDto,
} from '@gitroom/nestjs-libraries/dtos/webhooks/webhooks.dto';

@Injectable()
export class WebhooksService {
  constructor(private _webhooksRepository: WebhooksRepository) {}

  getTotal(orgId: string) {
    return this._webhooksRepository.getTotal(orgId);
  }

  getWebhooks(orgId: string) {
    return this._webhooksRepository.getWebhooks(orgId);
  }

  // A webhook can only be linked to the org's own channels. No channel means
  // every channel, so a list with an unknown id is refused, not trimmed
  async ownsIntegrations(
    orgId: string,
    integrations: WebhooksIntegrationDto[]
  ) {
    if (!Array.isArray(integrations)) {
      return false;
    }

    const ids = [
      ...new Set(integrations.map((integration) => integration?.id)),
    ];
    if (!ids.length) {
      return true;
    }

    if (ids.some((id) => typeof id !== 'string' || !id)) {
      return false;
    }

    const found = await this._webhooksRepository.getOrgIntegrationIds(
      orgId,
      ids
    );
    return found.length === ids.length;
  }

  createWebhook(orgId: string, body: WebhooksDto) {
    return this._webhooksRepository.createWebhook(orgId, body);
  }

  updateWebhook(orgId: string, body: UpdateDto) {
    return this._webhooksRepository.updateWebhook(orgId, body);
  }

  deleteWebhook(orgId: string, id: string) {
    return this._webhooksRepository.deleteWebhook(orgId, id);
  }
}
