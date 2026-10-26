import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

@Injectable()
export class MetaCallbacksRepository {
  constructor(
    private _integration: PrismaRepository<'integration'>,
    private _posts: PrismaRepository<'post'>
  ) {}

  // Channels connected by a Meta user, in every organization. Page-based
  // channels (facebook, instagram) are created with the app-scoped user id as
  // internalId and keep it in rootInternalId once the page is picked; the
  // other channels use the user id as internalId directly.
  getIntegrationsByMetaUser(
    providers: string[],
    userId: string,
    includeDeleted: boolean
  ) {
    return this._integration.model.integration.findMany({
      where: {
        providerIdentifier: {
          in: providers,
        },
        OR: [{ internalId: userId }, { rootInternalId: userId }],
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      select: {
        id: true,
      },
    });
  }

  // The user removed the app: the tokens no longer work, drop them and ask
  // for a reconnect, the channel and its posts are kept
  disconnectIntegrations(ids: string[]) {
    return this._integration.model.integration.updateMany({
      where: {
        id: {
          in: ids,
        },
      },
      data: {
        token: '',
        refreshToken: null,
        refreshNeeded: true,
      },
    });
  }

  // Meta data deletion request: delete the channel posts and remove
  // everything that came from Meta (ids, names, tokens, picture). Unlike
  // account deletion, nothing is kept hashed: the request is about this data.
  async deleteIntegrationsData(ids: string[]) {
    await this._posts.model.post.updateMany({
      where: {
        integrationId: {
          in: ids,
        },
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    for (const id of ids) {
      await this._integration.model.integration.update({
        select: {
          id: true,
        },
        where: {
          id,
        },
        data: {
          name: 'Deleted channel',
          internalId: `deleted_${makeId(10)}`,
          rootInternalId: null,
          token: '',
          refreshToken: null,
          profile: null,
          picture: null,
          customInstanceDetails: null,
          additionalSettings: '[]',
          inBetweenSteps: false,
          refreshNeeded: false,
          deletedAt: new Date(),
        },
      });
    }
  }
}
