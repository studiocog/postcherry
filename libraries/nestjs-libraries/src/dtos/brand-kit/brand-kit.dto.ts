import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// Common web fonts, the preview uses the font installed on the device
export const brandKitFonts = [
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Raleway',
  'Nunito',
  'Oswald',
  'Playfair Display',
  'Merriweather',
  'Source Sans 3',
  'Arial',
  'Georgia',
] as const;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class BrandKitDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brandName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  logoMediaId?: string | null;

  @ValidateIf((o) => !!o.primaryColor)
  @Matches(HEX_COLOR)
  primaryColor?: string | null;

  @ValidateIf((o) => !!o.secondaryColor)
  @Matches(HEX_COLOR)
  secondaryColor?: string | null;

  @ValidateIf((o) => !!o.accentColor)
  @Matches(HEX_COLOR)
  accentColor?: string | null;

  @ValidateIf((o) => !!o.headingFont)
  @IsIn([...brandKitFonts])
  headingFont?: string | null;

  @ValidateIf((o) => !!o.bodyFont)
  @IsIn([...brandKitFonts])
  bodyFont?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  voice?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  dos?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  donts?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  hashtags?: string[];

  @ValidateIf((o) => !!o.website)
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  website?: string | null;
}

// What getBrandKit() and GET /brand-kit return
export interface BrandKitView {
  id: string;
  organizationId: string;
  // brandName, or the name of the workspace when no brand name is set
  name: string;
  brandName: string | null;
  logo: { id: string | null; path: string } | null;
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
  updatedAt: Date;
}

// "Learn my voice" only suggests, nothing is saved
export type LearnVoiceResult =
  | { status: 'not_configured' }
  | { status: 'no_posts' }
  | {
      status: 'ok';
      voice: string;
      dos: string[];
      donts: string[];
      postsUsed: number;
    };
