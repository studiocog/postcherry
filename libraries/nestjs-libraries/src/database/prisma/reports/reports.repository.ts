import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReportsRepository {
  constructor(
    private _integration: PrismaRepository<'integration'>,
    private _post: PrismaRepository<'post'>
  ) {}

  // Never selects the tokens of a channel
  getReportChannels(orgId: string, ids?: string[]) {
    return this._integration.model.integration.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        ...(ids?.length ? { id: { in: ids } } : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        customName: true,
        providerIdentifier: true,
        type: true,
        disabled: true,
        refreshNeeded: true,
        inBetweenSteps: true,
      },
    });
  }

  // Top-level posts only (thread children share a parentPostId), same as the admin stats
  private publishedWhere(
    orgId: string,
    integrationIds: string[],
    start: Date,
    end: Date
  ): Prisma.PostWhereInput {
    return {
      organizationId: orgId,
      integrationId: { in: integrationIds },
      state: 'PUBLISHED',
      deletedAt: null,
      parentPostId: null,
      publishDate: { gte: start, lte: end },
    };
  }

  countPublishedByChannel(
    orgId: string,
    integrationIds: string[],
    start: Date,
    end: Date
  ) {
    return this._post.model.post.groupBy({
      by: ['integrationId'],
      where: this.publishedWhere(orgId, integrationIds, start, end),
      _count: { _all: true },
    });
  }

  // Drafts and failed posts are not counted
  countScheduledByChannel(orgId: string, integrationIds: string[], from: Date) {
    return this._post.model.post.groupBy({
      by: ['integrationId'],
      where: {
        organizationId: orgId,
        integrationId: { in: integrationIds },
        state: 'QUEUE',
        deletedAt: null,
        parentPostId: null,
        publishDate: { gte: from },
      },
      _count: { _all: true },
    });
  }

  getRecentPublishedPosts(
    orgId: string,
    integrationIds: string[],
    start: Date,
    end: Date,
    take: number
  ) {
    return this._post.model.post.findMany({
      where: this.publishedWhere(orgId, integrationIds, start, end),
      orderBy: { publishDate: 'desc' },
      take,
      select: {
        id: true,
        publishDate: true,
        content: true,
        releaseURL: true,
        integrationId: true,
      },
    });
  }
}
