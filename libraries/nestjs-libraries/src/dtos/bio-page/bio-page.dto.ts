import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// Shared with the settings form, so it can say what is wrong before saving
export const bioPageLimits = {
  links: 30,
  linkTitle: 80,
  linkUrl: 2000,
  title: 80,
  description: 300,
  slugMin: 3,
  slugMax: 30,
  channels: 30,
} as const;

// The presets of the public page, in the PostCherry colors
export const bioPageThemes = ['light', 'dark', 'cherry', 'blush'] as const;
export type BioPageTheme = (typeof bioPageThemes)[number];

// lowercase letters, numbers and dashes, no dash at the start or the end
export const BIO_SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// Addresses that could be mistaken for PostCherry itself
export const bioPageReservedSlugs = [
  'about',
  'account',
  'admin',
  'administrator',
  'api',
  'app',
  'approve',
  'auth',
  'billing',
  'bio',
  'blog',
  'contact',
  'dashboard',
  'docs',
  'help',
  'home',
  'info',
  'launches',
  'login',
  'logout',
  'mail',
  'media',
  'null',
  'official',
  'postcherry',
  'postiz',
  'pricing',
  'privacy',
  'register',
  'root',
  'security',
  'settings',
  'signin',
  'signup',
  'staff',
  'status',
  'support',
  'system',
  'team',
  'terms',
  'undefined',
  'uploads',
  'www',
];

// Why a slug can not be used, null when it can (taken is checked by the server)
export const bioSlugProblem = (
  slug: string
): 'length' | 'format' | 'reserved' | null => {
  if (
    slug.length < bioPageLimits.slugMin ||
    slug.length > bioPageLimits.slugMax
  ) {
    return 'length';
  }

  if (!BIO_SLUG.test(slug)) {
    return 'format';
  }

  return bioPageReservedSlugs.includes(slug) ? 'reserved' : null;
};

export class BioPageLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(bioPageLimits.linkTitle)
  title: string;

  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(bioPageLimits.linkUrl)
  url: string;
}

export class BioPageDto {
  @IsString()
  @MinLength(bioPageLimits.slugMin)
  @MaxLength(bioPageLimits.slugMax)
  @Matches(BIO_SLUG)
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(bioPageLimits.title)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(bioPageLimits.description)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  avatarMediaId?: string | null;

  @IsIn([...bioPageThemes])
  theme: BioPageTheme;

  @IsArray()
  @ArrayMaxSize(bioPageLimits.links)
  @Type(() => BioPageLinkDto)
  @ValidateNested({ each: true })
  links: BioPageLinkDto[];

  @IsBoolean()
  showChannels: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(bioPageLimits.channels)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  channelIds?: string[];

  @IsBoolean()
  published: boolean;
}

export class BioSlugDto {
  @IsString()
  @MaxLength(100)
  slug: string;
}

// a type and not an interface, so it can be stored in the Json column
export type BioPageLink = {
  id: string;
  title: string;
  url: string;
};

// A channel that can be shown as an icon, only what the public page needs
export interface BioPageChannel {
  name: string;
  picture: string | null;
  identifier: string;
  url: string;
}

// What GET /bio-page returns
export interface BioPageView {
  slug: string;
  title: string | null;
  description: string | null;
  avatar: { id: string | null; path: string } | null;
  theme: BioPageTheme;
  links: BioPageLink[];
  showChannels: boolean;
  channelIds: string[];
  published: boolean;
  updatedAt: Date;
}

// GET /bio-page/channels: the channels of the workspace that have a public profile
export interface BioPageChannelOption extends BioPageChannel {
  id: string;
}

// What GET /public/bio/:slug returns, nothing of the workspace but the page
export interface PublicBioPage {
  slug: string;
  title: string | null;
  description: string | null;
  avatar: string | null;
  theme: BioPageTheme;
  links: Omit<BioPageLink, 'id'>[];
  channels: BioPageChannel[];
}

export type BioSlugAvailability = {
  available: boolean;
  reason?: 'length' | 'format' | 'reserved' | 'taken';
};
