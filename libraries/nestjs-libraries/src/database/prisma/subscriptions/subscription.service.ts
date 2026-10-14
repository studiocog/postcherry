import { Injectable } from '@nestjs/common';
import {
  allowsAutoPost,
  BillingTier,
  isLegacyTier,
  isNewTier,
  PaidTier,
  PlanFeatureFlag,
  pricing,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import { SubscriptionRepository } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.repository';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { OrganizationService } from '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service';
import { Organization } from '@prisma/client';
import dayjs from 'dayjs';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly _subscriptionRepository: SubscriptionRepository,
    private readonly _integrationService: IntegrationService,
    private readonly _organizationService: OrganizationService
  ) {}

  getSubscriptionByOrganizationId(organizationId: string) {
    return this._subscriptionRepository.getSubscriptionByOrganizationId(
      organizationId
    );
  }

  useCredit<T>(
    organization: Organization,
    type = 'ai_images',
    func: () => Promise<T>
  ): Promise<T> {
    return this._subscriptionRepository.useCredit(organization, type, func);
  }

  getCode(code: string) {
    return this._subscriptionRepository.getCode(code);
  }

  // The plan that gates the organization's features, null when nothing is
  // gated. It never locks a workspace out by mistake: billing disabled
  // (self-hosted), no subscription (a lapsed workspace is already stopped by
  // the billing wall), an unknown tier or a failed lookup all give null
  private async gatingPlan(organizationId: string) {
    if (!process.env.STRIPE_PUBLISHABLE_KEY) {
      return null;
    }

    try {
      const subscription =
        await this._subscriptionRepository.getSubscriptionByOrganizationId(
          organizationId
        );
      if (!subscription) {
        return null;
      }

      const plan = pricing[subscription.subscriptionTier];
      if (!plan) {
        console.warn('subscription_unknown_tier', {
          organizationId,
          tier: subscription.subscriptionTier,
        });
        return null;
      }

      return plan;
    } catch (err) {
      console.error('Error checking the plan feature:', err);
      return null;
    }
  }

  // Whether the organization's plan includes a feature
  async hasPlanFeature(organizationId: string, feature: PlanFeatureFlag) {
    const plan = await this.gatingPlan(organizationId);
    return !plan || !!plan[feature];
  }

  // Whether the organization's plan includes AI images (it has image credits,
  // the same rule that shows the AI image button in the media library)
  async hasAiImages(organizationId: string) {
    const plan = await this.gatingPlan(organizationId);
    return !plan || plan.image_generation_count > 0;
  }

  // Whether the organization's RSS auto-posts can be turned on (adding a new
  // one is checked by Sections.AUTOPOST)
  async canRunAutoPost(organizationId: string) {
    const plan = await this.gatingPlan(organizationId);
    return !plan || allowsAutoPost(plan);
  }

  // A plan without RSS auto-posting pauses the active feeds. It runs from the
  // payment webhooks, so it only logs a failure
  private async pauseAutoposts(organizationId: string) {
    try {
      await this._integrationService.pauseAutoposts(organizationId);
    } catch (err) {
      console.error('subscription_pause_autoposts_failed', {
        organizationId,
        err,
      });
    }
  }

  // The new plans can always be bought, the legacy tiers only by a workspace
  // that is still on one of them (to switch period or move between them)
  async canPurchaseTier(organizationId: string, tier: string) {
    if (isNewTier(tier)) {
      return true;
    }

    if (!isLegacyTier(tier)) {
      return false;
    }

    const subscription =
      await this._subscriptionRepository.getSubscriptionByOrganizationId(
        organizationId
      );
    return isLegacyTier(subscription?.subscriptionTier);
  }

  // Customer-keyed flows must never touch a subscription owned by another provider
  private async isManagedBy(customerId: string, provider: string) {
    const current =
      await this._subscriptionRepository.getSubscriptionByCustomerId(
        customerId
      );
    return !current || current.provider === provider;
  }

  async deleteSubscription(customerId: string, provider: string) {
    if (!(await this.isManagedBy(customerId, provider))) {
      return { count: 0 };
    }
    await this.modifySubscription(
      customerId,
      pricing.FREE.channel || 0,
      'FREE'
    );
    return this._subscriptionRepository.deleteSubscriptionByCustomerId(
      customerId,
      provider
    );
  }

  // Store-managed subscriptions (RevenueCat etc.) have no Stripe customer, they are keyed by org
  async deleteSubscriptionByOrgId(organizationId: string, provider: string) {
    const current = await this._subscriptionRepository.getSubscriptionByOrgId(
      organizationId
    );
    if (!current || current.provider !== provider || current.isLifetime) {
      return false;
    }

    await this.modifySubscriptionByOrg(
      organizationId,
      pricing.FREE.channel || 0,
      'FREE'
    );
    return this._subscriptionRepository.deleteSubscriptionByOrgId(
      organizationId,
      provider
    );
  }

  updateCustomerId(organizationId: string, customerId: string) {
    return this._subscriptionRepository.updateCustomerId(
      organizationId,
      customerId
    );
  }

  updateCancelAt(organizationId: string, cancelAt: number | null) {
    return this._subscriptionRepository.updateCancelAt(
      organizationId,
      cancelAt
    );
  }

  async checkSubscription(organizationId: string, subscriptionId: string) {
    return await this._subscriptionRepository.checkSubscription(
      organizationId,
      subscriptionId
    );
  }

  async modifySubscriptionByOrg(
    organizationId: string,
    totalChannels: number,
    billing: BillingTier
  ) {
    if (!organizationId) {
      return false;
    }

    if (!pricing[billing]) {
      console.error('subscription_unknown_tier', { organizationId, billing });
      return false;
    }

    const getCurrentSubscription =
      (await this._subscriptionRepository.getSubscriptionByOrgId(
        organizationId
      ))!;

    const from = pricing[getCurrentSubscription?.subscriptionTier || 'FREE'];
    const to = pricing[billing];

    const allChannels = await this._integrationService.getIntegrationsList(
      organizationId
    );
    const currentTotalChannels = allChannels.filter((f) => !f.disabled);

    if (currentTotalChannels.length > totalChannels) {
      await this._integrationService.disableIntegrations(
        organizationId,
        currentTotalChannels.length - totalChannels
      );
    }

    // channels are auto-disabled when a subscription lapses; once the new plan
    // can hold all of them and the limit grew, enable everything back (partial
    // enabling or same-plan updates would risk enabling channels the user
    // disabled on purpose)
    if (
      billing !== 'FREE' &&
      currentTotalChannels.length < allChannels.length &&
      allChannels.length <= totalChannels &&
      totalChannels > (getCurrentSubscription?.totalChannels || 0)
    ) {
      try {
        await this._integrationService.enableAllIntegrations(organizationId);
      } catch (err) {
        console.error(
          'Error enabling channels after subscription change:',
          err
        );
      }
    }

    if (from.team_members && !to.team_members) {
      await this._organizationService.disableOrEnableNonSuperAdminUsers(
        organizationId,
        true
      );
    }

    if (!from.team_members && to.team_members) {
      await this._organizationService.disableOrEnableNonSuperAdminUsers(
        organizationId,
        false
      );
    }

    // FREE stops the feeds below; a paid plan without RSS auto-posting pauses
    // them (see the downgrade policy in pricing.ts)
    if (billing !== 'FREE' && !allowsAutoPost(to)) {
      await this.pauseAutoposts(organizationId);
    }

    if (billing === 'FREE') {
      await this._integrationService.changeActiveCron(organizationId);
    }

    return true;
  }

  async modifySubscription(
    customerId: string,
    totalChannels: number,
    billing: BillingTier
  ) {
    if (!customerId) {
      return false;
    }

    if (!pricing[billing]) {
      console.error('subscription_unknown_tier', { customerId, billing });
      return false;
    }

    const getOrgByCustomerId =
      await this._subscriptionRepository.getOrganizationByCustomerId(
        customerId
      );

    const getCurrentSubscription =
      (await this._subscriptionRepository.getSubscriptionByCustomerId(
        customerId
      ))!;

    if (
      !getOrgByCustomerId ||
      (getCurrentSubscription && getCurrentSubscription?.isLifetime)
    ) {
      return false;
    }

    const from = pricing[getCurrentSubscription?.subscriptionTier || 'FREE'];
    const to = pricing[billing];

    const allChannels = await this._integrationService.getIntegrationsList(
      getOrgByCustomerId?.id!
    );
    const currentTotalChannels = allChannels.filter((f) => !f.disabled);

    if (currentTotalChannels.length > totalChannels) {
      await this._integrationService.disableIntegrations(
        getOrgByCustomerId?.id!,
        currentTotalChannels.length - totalChannels
      );
    }

    // channels are auto-disabled when a subscription lapses; once the new plan
    // can hold all of them and the limit grew, enable everything back (partial
    // enabling or same-plan updates would risk enabling channels the user
    // disabled on purpose)
    if (
      billing !== 'FREE' &&
      currentTotalChannels.length < allChannels.length &&
      allChannels.length <= totalChannels &&
      totalChannels > (getCurrentSubscription?.totalChannels || 0)
    ) {
      try {
        await this._integrationService.enableAllIntegrations(
          getOrgByCustomerId?.id!
        );
      } catch (err) {
        console.error(
          'Error enabling channels after subscription change:',
          err
        );
      }
    }

    if (from.team_members && !to.team_members) {
      await this._organizationService.disableOrEnableNonSuperAdminUsers(
        getOrgByCustomerId?.id!,
        true
      );
    }

    if (!from.team_members && to.team_members) {
      await this._organizationService.disableOrEnableNonSuperAdminUsers(
        getOrgByCustomerId?.id!,
        false
      );
    }

    // FREE stops the feeds below; a paid plan without RSS auto-posting pauses
    // them (see the downgrade policy in pricing.ts)
    if (billing !== 'FREE' && !allowsAutoPost(to)) {
      await this.pauseAutoposts(getOrgByCustomerId?.id!);
    }

    if (billing === 'FREE') {
      await this._integrationService.changeActiveCron(getOrgByCustomerId?.id!);
    }

    return true;
  }

  async createOrUpdateSubscription(
    provider: string,
    isTrailing: boolean,
    identifier: string,
    customerId: string,
    totalChannels: number,
    billing: PaidTier,
    period: 'MONTHLY' | 'YEARLY',
    cancelAt: number | null,
    code?: string,
    org?: string
  ) {
    if (!code) {
      if (!(await this.isManagedBy(customerId, provider))) {
        return {};
      }
      try {
        const load = await this.modifySubscription(
          customerId,
          totalChannels,
          billing
        );
        if (!load) {
          return {};
        }
      } catch (e) {
        console.error('Error modifying subscription:', e);
        return {};
      }
    }
    return this._subscriptionRepository.createOrUpdateSubscription(
      provider,
      isTrailing,
      identifier,
      customerId,
      totalChannels,
      billing,
      period,
      cancelAt,
      code,
      org ? { id: org } : undefined
    );
  }

  async createOrUpdateSubscriptionByOrg(
    isTrailing: boolean,
    organizationId: string,
    provider: string,
    identifier: string,
    totalChannels: number,
    billing: PaidTier,
    period: 'MONTHLY' | 'YEARLY',
    cancelAt: number | null
  ) {
    const current = await this._subscriptionRepository.getSubscriptionByOrgId(
      organizationId
    );
    if (current && (current.isLifetime || current.provider !== provider)) {
      return {};
    }

    try {
      const load = await this.modifySubscriptionByOrg(
        organizationId,
        totalChannels,
        billing
      );
      if (!load) {
        return {};
      }
    } catch (e) {
      console.error('Error modifying subscription:', e);
      return {};
    }

    return this._subscriptionRepository.createOrUpdateSubscription(
      provider,
      isTrailing,
      identifier,
      '',
      totalChannels,
      billing,
      period,
      cancelAt,
      undefined,
      { id: organizationId }
    );
  }

  getSubscriptionByIdentifier(identifier: string) {
    return this._subscriptionRepository.getSubscriptionByIdentifier(identifier);
  }

  // For work that is metered (minutes) and outlives a single call, so it can't
  // be wrapped in useCredit: the caller picks the id, charging twice is one
  // row, and the same id refunds it on failure
  chargeCredits(
    id: string,
    organizationId: string,
    type: string,
    credits: number
  ) {
    return this._subscriptionRepository.chargeCredits(
      id,
      organizationId,
      type,
      credits
    );
  }

  refundCredits(organizationId: string, id: string) {
    return this._subscriptionRepository.refundCredits(organizationId, id);
  }

  async getSubscription(organizationId: string) {
    return this._subscriptionRepository.getSubscription(organizationId);
  }

  private currentPeriodStart(subscriptionCreatedAt: Date) {
    let date = dayjs(subscriptionCreatedAt);
    while (date.isBefore(dayjs())) {
      date = date.add(1, 'month');
    }

    return date.subtract(1, 'month');
  }

  async resetCredits(organizationId: string, type: string) {
    const subscription = await this._subscriptionRepository.getSubscription(
      organizationId
    );

    if (!subscription) {
      return null;
    }

    const { count } = await this._subscriptionRepository.deleteCreditsFrom(
      organizationId,
      this.currentPeriodStart(subscription.createdAt),
      type
    );

    return { deleted: count };
  }

  async checkCredits(organization: Organization, checkType = 'ai_images') {
    // @ts-ignore
    const type = organization?.subscription?.subscriptionTier || 'FREE';

    if (type === 'FREE') {
      return { credits: 0 };
    }

    const checkFromMonth = this.currentPeriodStart(
      // @ts-ignore
      organization.subscription.createdAt
    );
    const imageGenerationCount =
      checkType === 'ai_images'
        ? pricing[type].image_generation_count
        : checkType === 'clipping_minutes'
        ? pricing[type].clipping_minutes
        : pricing[type].generate_videos;

    const totalUse = await this._subscriptionRepository.getCreditsFrom(
      organization.id,
      checkFromMonth,
      checkType
    );

    return {
      credits: imageGenerationCount - totalUse,
    };
  }

  async addSubscription(
    orgId: string,
    userId: string,
    subscription: PaidTier,
    provider: string
  ) {
    await this._subscriptionRepository.setCustomerId(orgId, userId);
    return this.createOrUpdateSubscription(
      provider,
      false,
      makeId(5),
      userId,
      pricing[subscription].channel!,
      subscription,
      'MONTHLY',
      null,
      undefined,
      orgId
    );
  }
}
