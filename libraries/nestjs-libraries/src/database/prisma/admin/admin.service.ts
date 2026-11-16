import { HttpException, Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import dayjs from 'dayjs';
import { toDataURL } from 'qrcode';
import { uniq } from 'lodash';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import {
  AdminRepository,
  statusWhere,
} from '@gitroom/nestjs-libraries/database/prisma/admin/admin.repository';
import { AdminStatsService } from '@gitroom/nestjs-libraries/database/prisma/admin-stats/admin-stats.service';
import { SubscriptionService } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import {
  generateTotpSecret,
  matchTotpStep,
  totpUri,
} from '@gitroom/nestjs-libraries/services/totp';
import {
  ADMIN_TAG,
  AdminCustomerDetail,
  AdminCustomerRow,
  AdminCustomerStatus,
  adminLimits,
  AdminLogEntry,
  AdminOverview,
  AdminPlanStatus,
  AdminSessionState,
  AdminSetupResponse,
} from '@gitroom/nestjs-libraries/dtos/admin/admin.dto';

// 5 wrong codes in a row lock the second step for 15 minutes
const MAX_FAILED_CODES = 5;
const LOCK_MINUTES = 15;

const sameText = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

// the setup code is stored as the sha256 (hex) of its letters and digits,
// so "abcd-efgh-jk" and "ABCDEFGHJK" are the same code
const sameHash = (hash: string, value: string) =>
  sameText(
    hash,
    createHash('sha256')
      .update(value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
      .digest('hex')
  );

type CustomerRowSource = Awaited<
  ReturnType<AdminRepository['latestCustomers']>
>[number];

const monthlyPrice = (tier: string, period: string) => {
  const price = pricing[tier as keyof typeof pricing];
  if (!price) {
    return 0;
  }
  return period === 'YEARLY'
    ? Math.round((price.year_price / 12) * 100) / 100
    : price.month_price;
};

@Injectable()
export class AdminService {
  constructor(
    private _adminRepository: AdminRepository,
    private _adminStatsService: AdminStatsService,
    private _subscriptionService: SubscriptionService
  ) {}

  // ---------- the second login step ----------

  async sessionState(userId: string, verified: boolean): Promise<AdminSessionState> {
    const security = await this._adminRepository.getSecurity(userId);
    const locked =
      security?.lockedUntil && security.lockedUntil > new Date()
        ? security.lockedUntil.toISOString()
        : null;
    return {
      setup: !!security?.confirmedAt,
      verified: !!security?.confirmedAt && verified,
      lockedUntil: locked,
    };
  }

  // The QR code shows only with the one-time setup code printed by
  // set-admin-hq.ps1 on the server, so a stolen login alone can't set up its
  // own authenticator app. A lost phone is reset there too (-Reset2FA).
  async startSetup(
    userId: string,
    email: string,
    setupCode: string
  ): Promise<AdminSetupResponse> {
    const security = await this._adminRepository.getSecurity(userId);
    if (security?.confirmedAt) {
      throw new HttpException('The authenticator app is already set up', 400);
    }
    if (!security?.enrollCode || !sameHash(security.enrollCode, setupCode)) {
      throw new HttpException(
        'Wrong setup code. Run set-admin-hq.ps1 to get one.',
        400
      );
    }
    const secret = generateTotpSecret();
    await this._adminRepository.savePendingSecret(
      userId,
      AuthService.fixedEncryption(secret)
    );
    return {
      secret,
      qr: await toDataURL(totpUri(secret, email, 'PostCherry HQ'), {
        margin: 1,
        width: 220,
      }),
    };
  }

  // The nonce of the new HQ session, or null for a wrong, reused or locked code
  async checkCode(userId: string, code: string) {
    if (!(await this._adminRepository.getSecurity(userId))?.totpSecret) {
      throw new HttpException('Set up the authenticator app first', 400);
    }
    await this._adminRepository.clearEndedLock(userId);
    const attempt = await this._adminRepository.reserveAttempt(userId);
    if (attempt === null) {
      throw new HttpException(
        'Too many wrong codes, try again in a few minutes',
        429
      );
    }
    const security = (await this._adminRepository.getSecurity(userId))!;

    // tries past the limit (sent at the same time) are not even checked
    const step =
      attempt > MAX_FAILED_CODES
        ? null
        : matchTotpStep(AuthService.fixedDecryption(security.totpSecret), code);

    const nonce = step === null ? null : randomBytes(24).toString('hex');
    // a code works once: the same or an older code can't be replayed
    if (
      step === null ||
      !(await this._adminRepository.acceptCode(userId, step, nonce!)).count
    ) {
      if (attempt >= MAX_FAILED_CODES) {
        await this._adminRepository.lock(
          userId,
          dayjs().add(LOCK_MINUTES, 'minute').toDate()
        );
      }
      return null;
    }

    await this._adminRepository.confirmSetup(userId);
    return nonce;
  }

  async isSessionValid(userId: string, nonce: string) {
    const security = await this._adminRepository.getSecurity(userId);
    return (
      !!security?.confirmedAt &&
      !!security.sessionNonce &&
      sameText(security.sessionNonce, nonce)
    );
  }

  // Lock: every HQ session of this admin ends
  endSessions(userId: string) {
    return this._adminRepository.endSessions(userId);
  }

  // ---------- customers ----------

  private planStatus(org: CustomerRowSource): AdminPlanStatus {
    const sub = org.subscription && !org.subscription.deletedAt ? org.subscription : null;
    if (sub?.provider === 'manual') {
      return 'owner';
    }
    if (sub && org.isTrailing) {
      return 'trial';
    }
    if (sub?.cancelAt) {
      return 'cancelling';
    }
    if (sub) {
      return 'paying';
    }
    if (org.isTrailing) {
      return 'trial';
    }
    return org.freePlanSince ? 'free' : 'none';
  }

  private toRow(org: CustomerRowSource, posts: Map<string, number>): AdminCustomerRow {
    const status = this.planStatus(org);
    const sub = org.subscription && !org.subscription.deletedAt ? org.subscription : null;
    const owner = org.users[0]?.user;
    const lastActive = org.users
      .map((u) => u.user.lastOnline)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      id: org.id,
      name: org.name,
      createdAt: org.createdAt.toISOString(),
      accountType: org.accountType,
      status,
      plan: sub?.subscriptionTier || (org.freePlanSince ? 'FREE' : null),
      period: sub?.period || null,
      monthlyRevenue:
        sub && (status === 'paying' || status === 'cancelling')
          ? monthlyPrice(sub.subscriptionTier, sub.period)
          : 0,
      owner: owner
        ? {
            name: [owner.name, owner.lastName].filter(Boolean).join(' '),
            email: owner.email,
          }
        : null,
      members: org.users.length,
      channels: org._count.Integration,
      postsThisMonth: posts.get(org.id) || 0,
      lastActive: lastActive ? lastActive.toISOString() : null,
      tags: org.adminTags.map((t) => t.name),
    };
  }

  private async toRows(orgs: CustomerRowSource[]) {
    const posts = await this._adminRepository.postsPerWorkspace(
      orgs.map((o) => o.id),
      dayjs().startOf('month').toDate()
    );
    return orgs.map((org) => this.toRow(org, posts));
  }

  async listCustomers(params: {
    search?: string;
    status?: AdminCustomerStatus;
    tag?: string;
    page: number;
  }) {
    const limit = 25;
    const { total, customers } = await this._adminRepository.listCustomers({
      ...params,
      limit,
    });
    return {
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
      customers: await this.toRows(customers),
    };
  }

  async overview(): Promise<AdminOverview> {
    const today = dayjs().startOf('day');
    const since30 = today.subtract(29, 'day');
    const [
      usersTotal,
      usersToday,
      usersWeek,
      usersMonth,
      workspacesTotal,
      workspacesWeek,
      paying,
      cancelling,
      trial,
      owner,
      free,
      none,
      subscriptions,
      postsToday,
      failedToday,
      postsMonth,
      channels,
      channelsNeedReconnect,
      signups,
      latest,
    ] = await Promise.all([
      this._adminRepository.countUsers(),
      this._adminRepository.countUsers(today.toDate()),
      this._adminRepository.countUsers(today.subtract(6, 'day').toDate()),
      this._adminRepository.countUsers(since30.toDate()),
      this._adminRepository.countWorkspaces(),
      this._adminRepository.countWorkspaces({
        createdAt: { gte: today.subtract(6, 'day').toDate() },
      }),
      this._adminRepository.countWorkspaces(statusWhere.paying),
      this._adminRepository.countWorkspaces(statusWhere.cancelling),
      this._adminRepository.countWorkspaces(statusWhere.trial),
      this._adminRepository.countWorkspaces(statusWhere.owner),
      this._adminRepository.countWorkspaces(statusWhere.free),
      this._adminRepository.countWorkspaces(statusWhere.none),
      this._adminRepository.payingSubscriptions(),
      this._adminRepository.countPosts('PUBLISHED', today.toDate()),
      this._adminRepository.countPosts('ERROR', today.toDate()),
      this._adminRepository.countPosts(
        'PUBLISHED',
        dayjs().startOf('month').toDate()
      ),
      this._adminRepository.countChannels(),
      this._adminRepository.countChannels({ refreshNeeded: true }),
      this._adminRepository.userSignupDates(since30.toDate()),
      this._adminRepository.latestCustomers(8),
    ]);

    const perDay = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      perDay.set(since30.add(i, 'day').format('YYYY-MM-DD'), 0);
    }
    for (const { createdAt } of signups) {
      const day = dayjs(createdAt).format('YYYY-MM-DD');
      if (perDay.has(day)) {
        perDay.set(day, perDay.get(day)! + 1);
      }
    }

    const mrr = subscriptions.reduce(
      (sum, sub) => sum + monthlyPrice(sub.subscriptionTier, sub.period),
      0
    );

    return {
      users: {
        total: usersTotal,
        today: usersToday,
        week: usersWeek,
        month: usersMonth,
      },
      workspaces: { total: workspacesTotal, week: workspacesWeek },
      // trial wins over paying in the rows, the counts are per filter
      plans: {
        paying,
        cancelling,
        trial,
        owner,
        free,
        none,
      },
      revenue: {
        mrr: Math.round(mrr * 100) / 100,
        payingWorkspaces: subscriptions.length,
        cancelling,
      },
      activity: {
        postsToday,
        failedToday,
        postsMonth,
        channels,
        channelsNeedReconnect,
      },
      signupsPerDay: [...perDay.entries()].map(([day, count]) => ({
        day,
        count,
      })),
      latest: await this.toRows(latest),
      billingEnabled: !!process.env.STRIPE_PUBLISHABLE_KEY,
    };
  }

  async customer(organizationId: string): Promise<AdminCustomerDetail> {
    const org = await this._adminRepository.getCustomer(organizationId);
    if (!org) {
      throw new HttpException('Workspace not found', 404);
    }
    const [[row], channels, notes, log, activity] = await Promise.all([
      this.toRows([org]),
      this._adminRepository.getChannels(organizationId),
      this._adminRepository.getNotes(organizationId),
      this.log({ organizationId, page: 0 }),
      this._adminStatsService.getOrgActivity({
        organizationId,
        from: dayjs().subtract(30, 'day').startOf('day').toDate(),
        to: dayjs().endOf('day').toDate(),
      }),
    ]);
    const sub = org.subscription && !org.subscription.deletedAt ? org.subscription : null;

    return {
      customer: {
        ...row,
        description: org.description,
        subscription: sub
          ? {
              tier: sub.subscriptionTier,
              provider: sub.provider,
              period: sub.period,
              cancelAt: sub.cancelAt ? sub.cancelAt.toISOString() : null,
              isLifetime: sub.isLifetime,
              since: sub.createdAt.toISOString(),
            }
          : null,
      },
      members: org.users.map((member) => ({
        id: member.id,
        role: member.role,
        disabled: member.disabled,
        joined: member.createdAt.toISOString(),
        name: [member.user.name, member.user.lastName].filter(Boolean).join(' '),
        email: member.user.email,
        login: member.user.providerName,
        activated: member.user.activated,
        lastOnline: member.user.lastOnline.toISOString(),
      })),
      channels: channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        picture: channel.picture,
        provider: channel.providerIdentifier,
        disabled: channel.disabled,
        needsReconnect: channel.refreshNeeded || channel.inBetweenSteps,
        connected: channel.createdAt.toISOString(),
      })),
      activity: {
        postsByState: activity.postsByState,
        published30Days: activity.posts.total,
        errors30Days: activity.errors.total,
        firstPost: activity.firstActivityAt,
        lastPost: activity.lastActivityAt,
      },
      notes: notes.map((note) => ({
        id: note.id,
        text: note.text,
        createdAt: note.createdAt.toISOString(),
        author: note.author.name || note.author.email,
      })),
      log: log.entries,
    };
  }

  // ---------- changes (each one is written to the activity log) ----------

  async setFreePlan(adminId: string, organizationId: string, enabled: boolean) {
    if (!(await this._adminRepository.getCustomer(organizationId))) {
      throw new HttpException('Workspace not found', 404);
    }
    if (enabled) {
      // never replaces a paid subscription: Stripe would keep charging it
      if (!(await this._subscriptionService.giveManualPlan(organizationId))) {
        throw new HttpException(
          'This workspace pays through Stripe. Cancel that subscription first.',
          400
        );
      }
    } else if (
      !(await this._subscriptionService.removeManualPlan(organizationId))
    ) {
      throw new HttpException('This workspace has no free plan', 400);
    }
    await this._adminRepository.log(
      adminId,
      organizationId,
      enabled ? 'free_plan_given' : 'free_plan_removed'
    );
  }

  async addNote(adminId: string, organizationId: string, text: string) {
    const value = text.trim();
    if (!value) {
      throw new HttpException('The note is empty', 400);
    }
    if (!(await this._adminRepository.getCustomer(organizationId))) {
      throw new HttpException('Workspace not found', 404);
    }
    await this._adminRepository.addNote(organizationId, adminId, value);
    await this._adminRepository.log(adminId, organizationId, 'note_added');
  }

  async deleteNote(adminId: string, organizationId: string, noteId: string) {
    const { count } = await this._adminRepository.deleteNote(
      organizationId,
      noteId
    );
    if (count) {
      await this._adminRepository.log(adminId, organizationId, 'note_deleted');
    }
  }

  async setTags(adminId: string, organizationId: string, tags: string[]) {
    const names = uniq(
      tags.map((tag) => tag.trim().toLowerCase().replace(/\s+/g, ' '))
    ).filter(Boolean);
    const wrong = names.find(
      (name) => !ADMIN_TAG.test(name) || name.length > adminLimits.tag
    );
    if (wrong) {
      throw new HttpException(
        `"${wrong}": use letters, numbers, spaces and dashes`,
        400
      );
    }
    if (!(await this._adminRepository.getCustomer(organizationId))) {
      throw new HttpException('Workspace not found', 404);
    }
    await this._adminRepository.setTags(organizationId, names);
    await this._adminRepository.log(adminId, organizationId, 'tags_changed', {
      tags: names,
    });
    return names;
  }

  allTags() {
    return this._adminRepository.allTags();
  }

  // the member the "log in as" button opens the app as
  async loginMember(adminId: string, organizationId: string) {
    const member = await this._adminRepository.getLoginMember(organizationId);
    if (!member) {
      throw new HttpException('This workspace has no active member', 400);
    }
    await this._adminRepository.log(adminId, organizationId, 'logged_in_as', {
      email: member.user.email,
    });
    return member.id;
  }

  logAction(adminId: string, action: string) {
    return this._adminRepository.log(adminId, null, action);
  }

  async log(params: {
    organizationId?: string;
    page: number;
  }): Promise<{ total: number; pages: number; entries: AdminLogEntry[] }> {
    const limit = 50;
    const { total, entries } = await this._adminRepository.listLog({
      ...params,
      limit,
    });
    return {
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
      entries: entries.map((entry) => ({
        id: entry.id,
        action: entry.action,
        details: entry.details,
        createdAt: entry.createdAt.toISOString(),
        admin: entry.admin.name || entry.admin.email,
        organization: entry.organization,
      })),
    };
  }
}
