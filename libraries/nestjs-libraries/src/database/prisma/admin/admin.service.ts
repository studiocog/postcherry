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
  AdminBoard,
  AdminCustomerDetail,
  AdminCustomerRow,
  AdminCustomerStatus,
  AdminHealth,
  adminLimits,
  AdminLogEntry,
  AdminOverview,
  AdminPlanStatus,
  AdminProfile,
  AdminProfileDto,
  AdminSessionState,
  AdminSetupResponse,
  AdminSort,
  AdminStage,
  adminStages,
  AdminTaskRow,
  AdminTimelineEntry,
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

// Health of a workspace, 100 = all good. Each problem takes points off and
// says why, so the customer page can show what to fix.
const healthOf = (input: {
  createdAt: Date;
  lastActive?: Date;
  channels: number;
  postsThisMonth: number;
  needReconnect: number;
  errors7Days: number;
  cancelling: boolean;
}): AdminHealth => {
  let score = 100;
  const reasons: string[] = [];
  const idleDays = input.lastActive
    ? dayjs().diff(input.lastActive, 'day')
    : Infinity;
  if (idleDays > 30) {
    score -= 40;
    reasons.push('Not seen for over 30 days');
  } else if (idleDays > 14) {
    score -= 25;
    reasons.push('Not seen for over 14 days');
  } else if (idleDays > 7) {
    score -= 10;
    reasons.push('Not seen for over a week');
  }
  if (!input.channels) {
    score -= 25;
    reasons.push('No channel connected');
  }
  if (!input.postsThisMonth && dayjs().diff(input.createdAt, 'day') > 7) {
    score -= 20;
    reasons.push('No post published this month');
  }
  if (input.needReconnect) {
    score -= 15;
    reasons.push(
      `${input.needReconnect} channel${
        input.needReconnect === 1 ? '' : 's'
      } need reconnecting`
    );
  }
  if (input.errors7Days > 5) {
    score -= 10;
    reasons.push(`${input.errors7Days} posting errors in 7 days`);
  }
  if (input.cancelling) {
    score -= 30;
    reasons.push('Plan is cancelling');
  }
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    label: score >= 70 ? 'healthy' : score >= 40 ? 'attention' : 'risk',
    reasons,
  };
};

// a CSV cell: quoted when needed, and never read as a formula by Excel
const csvCell = (value: unknown) => {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const trimOrNull = (value?: string) => value?.trim() || null;

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

  // the same rules as autoStageWhere in the repository
  private autoStage(org: CustomerRowSource, status: AdminPlanStatus): AdminStage {
    if (org.isTrailing) {
      return 'trial';
    }
    if (status === 'cancelling') {
      return 'at_risk';
    }
    return org._count.post ? 'active' : 'onboarding';
  }

  private toRow(
    org: CustomerRowSource,
    posts: Map<string, number>,
    reconnect: Map<string, number>,
    errors: Map<string, number>
  ): AdminCustomerRow {
    const status = this.planStatus(org);
    const setStage = org.adminCustomer?.stage as AdminStage | null | undefined;
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
      stage:
        setStage && adminStages.includes(setStage)
          ? setStage
          : this.autoStage(org, status),
      stageSet: !!setStage,
      health: healthOf({
        createdAt: org.createdAt,
        lastActive,
        channels: org._count.Integration,
        postsThisMonth: posts.get(org.id) || 0,
        needReconnect: reconnect.get(org.id) || 0,
        errors7Days: errors.get(org.id) || 0,
        cancelling: status === 'cancelling',
      }),
    };
  }

  private async toRows(orgs: CustomerRowSource[]) {
    const ids = orgs.map((o) => o.id);
    const [posts, reconnect, errors] = await Promise.all([
      this._adminRepository.postsPerWorkspace(
        ids,
        dayjs().startOf('month').toDate()
      ),
      this._adminRepository.reconnectPerWorkspace(ids),
      this._adminRepository.errorsPerWorkspace(
        ids,
        dayjs().subtract(7, 'day').toDate()
      ),
    ]);
    return orgs.map((org) => this.toRow(org, posts, reconnect, errors));
  }

  async listCustomers(params: {
    search?: string;
    status?: AdminCustomerStatus;
    tag?: string;
    stage?: AdminStage;
    sort?: AdminSort;
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

  // the customers list with the same filters, as a CSV file
  async exportCustomers(params: {
    search?: string;
    status?: AdminCustomerStatus;
    tag?: string;
    stage?: AdminStage;
    sort?: AdminSort;
  }) {
    const { customers } = await this._adminRepository.listCustomers({
      ...params,
      page: 0,
      limit: adminLimits.exportRows,
    });
    const rows = await this.toRows(customers);
    const header = [
      'Workspace',
      'Owner',
      'Email',
      'Plan status',
      'Plan',
      'Period',
      'USD per month',
      'Stage',
      'Health',
      'Channels',
      'Posts this month',
      'Members',
      'Last active',
      'Signed up',
      'Tags',
      'Company',
      'Phone',
      'Website',
      'Country',
      'Source',
    ];
    const profileOf = new Map(
      customers.map((c) => [c.id, c.adminCustomer])
    );
    const lines = rows.map((row) => {
      const profile = profileOf.get(row.id);
      return [
        row.name,
        row.owner?.name,
        row.owner?.email,
        row.status,
        row.plan,
        row.period,
        row.monthlyRevenue,
        row.stage,
        row.health.score,
        row.channels,
        row.postsThisMonth,
        row.members,
        row.lastActive,
        row.createdAt,
        row.tags.join(' '),
        profile?.company,
        profile?.phone,
        profile?.website,
        profile?.country,
        profile?.source,
      ]
        .map(csvCell)
        .join(',');
    });
    return [header.join(','), ...lines].join('\r\n');
  }

  // the pipeline: the newest workspaces of each stage
  async board(): Promise<AdminBoard> {
    const columns = await Promise.all(
      adminStages.map((stage) => this._adminRepository.stageColumn(stage, 40))
    );
    const rows = await this.toRows(columns.flatMap((c) => c.customers));
    const byId = new Map(rows.map((row) => [row.id, row]));
    return {
      stages: adminStages.map((stage, index) => ({
        stage,
        total: columns[index].total,
        customers: columns[index].customers.map((c) => byId.get(c.id)!),
      })),
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
      tasksOverdue,
      tasksDueToday,
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
      this._adminRepository.countOpenTasks(today.toDate()),
      this._adminRepository.countOpenTasks(today.add(1, 'day').toDate()),
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
      tasks: { overdue: tasksOverdue, today: tasksDueToday - tasksOverdue },
      latest: await this.toRows(latest),
      billingEnabled: !!process.env.STRIPE_PUBLISHABLE_KEY,
    };
  }

  async customer(organizationId: string): Promise<AdminCustomerDetail> {
    const org = await this._adminRepository.getCustomer(organizationId);
    if (!org) {
      throw new HttpException('Workspace not found', 404);
    }
    const [[row], channels, notes, log, activity, tasks] = await Promise.all([
      this.toRows([org]),
      this._adminRepository.getChannels(organizationId),
      this._adminRepository.getNotes(organizationId),
      this.log({ organizationId, page: 0 }),
      this._adminStatsService.getOrgActivity({
        organizationId,
        from: dayjs().subtract(30, 'day').startOf('day').toDate(),
        to: dayjs().endOf('day').toDate(),
      }),
      this.tasks({ organizationId }),
    ]);
    const sub = org.subscription && !org.subscription.deletedAt ? org.subscription : null;

    // everything that happened to this workspace, the latest first
    const events: AdminTimelineEntry[] = [
      { at: org.createdAt.toISOString(), kind: 'signup', text: 'Signed up' },
      ...channels.map((channel) => ({
        at: channel.createdAt.toISOString(),
        kind: 'channel' as const,
        text: `Connected ${channel.providerIdentifier}: ${channel.name}`,
      })),
      ...(activity.firstActivityAt
        ? [
            {
              at: activity.firstActivityAt,
              kind: 'post' as const,
              text: 'First post published',
            },
          ]
        : []),
      ...(activity.lastActivityAt &&
      activity.lastActivityAt !== activity.firstActivityAt
        ? [
            {
              at: activity.lastActivityAt,
              kind: 'post' as const,
              text: 'Latest post published',
            },
          ]
        : []),
      ...(sub
        ? [
            {
              at: sub.createdAt.toISOString(),
              kind: 'plan' as const,
              text: `Plan ${sub.subscriptionTier.replace(/_/g, ' ')} started`,
            },
          ]
        : []),
      ...notes.map((note) => ({
        at: note.createdAt.toISOString(),
        kind: 'note' as const,
        text: `Note: ${note.text.slice(0, 120)}`,
      })),
      ...tasks.flatMap((task) => [
        { at: task.createdAt, kind: 'task' as const, text: `Task: ${task.title}` },
        ...(task.doneAt
          ? [{ at: task.doneAt, kind: 'task' as const, text: `Done: ${task.title}` }]
          : []),
      ]),
      ...log.entries
        .filter((entry) => !['note_added', 'task_added', 'task_done'].includes(entry.action))
        .map((entry) => ({
          at: entry.createdAt,
          kind: 'admin' as const,
          text: entry.action,
          details: entry.details,
        })),
    ];
    const timeline = events
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 100);

    return {
      customer: {
        ...row,
        description: org.description,
        profile: {
          company: org.adminCustomer?.company || null,
          phone: org.adminCustomer?.phone || null,
          website: org.adminCustomer?.website || null,
          country: org.adminCustomer?.country || null,
          source: org.adminCustomer?.source || null,
        },
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
      tasks,
      timeline,
    };
  }

  // ---------- changes (each one is written to the activity log) ----------

  async setStage(
    adminId: string,
    organizationId: string,
    stage: AdminStage | 'auto'
  ) {
    if (!(await this._adminRepository.getCustomer(organizationId))) {
      throw new HttpException('Workspace not found', 404);
    }
    await this._adminRepository.setStage(
      organizationId,
      stage === 'auto' ? null : stage
    );
    await this._adminRepository.log(adminId, organizationId, 'stage_changed', {
      stage,
    });
  }

  async setProfile(
    adminId: string,
    organizationId: string,
    body: AdminProfileDto
  ) {
    if (!(await this._adminRepository.getCustomer(organizationId))) {
      throw new HttpException('Workspace not found', 404);
    }
    const profile: AdminProfile = {
      company: trimOrNull(body.company),
      phone: trimOrNull(body.phone),
      website: trimOrNull(body.website),
      country: trimOrNull(body.country),
      source: trimOrNull(body.source),
    };
    await this._adminRepository.setProfile(organizationId, profile);
    await this._adminRepository.log(adminId, organizationId, 'profile_changed');
  }

  async tasks(params: {
    organizationId?: string;
    done?: boolean;
  }): Promise<AdminTaskRow[]> {
    const tasks = await this._adminRepository.listTasks({
      ...params,
      take: params.organizationId ? 100 : 300,
    });
    return tasks.map((task) => ({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt ? task.dueAt.toISOString() : null,
      doneAt: task.doneAt ? task.doneAt.toISOString() : null,
      createdAt: task.createdAt.toISOString(),
      author: task.author.name || task.author.email,
      organization: task.organization,
    }));
  }

  async addTask(
    adminId: string,
    organizationId: string,
    title: string,
    dueAt?: string
  ) {
    const value = title.trim();
    if (!value) {
      throw new HttpException('The task is empty', 400);
    }
    if (!(await this._adminRepository.getCustomer(organizationId))) {
      throw new HttpException('Workspace not found', 404);
    }
    await this._adminRepository.addTask(
      organizationId,
      adminId,
      value,
      dueAt ? dayjs(dueAt).toDate() : null
    );
    await this._adminRepository.log(adminId, organizationId, 'task_added', {
      title: value,
    });
  }

  async setTaskDone(adminId: string, taskId: string, done: boolean) {
    const task = await this._adminRepository.getTask(taskId);
    if (!task) {
      throw new HttpException('Task not found', 404);
    }
    await this._adminRepository.setTaskDone(taskId, done);
    await this._adminRepository.log(
      adminId,
      task.organizationId,
      done ? 'task_done' : 'task_reopened',
      { title: task.title }
    );
  }

  async deleteTask(adminId: string, taskId: string) {
    const task = await this._adminRepository.getTask(taskId);
    if (!task) {
      throw new HttpException('Task not found', 404);
    }
    await this._adminRepository.deleteTask(taskId);
    await this._adminRepository.log(adminId, task.organizationId, 'task_deleted', {
      title: task.title,
    });
  }

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
