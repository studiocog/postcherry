import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const plannerContentMix = [
  'tips',
  'promotions',
  'behind_the_scenes',
  'questions',
  'news',
] as const;
export type PlannerContentMix = (typeof plannerContentMix)[number];

// Every language of the UI plus a few common ones.
// name is what the prompt asks for, native is what the language select shows
export const plannerLanguages = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'he', name: 'Hebrew', native: 'עברית' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'zh', name: 'Chinese', native: '中文' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands' },
  { code: 'pl', name: 'Polish', native: 'Polski' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
] as const;

export const AI_PLANNER_MAX_ITEMS = 60;
export const AI_PLANNER_MAX_DAYS = 31;
export const AI_PLANNER_MAX_POSTS_PER_WEEK = 14;
export const AI_PLANNER_MAX_CHANNELS = 30;

// How many posts a plan gets, shared with the form so it can tell the user before generating
export const plannedPostsCount = (postsPerWeek: number, days: number) =>
  Math.min(
    AI_PLANNER_MAX_ITEMS,
    Math.max(1, Math.round((postsPerWeek * days) / 7))
  );

export class GeneratePlanDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(AI_PLANNER_MAX_CHANNELS)
  @IsString({ each: true })
  integrations: string[];

  // calendar dates of the user, both included
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate: string;

  @IsInt()
  @Min(1)
  @Max(AI_PLANNER_MAX_POSTS_PER_WEEK)
  postsPerWeek: number;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  goals: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(plannerContentMix.length)
  @IsIn([...plannerContentMix], { each: true })
  contentMix?: PlannerContentMix[];

  @IsIn(plannerLanguages.map((p) => p.code))
  language: string;
}

export interface AiPlanItem {
  // only a key for the list, never stored
  id: string;
  // 'YYYY-MM-DD' inside the requested range
  date: string;
  // 'HH:mm', local time of the user
  time: string;
  // never empty, only channels of the plan
  integrationIds: string[];
  title: string;
  category: PlannerContentMix | 'other';
  // plain text with line breaks
  content: string;
}

export type AiPlannerEvent =
  | { name: 'ping' }
  | { name: 'outline' }
  // posts written so far / posts of the plan
  | { name: 'writing'; done: number; total: number }
  | { name: 'result'; status: 'not_configured' }
  | {
      name: 'result';
      status: 'ok';
      items: AiPlanItem[];
      brandVoice: boolean;
      // integration id -> max characters of a post
      channelLimits: Record<string, number>;
    }
  | { name: 'error'; error: true; message: string };
