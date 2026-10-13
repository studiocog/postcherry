'use client';

import { useCallback, useMemo, useState } from 'react';
import { capitalize } from 'lodash';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useAccountType } from '@gitroom/frontend/components/settings/account-type.component';
import {
  audienceForAccountType,
  isLegacyTier,
  isNewTier,
  LEGACY_TIERS,
  NEW_TIERS,
  PLAN_GROUPS,
  PlanAudience,
  POPULAR_PLAN,
} from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';

// the plans of one audience, or every plan
export type PlanView = PlanAudience | 'ALL';

export const usePlanName = () => {
  const t = useT();
  return useCallback(
    (tier: string) => {
      switch (tier) {
        case 'PERSONAL':
          return t('plan_personal', 'Personal');
        case 'CREATOR':
          return t('plan_creator', 'Creator');
        case 'BUSINESS':
          return t('plan_business', 'Business');
        case 'BUSINESS_PLUS':
          return t('plan_business_plus', 'Business Plus');
        case 'FREELANCER':
          return t('plan_freelancer', 'Freelancer');
        case 'AGENCY':
          return t('plan_agency', 'Agency');
        case 'AGENCY_PRO':
          return t('plan_agency_pro', 'Agency Pro');
        default:
          return capitalize(tier);
      }
    },
    [t]
  );
};

export const usePlanTagline = () => {
  const t = useT();
  return useCallback(
    (tier: string) => {
      switch (tier) {
        case 'PERSONAL':
          return t(
            'plan_personal_tagline',
            'For anyone posting for themselves'
          );
        case 'CREATOR':
          return t('plan_creator_tagline', 'For creators who post a lot');
        case 'BUSINESS':
          return t('plan_business_tagline', 'For one business or brand');
        case 'BUSINESS_PLUS':
          return t(
            'plan_business_plus_tagline',
            'For several brands or locations'
          );
        case 'FREELANCER':
          return t(
            'plan_freelancer_tagline',
            'For freelancers managing a few clients'
          );
        case 'AGENCY':
          return t('plan_agency_tagline', 'For growing agencies');
        case 'AGENCY_PRO':
          return t(
            'plan_agency_pro_tagline',
            'For agencies with many clients'
          );
        default:
          return '';
      }
    },
    [t]
  );
};

const audienceForTier = (tier: string) =>
  (Object.keys(PLAN_GROUPS) as PlanAudience[]).find((audience) =>
    (PLAN_GROUPS[audience] as string[]).includes(tier)
  );

export const PLAN_VIEWS: PlanView[] = ['INDIVIDUAL', 'BUSINESS', 'AGENCY', 'ALL'];
export const isPlanView = (value?: string | null): value is PlanView =>
  !!value && (PLAN_VIEWS as string[]).includes(value);

// The plans to show on the billing page: the ones made for the workspace
// account type by default, with a switch to the other audiences or all of
// them. A subscriber always sees their own plan, and a legacy subscriber can
// see the other legacy plans (they can still move between them). A link can
// open a given view (an upsell for a feature of another audience).
export const useVisiblePlans = (
  currentTier?: string,
  initialView?: PlanView
) => {
  const { accountType } = useAccountType();
  const [view, setView] = useState<PlanView>(
    () =>
      initialView ||
      (isNewTier(currentTier) && audienceForTier(currentTier)) ||
      audienceForAccountType(accountType)
  );

  const plans = useMemo(() => {
    const list: string[] =
      view === 'ALL' ? [...NEW_TIERS] : [...PLAN_GROUPS[view]];

    if (isLegacyTier(currentTier)) {
      return [...(view === 'ALL' ? LEGACY_TIERS : [currentTier]), ...list];
    }

    if (isNewTier(currentTier) && !list.includes(currentTier)) {
      return [currentTier, ...list];
    }

    return list;
  }, [view, currentTier]);

  const popular: string[] = useMemo(
    () =>
      view === 'ALL' ? Object.values(POPULAR_PLAN) : [POPULAR_PLAN[view]],
    [view]
  );

  return { view, setView, plans, popular };
};
