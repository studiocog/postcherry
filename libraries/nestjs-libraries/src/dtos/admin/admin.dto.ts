import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

export const adminLimits = {
  note: 2000,
  tags: 20,
  tag: 30,
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

// ---------- responses (shared with the hq pages) ----------

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
  latest: AdminCustomerRow[];
  billingEnabled: boolean;
}

export interface AdminCustomerDetail {
  customer: AdminCustomerRow & {
    description: string | null;
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
}

export interface AdminLogEntry {
  id: string;
  action: string;
  details: unknown;
  createdAt: string;
  admin: string;
  organization: { id: string; name: string } | null;
}
