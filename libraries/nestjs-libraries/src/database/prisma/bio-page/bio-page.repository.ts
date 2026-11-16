import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { BioPageLink } from '@gitroom/nestjs-libraries/dtos/bio-page/bio-page.dto';

export interface BioPageData {
  slug: string;
  title: string | null;
  description: string | null;
  avatar: string | null;
  avatarMediaId: string | null;
  theme: string;
  links: BioPageLink[];
  showChannels: boolean;
  channelIds: string[];
  published: boolean;
}

const bioPageSelect = {
  slug: true,
  title: true,
  description: true,
  avatarMediaId: true,
  avatar: true,
  theme: true,
  links: true,
  showChannels: true,
  channelIds: true,
  published: true,
  updatedAt: true,
} as const;

@Injectable()
export class BioPageRepository {
  constructor(
    private _bioPage: PrismaRepository<'bioPage'>,
    private _media: PrismaRepository<'media'>,
    private _integration: PrismaRepository<'integration'>
  ) {}

  getBioPage(orgId: string) {
    return this._bioPage.model.bioPage.findFirst({
      where: { organizationId: orgId, deletedAt: null },
      select: bioPageSelect,
    });
  }

  // a page of a deleted workspace is not shown
  getPublishedBySlug(slug: string) {
    return this._bioPage.model.bioPage.findFirst({
      where: {
        slug,
        published: true,
        deletedAt: null,
        organization: { deletedAt: null },
      },
      select: { ...bioPageSelect, organizationId: true },
    });
  }

  getSlugOwner(slug: string) {
    return this._bioPage.model.bioPage.findUnique({
      where: { slug },
      select: { organizationId: true },
    });
  }

  upsertBioPage(orgId: string, data: BioPageData) {
    return this._bioPage.model.bioPage.upsert({
      where: { organizationId: orgId },
      create: { ...data, organizationId: orgId },
      update: { ...data, deletedAt: null },
      select: { slug: true },
    });
  }

  // Only media of the workspace itself can become the picture of the page
  getOrgMediaPath(orgId: string, mediaId: string) {
    return this._media.model.media.findFirst({
      where: { id: mediaId, organizationId: orgId, deletedAt: null },
      select: { id: true, path: true },
    });
  }

  // the connected channels, never the tokens
  getActiveChannels(orgId: string) {
    return this._integration.model.integration.findMany({
      where: {
        organizationId: orgId,
        deletedAt: null,
        disabled: false,
        inBetweenSteps: false,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        customName: true,
        picture: true,
        providerIdentifier: true,
        profile: true,
      },
    });
  }
}
