import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// The filters of the customers list
export const adminCustomerStatuses = [
  'paying',
  'trial',
  'cancelling',
  'owner',
  'free',
  'none',
  'never_posted',
] as const;
export type AdminCustomerStatus = (typeof adminCustomerStatuses)[number];

// The pipeline (CRM) stages, in board order. Without a stage set by hand a
// workspace gets one from its plan and posting (see autoStage)
export const adminStages = [
  'lead',
  'trial',
  'onboarding',
  'active',
  'at_risk',
  'churned',
] as const;
export type AdminStage = (typeof adminStages)[number];

export const adminSorts = ['newest', 'oldest', 'name'] as const;
export type AdminSort = (typeof adminSorts)[number];

export const adminLimits = {
  note: 2000,
  tags: 20,
  tag: 30,
  task: 200,
  profileField: 120,
  exportRows: 5000,
} as const;

// lowercase letters, numbers, spaces and dashes
export const ADMIN_TAG = /^[a-z0-9][a-z0-9 -]*$/;

export class AdminCodeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'The code is the 6 digits of the app' })
  code: string;
}

// the one-time code set-admin-hq.ps1 prints, needed to show the QR code
export class AdminSetupDto {
  @IsString()
  @MinLength(6)
  @MaxLength(40)
  setupCode: string;
}

export class AdminNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(adminLimits.note)
  text: string;
}

export class AdminTagsDto {
  @IsArray()
  @ArrayMaxSize(adminLimits.tags)
  @IsString({ each: true })
  @MaxLength(adminLimits.tag, { each: true })
  tags: string[];
}

export class AdminFreePlanDto {
  @IsBoolean()
  enabled: boolean;
}

// 'auto' = no stage set by hand, worked out from the plan and posting
export class AdminStageDto {
  @IsIn([...adminStages, 'auto'])
  stage: AdminStage | 'auto';
}

export class AdminProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(adminLimits.profileField)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(adminLimits.profileField)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(adminLimits.profileField)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(adminLimits.profileField)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(adminLimits.profileField)
  source?: string;
}

export class AdminTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(adminLimits.task)
  title: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class AdminTaskDoneDto {
  @IsBoolean()
  done: boolean;
}

// ---------- responses (shared with the hq pages) ----------

export type AdminHealthLabel = 'healthy' | 'attention' | 'risk';

export interface AdminHealth {
  // 0 to 100
  score: number;
  label: AdminHealthLabel;
  // what lowered the score, e.g. "No channel connected"
  reasons: string[];
}

export interface AdminProfile {
  company: string | null;
  phone: string | null;
  website: string | null;
  country: string | null;
  source: string | null;
}

export interface AdminTaskRow {
  id: string;
  title: string;
  dueAt: string | null;
  doneAt: string | null;
  createdAt: string;
  author: string;
  organization: { id: string; name: string };
}

export interface AdminTimelineEntry {
  at: string;
  kind: 'signup' | 'channel' | 'post' | 'plan' | 'note' | 'task' | 'admin';
  // for 'admin': the action of the activity log (shown like the log)
  text: string;
  details?: unknown;
}

export interface AdminBoard {
  stages: { stage: AdminStage; total: number; customers: AdminCustomerRow[] }[];
}

export interface AdminSessionState {
  // an authenticator app is set up for this admin
  setup: boolean;
  // a code was entered in the last 30 minutes of use
  verified: boolean;
  lockedUntil: string | null;
}

export interface AdminSetupResponse {
  secret: string;
  qr: string;
}

export type AdminPlanStatus =
  | 'paying'
  | 'cancelling'
  | 'trial'
  | 'owner'
  | 'free'
  | 'none';

export interface AdminCustomerRow {
  id: string;
  name: string;
  createdAt: string;
  accountType: string | null;
  status: AdminPlanStatus;
  plan: string | null;
  period: string | null;
  // estimated from the price list (Stripe coupons are not counted)
  monthlyRevenue: number;
  owner: { name: string; email: string } | null;
  members: number;
  channels: number;
  postsThisMonth: number;
  lastActive: string | null;
  tags: string[];
  stage: AdminStage;
  // false = worked out from the plan and posting, not set by hand
  stageSet: boolean;
  health: AdminHealth;
}

export interface AdminOverview {
  users: { total: number; today: number; week: number; month: number };
  workspaces: { total: number; week: number };
  plans: Record<AdminPlanStatus, number>;
  revenue: {
    // estimated monthly recurring revenue from the price list, in USD
    mrr: number;
    payingWorkspaces: number;
    cancelling: number;
  };
  activity: {
    postsToday: number;
    failedToday: number;
    postsMonth: number;
    channels: number;
    channelsNeedReconnect: number;
  };
  signupsPerDay: { day: string; count: number }[];
  tasks: { overdue: number; today: number };
  latest: AdminCustomerRow[];
  billingEnabled: boolean;
}

export interface AdminCustomerDetail {
  customer: AdminCustomerRow & {
    description: string | null;
    profile: AdminProfile;
    subscription: {
      tier: string;
      provider: string;
      period: string;
      cancelAt: string | null;
      isLifetime: boolean;
      since: string;
    } | null;
  };
  members: {
    id: string;
    role: string;
    disabled: boolean;
    joined: string;
    name: string;
    email: string;
    login: string;
    activated: boolean;
    lastOnline: string;
  }[];
  channels: {
    id: string;
    name: string;
    picture: string | null;
    provider: string;
    disabled: boolean;
    needsReconnect: boolean;
    connected: string;
  }[];
  activity: {
    postsByState: { state: string; count: number }[];
    published30Days: number;
    errors30Days: number;
    firstPost: string | null;
    lastPost: string | null;
  };
  notes: {
    id: string;
    text: string;
    createdAt: string;
    author: string;
  }[];
  log: AdminLogEntry[];
  tasks: AdminTaskRow[];
  timeline: AdminTimelineEntry[];
}

export interface AdminLogEntry {
  id: string;
  action: string;
  details: unknown;
  createdAt: string;
  admin: string;
  organization: { id: string; name: string } | null;
}
