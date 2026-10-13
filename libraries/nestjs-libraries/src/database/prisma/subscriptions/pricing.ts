export interface PricingInnerInterface {
  current: string;
  month_price: number;
  year_price: number;
  channel?: number;
  // new plans only: the number of brands sold on the website, always
  // channel === brands * CHANNELS_PER_BRAND
  brands?: number;
  posts_per_month: number;
  team_members: boolean;
  community_features: boolean;
  featured_by_gitroom: boolean;
  ai: boolean;
  import_from_channels: boolean;
  image_generator?: boolean;
  image_generation_count: number;
  generate_videos: number;
  clipping_minutes: number;
  public_api: boolean;
  webhooks: number;
  autoPost: boolean;
  // recurring posts (`inter` on a post)
  recurring_posts: boolean;
  // the public /p/:id preview page and its comments
  preview_links: boolean;
  // the REST public API (/public/v1), with an API key or an OAuth app token,
  // which also powers the CLI and the agent skills. MCP connectors are not
  // part of it, they work on every plan
  developer_api: boolean;
}
export interface PricingInterface {
  [key: string]: PricingInnerInterface;
}

// A "brand" is not a stored entity, it is sold as a bundle of connected social
// accounts: the plan's channel limit (Subscription.totalChannels, enforced by
// Sections.CHANNEL) is brands * CHANNELS_PER_BRAND. The billing page always
// shows both numbers, e.g. "Up to 5 brands (50 social accounts)".
export const CHANNELS_PER_BRAND = 10;

// Tiers sold before the PostCherry plans, kept as-is for existing subscribers
export const LEGACY_TIERS = ['STANDARD', 'TEAM', 'PRO', 'ULTIMATE'] as const;
// The plans sold on the PostCherry website
export const NEW_TIERS = [
  'PERSONAL',
  'CREATOR',
  'BUSINESS',
  'BUSINESS_PLUS',
  'FREELANCER',
  'AGENCY',
  'AGENCY_PRO',
] as const;
export const PAID_TIERS = [...LEGACY_TIERS, ...NEW_TIERS] as const;

export type LegacyTier = (typeof LEGACY_TIERS)[number];
export type NewTier = (typeof NEW_TIERS)[number];
export type PaidTier = (typeof PAID_TIERS)[number];
export type BillingTier = 'FREE' | PaidTier;

// Who a plan is made for, it matches the workspace account type
export type PlanAudience = 'INDIVIDUAL' | 'BUSINESS' | 'AGENCY';
export const PLAN_GROUPS: Record<PlanAudience, NewTier[]> = {
  INDIVIDUAL: ['PERSONAL', 'CREATOR'],
  BUSINESS: ['BUSINESS', 'BUSINESS_PLUS'],
  AGENCY: ['FREELANCER', 'AGENCY', 'AGENCY_PRO'],
};
export const POPULAR_PLAN: Record<PlanAudience, NewTier> = {
  INDIVIDUAL: 'CREATOR',
  BUSINESS: 'BUSINESS',
  AGENCY: 'AGENCY',
};

// Account type -> plan audience, a workspace without an account type sees the agency plans
export const audienceForAccountType = (
  accountType?: string | null
): PlanAudience =>
  accountType === 'INDIVIDUAL'
    ? 'INDIVIDUAL'
    : accountType === 'BUSINESS'
    ? 'BUSINESS'
    : 'AGENCY';

export const isPaidTier = (tier?: string | null): tier is PaidTier =>
  !!tier && (PAID_TIERS as readonly string[]).includes(tier);
export const isNewTier = (tier?: string | null): tier is NewTier =>
  !!tier && (NEW_TIERS as readonly string[]).includes(tier);
export const isLegacyTier = (tier?: string | null): tier is LegacyTier =>
  !!tier && (LEGACY_TIERS as readonly string[]).includes(tier);

// Plan flags that can gate a feature (SubscriptionService.hasPlanFeature)
export type PlanFeatureFlag =
  | 'recurring_posts'
  | 'preview_links'
  | 'developer_api'
  | 'autoPost'
  | 'team_members';

export const pricing: PricingInterface = {
  FREE: {
    current: 'FREE',
    month_price: 0,
    year_price: 0,
    channel: 0,
    image_generation_count: 0,
    posts_per_month: 0,
    team_members: false,
    community_features: false,
    featured_by_gitroom: false,
    ai: false,
    import_from_channels: false,
    image_generator: false,
    public_api: false,
    webhooks: 0,
    autoPost: false,
    generate_videos: 0,
    clipping_minutes: 0,
    recurring_posts: false,
    preview_links: false,
    developer_api: false,
  },
  STANDARD: {
    current: 'STANDARD',
    month_price: 29,
    year_price: 278,
    channel: 5,
    posts_per_month: 1000000,
    image_generation_count: 20,
    team_members: false,
    ai: true,
    community_features: false,
    featured_by_gitroom: false,
    import_from_channels: true,
    image_generator: false,
    public_api: true,
    webhooks: 2,
    autoPost: false,
    generate_videos: 3,
    clipping_minutes: 60,
    recurring_posts: true,
    preview_links: true,
    developer_api: true,
  },
  TEAM: {
    current: 'TEAM',
    month_price: 39,
    year_price: 374,
    channel: 10,
    posts_per_month: 1000000,
    image_generation_count: 100,
    community_features: true,
    team_members: true,
    featured_by_gitroom: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 10,
    autoPost: true,
    generate_videos: 10,
    clipping_minutes: 120,
    recurring_posts: true,
    preview_links: true,
    developer_api: true,
  },
  PRO: {
    current: 'PRO',
    month_price: 49,
    year_price: 470,
    channel: 30,
    posts_per_month: 1000000,
    image_generation_count: 300,
    community_features: true,
    team_members: true,
    featured_by_gitroom: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 30,
    autoPost: true,
    generate_videos: 30,
    clipping_minutes: 300,
    recurring_posts: true,
    preview_links: true,
    developer_api: true,
  },
  ULTIMATE: {
    current: 'ULTIMATE',
    month_price: 99,
    year_price: 950,
    channel: 100,
    posts_per_month: 1000000,
    image_generation_count: 500,
    community_features: true,
    team_members: true,
    featured_by_gitroom: true,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 10000,
    autoPost: true,
    generate_videos: 60,
    clipping_minutes: 600,
    recurring_posts: true,
    preview_links: true,
    developer_api: true,
  },
  PERSONAL: {
    current: 'PERSONAL',
    month_price: 9,
    year_price: 90,
    brands: 1,
    channel: 1 * CHANNELS_PER_BRAND,
    posts_per_month: 1000000,
    image_generation_count: 0,
    team_members: false,
    community_features: false,
    featured_by_gitroom: false,
    ai: true,
    import_from_channels: true,
    image_generator: false,
    public_api: true,
    webhooks: 0,
    autoPost: false,
    generate_videos: 0,
    clipping_minutes: 0,
    recurring_posts: false,
    preview_links: false,
    developer_api: false,
  },
  CREATOR: {
    current: 'CREATOR',
    month_price: 19,
    year_price: 190,
    brands: 1,
    channel: 1 * CHANNELS_PER_BRAND,
    posts_per_month: 1000000,
    image_generation_count: 100,
    team_members: false,
    community_features: false,
    featured_by_gitroom: false,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 0,
    autoPost: false,
    generate_videos: 10,
    clipping_minutes: 60,
    recurring_posts: true,
    preview_links: true,
    developer_api: false,
  },
  BUSINESS: {
    current: 'BUSINESS',
    month_price: 19,
    year_price: 190,
    brands: 1,
    channel: 1 * CHANNELS_PER_BRAND,
    posts_per_month: 1000000,
    image_generation_count: 100,
    team_members: true,
    community_features: false,
    featured_by_gitroom: false,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 0,
    autoPost: true,
    generate_videos: 10,
    clipping_minutes: 60,
    recurring_posts: false,
    preview_links: false,
    developer_api: false,
  },
  BUSINESS_PLUS: {
    current: 'BUSINESS_PLUS',
    month_price: 49,
    year_price: 490,
    brands: 3,
    channel: 3 * CHANNELS_PER_BRAND,
    posts_per_month: 1000000,
    image_generation_count: 300,
    team_members: true,
    community_features: false,
    featured_by_gitroom: false,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 0,
    autoPost: true,
    generate_videos: 30,
    clipping_minutes: 120,
    recurring_posts: true,
    preview_links: true,
    developer_api: false,
  },
  FREELANCER: {
    current: 'FREELANCER',
    month_price: 29,
    year_price: 290,
    brands: 5,
    channel: 5 * CHANNELS_PER_BRAND,
    posts_per_month: 1000000,
    image_generation_count: 0,
    team_members: true,
    community_features: false,
    featured_by_gitroom: false,
    ai: true,
    import_from_channels: true,
    image_generator: false,
    public_api: true,
    webhooks: 0,
    autoPost: false,
    generate_videos: 0,
    clipping_minutes: 0,
    recurring_posts: false,
    preview_links: false,
    developer_api: false,
  },
  AGENCY: {
    current: 'AGENCY',
    month_price: 79,
    year_price: 790,
    brands: 15,
    channel: 15 * CHANNELS_PER_BRAND,
    posts_per_month: 1000000,
    image_generation_count: 300,
    team_members: true,
    community_features: false,
    featured_by_gitroom: false,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 0,
    autoPost: true,
    generate_videos: 30,
    clipping_minutes: 300,
    recurring_posts: true,
    preview_links: true,
    developer_api: false,
  },
  AGENCY_PRO: {
    current: 'AGENCY_PRO',
    month_price: 199,
    year_price: 1990,
    brands: 50,
    channel: 50 * CHANNELS_PER_BRAND,
    posts_per_month: 1000000,
    image_generation_count: 500,
    team_members: true,
    community_features: false,
    featured_by_gitroom: false,
    ai: true,
    import_from_channels: true,
    image_generator: true,
    public_api: true,
    webhooks: 1000,
    autoPost: true,
    generate_videos: 60,
    clipping_minutes: 600,
    recurring_posts: true,
    preview_links: true,
    developer_api: true,
  },
};
