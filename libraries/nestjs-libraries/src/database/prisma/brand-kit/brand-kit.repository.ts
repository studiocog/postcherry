import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

export interface BrandKitData {
  brandName: string | null;
  logoMediaId: string | null;
  logoPath: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  headingFont: string | null;
  bodyFont: string | null;
  voice: string | null;
  dos: string[];
  donts: string[];
  hashtags: string[];
  website: string | null;
}

@Injectable()
export class BrandKitRepository {
  constructor(
    private _brandKit: PrismaRepository<'brandKit'>,
    private _media: PrismaRepository<'media'>,
    private _post: PrismaRepository<'post'>
  ) {}

  getBrandKit(orgId: string) {
    return this._brandKit.model.brandKit.findUnique({
      where: { organizationId: orgId },
      select: {
        id: true,
        organizationId: true,
        brandName: true,
        logoMediaId: true,
        logoPath: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        headingFont: true,
        bodyFont: true,
        voice: true,
        dos: true,
        donts: true,
        hashtags: true,
        website: true,
        updatedAt: true,
        organization: {
          select: {
            name: true,
          },
        },
      },
    });
  }

  upsertBrandKit(orgId: string, data: BrandKitData) {
    return this._brandKit.model.brandKit.upsert({
      where: { organizationId: orgId },
      create: { ...data, organizationId: orgId },
      update: data,
      select: { id: true },
    });
  }

  // Only media of the workspace itself can become its logo
  getOrgMediaPath(orgId: string, mediaId: string) {
    return this._media.model.media.findFirst({
      where: { id: mediaId, organizationId: orgId, deletedAt: null },
      select: { id: true, path: true },
    });
  }

  getRecentPublishedContent(orgId: string, take: number) {
    return this._post.model.post.findMany({
      where: {
        organizationId: orgId,
        state: 'PUBLISHED',
        deletedAt: null,
        parentPostId: null,
      },
      orderBy: { publishDate: 'desc' },
      take,
      select: { group: true, content: true },
    });
  }
}
