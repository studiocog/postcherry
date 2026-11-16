import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AdminCustomerStatus,
  AdminProfile,
  AdminSort,
  AdminStage,
} from '@gitroom/nestjs-libraries/dtos/admin/admin.dto';

// A workspace pays when it has a live subscription that is not a manual one
// (a manual one is a free plan given from the admin area or set-owner-plan.ps1)
// and is not in its Stripe trial
const activeSubscription: Prisma.SubscriptionWhereInput = { deletedAt: null };
const noActiveSubscription: Prisma.OrganizationWhereInput = {
  OR: [
    { subscription: { is: null } },
    { subscription: { is: { deletedAt: { not: null } } } },
  ],
};

export const statusWhere: Record<
  AdminCustomerStatus,
  Prisma.OrganizationWhereInput
> = {
  paying: {
    isTrailing: false,
    subscription: {
      is: { ...activeSubscription, provider: { not: 'manual' } },
    },
  },
  owner: {
    subscription: { is: { ...activeSubscription, provider: 'manual' } },
  },
  cancelling: {
    isTrailing: false,
    subscription: {
      is: {
        ...activeSubscription,
        provider: { not: 'manual' },
        cancelAt: { not: null },
      },
    },
  },
  trial: { isTrailing: true },
  free: { freePlanSince: { not: null }, ...noActiveSubscription },
  none: {
    freePlanSince: null,
    isTrailing: false,
    ...noActiveSubscription,
  },
  never_posted: { post: { none: { deletedAt: null } } },
};

// A stage set by hand wins; without one the stage comes from the plan and
// posting (the same rules as AdminService.autoStage)
const noStageSet: Prisma.OrganizationWhereInput = {
  OR: [
    { adminCustomer: { is: null } },
    { adminCustomer: { is: { stage: null } } },
  ],
};
const livePost: Prisma.PostWhereInput = { deletedAt: null };

const autoStageWhere: Partial<
  Record<AdminStage, Prisma.OrganizationWhereInput>
> = {
  trial: { isTrailing: true },
  at_risk: statusWhere.cancelling,
  onboarding: {
    isTrailing: false,
    NOT: statusWhere.cancelling,
    post: { none: livePost },
  },
  active: {
    isTrailing: false,
    NOT: statusWhere.cancelling,
    post: { some: livePost },
  },
};

export const stageWhere = (
  stage: AdminStage
): Prisma.OrganizationWhereInput => ({
  OR: [
    { adminCustomer: { is: { stage } } },
    ...(autoStageWhere[stage]
      ? [{ AND: [noStageSet, autoStageWhere[stage]!] }]
      : []),
  ],
});

const sortOrder: Record<
  AdminSort,
  Prisma.OrganizationOrderByWithRelationInput
> = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  name: { name: 'asc' },
};

// members whose user account still exists
const activeMember: Prisma.UserOrganizationWhereInput = {
  user: { deletedAt: null },
};

const liveChannel: Prisma.IntegrationWhereInput = { deletedAt: null };

const customerListSelect = {
  id: true,
  name: true,
  createdAt: true,
  accountType: true,
  isTrailing: true,
  freePlanSince: true,
  subscription: {
    select: {
      subscriptionTier: true,
      provider: true,
      period: true,
      cancelAt: true,
      isLifetime: true,
      deletedAt: true,
      createdAt: true,
    },
  },
  users: {
    where: activeMember,
    orderBy: { role: 'asc' },
    select: {
      role: true,
      disabled: true,
      user: {
        select: {
          id: true,
          name: true,
          lastName: true,
          email: true,
          lastOnline: true,
        },
      },
    },
  },
  adminTags: { select: { name: true }, orderBy: { name: 'asc' } },
  adminCustomer: {
    select: {
      stage: true,
      company: true,
      phone: true,
      website: true,
      country: true,
      source: true,
    },
  },
  _count: {
    select: {
      Integration: { where: liveChannel },
      post: { where: livePost },
    },
  },
} satisfies Prisma.OrganizationSelect;

export interface CustomerListParams {
  search?: string;
  status?: AdminCustomerStatus;
  tag?: string;
  stage?: AdminStage;
  sort?: AdminSort;
  page: number;
  limit: number;
}

@Injectable()
export class AdminRepository {
  constructor(
    private _organization: PrismaRepository<'organization'>,
    private _user: PrismaRepository<'user'>,
    private _userOrganization: PrismaRepository<'userOrganization'>,
    private _subscription: PrismaRepository<'subscription'>,
    private _post: PrismaRepository<'post'>,
    private _integration: PrismaRepository<'integration'>,
    private _adminSecurity: PrismaRepository<'adminSecurity'>,
    private _adminNote: PrismaRepository<'adminNote'>,
    private _adminTag: PrismaRepository<'adminTag'>,
    private _adminAuditLog: PrismaRepository<'adminAuditLog'>,
    private _adminCustomer: PrismaRepository<'adminCustomer'>,
    private _adminTask: PrismaRepository<'adminTask'>,
    private _errors: PrismaRepository<'errors'>
  ) {}

  // ---------- the second login step ----------

  getSecurity(userId: string) {
    return this._adminSecurity.model.adminSecurity.findUnique({
      where: { userId },
      select: {
        totpSecret: true,
        enrollCode: true,
        confirmedAt: true,
        sessionNonce: true,
        lastStep: true,
        failedAttempts: true,
        lockedUntil: true,
      },
    });
  }

  // a new secret, only while the setup is not finished
  savePendingSecret(userId: string, totpSecret: string) {
    return this._adminSecurity.model.adminSecurity.updateMany({
      where: { userId, confirmedAt: null },
      data: { totpSecret, lastStep: 0 },
    });
  }

  // a lock that is over starts a new count
  clearEndedLock(userId: string) {
    return this._adminSecurity.model.adminSecurity.updateMany({
      where: { userId, lockedUntil: { lt: new Date() } },
      data: { lockedUntil: null, failedAttempts: 0 },
    });
  }

  // counts the try before the code is checked and returns its number, so
  // parallel tries can't get around the limit; null = locked
  async reserveAttempt(userId: string) {
    try {
      const { failedAttempts } =
        await this._adminSecurity.model.adminSecurity.update({
          where: { userId, lockedUntil: null },
          data: { failedAttempts: { increment: 1 } },
          select: { failedAttempts: true },
        });
      return failedAttempts;
    } catch (err) {
      return null;
    }
  }

  lock(userId: string, lockedUntil: Date) {
    return this._adminSecurity.model.adminSecurity.updateMany({
      where: { userId },
      data: { lockedUntil },
    });
  }

  // 0 rows = the same or an older code was already used (replay)
  acceptCode(userId: string, step: number, sessionNonce: string) {
    return this._adminSecurity.model.adminSecurity.updateMany({
      where: { userId, lastStep: { lt: step } },
      data: {
        lastStep: step,
        failedAttempts: 0,
        lockedUntil: null,
        sessionNonce,
        enrollCode: null,
      },
    });
  }

  confirmSetup(userId: string) {
    return this._adminSecurity.model.adminSecurity.updateMany({
      where: { userId, confirmedAt: null },
      data: { confirmedAt: new Date() },
    });
  }

  endSessions(userId: string) {
    return this._adminSecurity.model.adminSecurity.updateMany({
      where: { userId },
      data: { sessionNonce: null },
    });
  }

  // ---------- overview ----------

  countUsers(since?: Date) {
    return this._user.model.user.count({
      where: {
        deletedAt: null,
        ...(since ? { createdAt: { gte: since } } : {}),
      },
    });
  }

  countWorkspaces(where: Prisma.OrganizationWhereInput = {}) {
    return this._organization.model.organization.count({
      where: { deletedAt: null, ...where },
    });
  }

  userSignupDates(since: Date) {
    return this._user.model.user.findMany({
      where: { deletedAt: null, createdAt: { gte: since } },
      select: { createdAt: true },
    });
  }

  payingSubscriptions() {
    return this._subscription.model.subscription.findMany({
      where: {
        ...activeSubscription,
        provider: { not: 'manual' },
        organization: { deletedAt: null, isTrailing: false },
      },
      select: { subscriptionTier: true, period: true, cancelAt: true },
    });
  }

  countPosts(state: 'PUBLISHED' | 'ERROR', since: Date) {
    return this._post.model.post.count({
      where: {
        state,
        parentPostId: null,
        deletedAt: null,
        publishDate: { gte: since },
      },
    });
  }

  countChannels(where: Prisma.IntegrationWhereInput = {}) {
    return this._integration.model.integration.count({
      where: { deletedAt: null, organization: { deletedAt: null }, ...where },
    });
  }

  // ---------- customers ----------

  private customerWhere(params: CustomerListParams) {
    const search = params.search?.trim();
    const and: Prisma.OrganizationWhereInput[] = [{ deletedAt: null }];
    if (search) {
      and.push({
        OR: [
          { id: search },
          { name: { contains: search, mode: 'insensitive' } },
          {
            users: {
              some: {
                user: {
                  deletedAt: null,
                  OR: [
                    { email: { contains: search, mode: 'insensitive' } },
                    { name: { contains: search, mode: 'insensitive' } },
                  ],
                },
              },
            },
          },
        ],
      });
    }
    if (params.status) {
      and.push(statusWhere[params.status]);
    }
    if (params.tag) {
      and.push({ adminTags: { some: { name: params.tag } } });
    }
    if (params.stage) {
      and.push(stageWhere(params.stage));
    }
    return { AND: and } satisfies Prisma.OrganizationWhereInput;
  }

  async listCustomers(params: CustomerListParams) {
    const where = this.customerWhere(params);
    const [total, customers] = await Promise.all([
      this._organization.model.organization.count({ where }),
      this._organization.model.organization.findMany({
        where,
        select: customerListSelect,
        orderBy: sortOrder[params.sort || 'newest'],
        skip: params.page * params.limit,
        take: params.limit,
      }),
    ]);
    return { total, customers };
  }

  latestCustomers(take: number) {
    return this._organization.model.organization.findMany({
      where: { deletedAt: null },
      select: customerListSelect,
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // published top-level posts per workspace since a date
  async postsPerWorkspace(organizationIds: string[], since: Date) {
    if (!organizationIds.length) {
      return new Map<string, number>();
    }
    const grouped = await this._post.model.post.groupBy({
      by: ['organizationId'],
      where: {
        organizationId: { in: organizationIds },
        state: 'PUBLISHED',
        parentPostId: null,
        deletedAt: null,
        publishDate: { gte: since },
      },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.organizationId, g._count._all]));
  }

  getCustomer(organizationId: string) {
    return this._organization.model.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: {
        ...customerListSelect,
        description: true,
        allowTrial: true,
        users: {
          where: activeMember,
          orderBy: { role: 'asc' },
          select: {
            id: true,
            role: true,
            disabled: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                lastName: true,
                email: true,
                providerName: true,
                activated: true,
                lastOnline: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });
  }

  getChannels(organizationId: string) {
    return this._integration.model.integration.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        picture: true,
        providerIdentifier: true,
        disabled: true,
        refreshNeeded: true,
        inBetweenSteps: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // the member "log in as" uses: the owner first, never a disabled member
  getLoginMember(organizationId: string) {
    return this._userOrganization.model.userOrganization.findFirst({
      where: {
        organizationId,
        disabled: false,
        user: { deletedAt: null, activated: true },
        organization: { deletedAt: null },
      },
      orderBy: { role: 'asc' },
      select: { id: true, user: { select: { email: true } } },
    });
  }

  // ---------- pipeline ----------

  async stageColumn(stage: AdminStage, take: number) {
    const where: Prisma.OrganizationWhereInput = {
      AND: [{ deletedAt: null }, stageWhere(stage)],
    };
    const [total, customers] = await Promise.all([
      this._organization.model.organization.count({ where }),
      this._organization.model.organization.findMany({
        where,
        select: customerListSelect,
        orderBy: { createdAt: 'desc' },
        take,
      }),
    ]);
    return { total, customers };
  }

  // ---------- health ----------

  async reconnectPerWorkspace(organizationIds: string[]) {
    if (!organizationIds.length) {
      return new Map<string, number>();
    }
    const grouped = await this._integration.model.integration.groupBy({
      by: ['organizationId'],
      where: {
        organizationId: { in: organizationIds },
        deletedAt: null,
        OR: [{ refreshNeeded: true }, { inBetweenSteps: true }],
      },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.organizationId, g._count._all]));
  }

  async errorsPerWorkspace(organizationIds: string[], since: Date) {
    if (!organizationIds.length) {
      return new Map<string, number>();
    }
    const grouped = await this._errors.model.errors.groupBy({
      by: ['organizationId'],
      where: {
        organizationId: { in: organizationIds },
        createdAt: { gte: since },
      },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.organizationId, g._count._all]));
  }

  // ---------- CRM profile ----------

  setStage(organizationId: string, stage: AdminStage | null) {
    return this._adminCustomer.model.adminCustomer.upsert({
      where: { organizationId },
      create: { organizationId, stage },
      update: { stage },
      select: { id: true },
    });
  }

  setProfile(organizationId: string, profile: AdminProfile) {
    return this._adminCustomer.model.adminCustomer.upsert({
      where: { organizationId },
      create: { organizationId, ...profile },
      update: profile,
      select: { id: true },
    });
  }

  // ---------- tasks ----------

  listTasks(params: {
    organizationId?: string;
    done?: boolean;
    take: number;
  }) {
    const openFirst: Prisma.AdminTaskOrderByWithRelationInput[] = [
      { dueAt: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'desc' },
    ];
    const doneFirst: Prisma.AdminTaskOrderByWithRelationInput[] = [
      { doneAt: 'desc' },
    ];
    const where: Prisma.AdminTaskWhereInput = {
      deletedAt: null,
      organization: { deletedAt: null },
      ...(params.organizationId
        ? { organizationId: params.organizationId }
        : {}),
      ...(params.done === undefined
        ? {}
        : params.done
        ? { doneAt: { not: null } }
        : { doneAt: null }),
    };
    return this._adminTask.model.adminTask.findMany({
      where,
      select: {
        id: true,
        title: true,
        dueAt: true,
        doneAt: true,
        createdAt: true,
        author: { select: { name: true, email: true } },
        organization: { select: { id: true, name: true } },
      },
      // open: the soonest first (no date last); done: the latest first
      orderBy: params.done ? doneFirst : openFirst,
      take: params.take,
    });
  }

  countOpenTasks(dueBefore: Date) {
    const where: Prisma.AdminTaskWhereInput = {
      deletedAt: null,
      doneAt: null,
      organization: { deletedAt: null },
      dueAt: { lt: dueBefore },
    };
    return this._adminTask.model.adminTask.count({ where });
  }

  addTask(
    organizationId: string,
    authorId: string,
    title: string,
    dueAt: Date | null
  ) {
    return this._adminTask.model.adminTask.create({
      data: { organizationId, authorId, title, dueAt },
      select: { id: true },
    });
  }

  getTask(id: string) {
    const where: Prisma.AdminTaskWhereInput = { id, deletedAt: null };
    return this._adminTask.model.adminTask.findFirst({
      where,
      select: { id: true, organizationId: true, title: true },
    });
  }

  setTaskDone(id: string, done: boolean) {
    return this._adminTask.model.adminTask.update({
      where: { id },
      data: { doneAt: done ? new Date() : null },
      select: { id: true },
    });
  }

  deleteTask(id: string) {
    return this._adminTask.model.adminTask.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
  }

  // ---------- notes and tags ----------

  getNotes(organizationId: string) {
    return this._adminNote.model.adminNote.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        text: true,
        createdAt: true,
        author: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  addNote(organizationId: string, authorId: string, text: string) {
    return this._adminNote.model.adminNote.create({
      data: { organizationId, authorId, text },
      select: { id: true },
    });
  }

  deleteNote(organizationId: string, id: string) {
    return this._adminNote.model.adminNote.updateMany({
      where: { id, organizationId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async setTags(organizationId: string, names: string[]) {
    await this._adminTag.model.adminTag.deleteMany({
      where: { organizationId, name: { notIn: names } },
    });
    if (names.length) {
      await this._adminTag.model.adminTag.createMany({
        data: names.map((name) => ({ organizationId, name })),
        skipDuplicates: true,
      });
    }
  }

  async allTags() {
    const grouped = await this._adminTag.model.adminTag.groupBy({
      by: ['name'],
      where: { organization: { deletedAt: null } },
      _count: { _all: true },
      orderBy: { name: 'asc' },
    });
    return grouped.map((g) => ({ name: g.name, count: g._count._all }));
  }

  // ---------- activity log ----------

  log(
    adminId: string,
    organizationId: string | null,
    action: string,
    details?: Prisma.InputJsonValue
  ) {
    return this._adminAuditLog.model.adminAuditLog.create({
      data: { adminId, organizationId, action, details },
      select: { id: true },
    });
  }

  async listLog(params: {
    organizationId?: string;
    page: number;
    limit: number;
  }) {
    const where: Prisma.AdminAuditLogWhereInput = params.organizationId
      ? { organizationId: params.organizationId }
      : {};
    const [total, entries] = await Promise.all([
      this._adminAuditLog.model.adminAuditLog.count({ where }),
      this._adminAuditLog.model.adminAuditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          details: true,
          createdAt: true,
          admin: { select: { name: true, email: true } },
          organization: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: params.page * params.limit,
        take: params.limit,
      }),
    ]);
    return { total, entries };
  }
}
