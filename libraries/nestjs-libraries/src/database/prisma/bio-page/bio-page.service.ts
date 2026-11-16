import { HttpException, Injectable } from '@nestjs/common';
import { uniq } from 'lodash';
import { BioPageRepository } from '@gitroom/nestjs-libraries/database/prisma/bio-page/bio-page.repository';
import {
  BioPageChannelOption,
  BioPageDto,
  bioPageLimits,
  BioPageLink,
  BioPageTheme,
  bioPageThemes,
  BioPageView,
  bioSlugProblem,
  BioSlugAvailability,
  PublicBioPage,
} from '@gitroom/nestjs-libraries/dtos/bio-page/bio-page.dto';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

// '' and spaces only are stored as null, and so is anything that is not a string
const toNullable = (value?: unknown) =>
  (typeof value === 'string' ? value.trim() : '') || null;

// Uploads never set Media.type, the media library tells videos apart by the extension
const isVideoPath = (path: string) =>
  /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(path.split('?')[0]);

// Only http and https addresses can be opened from the page, so a stored link
// can never become javascript: or data:
const isHttpUrl = (url: string) => {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch (err) {
    return false;
  }
};

// The links column is read back as Json, anything that is not a valid link is dropped
const toLinks = (value: unknown): BioPageLink[] =>
  (Array.isArray(value) ? value : [])
    .filter(
      (link) =>
        !!link &&
        typeof link.title === 'string' &&
        typeof link.url === 'string' &&
        !!link.title.trim() &&
        isHttpUrl(link.url.trim())
    )
    .slice(0, bioPageLimits.links)
    .map((link) => ({
      id:
        typeof link.id === 'string' && link.id.trim()
          ? link.id.trim().slice(0, 50)
          : makeId(10),
      title: link.title.trim().slice(0, bioPageLimits.linkTitle),
      url: link.url.trim().slice(0, bioPageLimits.linkUrl),
    }));

const toTheme = (theme: string): BioPageTheme =>
  (bioPageThemes as readonly string[]).includes(theme)
    ? (theme as BioPageTheme)
    : 'light';

@Injectable()
export class BioPageService {
  constructor(
    private _bioPageRepository: BioPageRepository,
    private _integrationManager: IntegrationManager
  ) {}

  async getBioPage(orgId: string): Promise<BioPageView | null> {
    const page = await this._bioPageRepository.getBioPage(orgId);
    if (!page) {
      return null;
    }

    const { avatarMediaId, avatar, links, theme, ...rest } = page;
    return {
      ...rest,
      theme: toTheme(theme),
      links: toLinks(links),
      avatar: avatar ? { id: avatarMediaId, path: avatar } : null,
    };
  }

  // The channels that can be shown on the page: connected, and the provider
  // knows the address of their profile
  async getChannelOptions(orgId: string): Promise<BioPageChannelOption[]> {
    const channels = await this._bioPageRepository.getActiveChannels(orgId);
    return channels.flatMap((channel) => {
      const url = channel.profile
        ? this._integrationManager
            .getSocialIntegration(channel.providerIdentifier)
            ?.profileUrl?.(channel.profile)
        : undefined;

      return url && isHttpUrl(url)
        ? [
            {
              id: channel.id,
              name: channel.customName || channel.name,
              picture: channel.picture || null,
              identifier: channel.providerIdentifier,
              url,
            },
          ]
        : [];
    });
  }

  async checkSlug(orgId: string, slug: string): Promise<BioSlugAvailability> {
    const value = (slug || '').trim().toLowerCase();
    const problem = bioSlugProblem(value);
    if (problem) {
      return { available: false, reason: problem };
    }

    const owner = await this._bioPageRepository.getSlugOwner(value);
    return owner && owner.organizationId !== orgId
      ? { available: false, reason: 'taken' }
      : { available: true };
  }

  async saveBioPage(orgId: string, body: BioPageDto) {
    const slug = body.slug.trim().toLowerCase();
    const availability = await this.checkSlug(orgId, slug);
    if (!availability.available) {
      throw new HttpException(
        {
          message: 'This address can not be used',
          reason: availability.reason,
        },
        400
      );
    }

    // the path is never taken from the client, only from the media of the
    // workspace, and the picture of the page must be an image
    const avatarMediaId = toNullable(body.avatarMediaId);
    const media = avatarMediaId
      ? await this._bioPageRepository.getOrgMediaPath(orgId, avatarMediaId)
      : null;
    const avatar = media && !isVideoPath(media.path) ? media : null;

    try {
      return await this._bioPageRepository.upsertBioPage(orgId, {
        slug,
        title: toNullable(body.title),
        description: toNullable(body.description),
        avatarMediaId: avatar?.id || null,
        avatar: avatar?.path || null,
        theme: toTheme(body.theme),
        links: toLinks(body.links),
        showChannels: !!body.showChannels,
        channelIds: uniq(
          (body.channelIds || []).filter((id) => typeof id === 'string')
        ).slice(0, bioPageLimits.channels),
        published: !!body.published,
      });
    } catch (err: any) {
      // another workspace took the address between the check and the save
      if (err?.code === 'P2002') {
        throw new HttpException(
          { message: 'This address can not be used', reason: 'taken' },
          400
        );
      }
      throw err;
    }
  }

  // Only what the public page shows, nothing of the workspace itself
  async getPublicBioPage(slug: string): Promise<PublicBioPage | null> {
    const value = (slug || '').trim().toLowerCase();
    if (bioSlugProblem(value)) {
      return null;
    }

    const page = await this._bioPageRepository.getPublishedBySlug(value);
    if (!page) {
      return null;
    }

    // the order of the page, and only channels that are still connected
    const options = page.showChannels
      ? await this.getChannelOptions(page.organizationId)
      : [];
    const channels = page.channelIds.flatMap((id) => {
      const channel = options.find((option) => option.id === id);
      return channel
        ? [
            {
              name: channel.name,
              picture: channel.picture,
              identifier: channel.identifier,
              url: channel.url,
            },
          ]
        : [];
    });

    return {
      slug: page.slug,
      title: page.title,
      description: page.description,
      avatar: page.avatar,
      theme: toTheme(page.theme),
      links: toLinks(page.links).map(({ title, url }) => ({ title, url })),
      channels,
    };
  }
}
