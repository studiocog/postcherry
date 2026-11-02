'use client';

import React, { FC, useCallback } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import Link from 'next/link';
import { Subscription } from '@prisma/client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { usePlanName } from '@gitroom/frontend/components/billing/use.plans';
import { useBrands } from '@gitroom/frontend/components/brands/brand.context';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { pricing } from '@gitroom/nestjs-libraries/database/prisma/subscriptions/pricing';
import ReactLoading from '@gitroom/frontend/components/layout/loading';

// trial end and next renewal of the current plan, unix seconds
export const useRenewal = (enabled: boolean) => {
  const fetch = useFetch();
  const load = useCallback(async (path: string) => {
    return (await fetch(path)).json();
  }, []);

  return useSWR<{ trialEnd: number | null; renewsAt: number | null }>(
    enabled ? '/billing/renewal' : null,
    load,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
    }
  );
};

const daysLeft = (unix: number) =>
  Math.max(0, Math.ceil((unix * 1000 - Date.now()) / 86400000));

const formatDate = (unix: number) =>
  newDayjs(unix * 1000)
    .local()
    .format('D MMM, YYYY');

// The plan in the top bar, it opens the billing page
export const PlanBadge: FC = () => {
  const t = useT();
  const user = useUser();
  const planName = usePlanName();
  const { billingEnabled } = useVariables();
  // the same people who see the Billing menu item
  const visible =
    billingEnabled &&
    !user?.isLifetime &&
    (user?.role === 'ADMIN' || user?.role === 'SUPERADMIN');
  const { data } = useRenewal(visible && !!user?.isTrailing);

  if (!visible) {
    return null;
  }

  const tier = user?.tier?.current || 'FREE';
  const label =
    tier === 'FREE'
      ? t('choose_a_plan', 'Choose a plan')
      : user?.isTrailing
      ? data?.trialEnd
        ? t('trial_days_left', 'Trial · {{count}} days left', {
            count: daysLeft(data.trialEnd),
          })
        : t('free_trial', 'Free trial')
      : planName(tier);

  return (
    <Link
      href="/billing"
      title={tier === 'FREE' ? label : planName(tier)}
      className={clsx(
        'flex items-center gap-[8px] h-[44px] px-[10px] rounded-[10px] shrink-0 transition-colors',
        tier === 'FREE' || user?.isTrailing
          ? 'bg-btnPrimary hover:opacity-90 text-white'
          : 'bg-white/[0.08] hover:bg-white/[0.14] text-white'
      )}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect
          x="2"
          y="5"
          width="20"
          height="14"
          rx="2"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M2 10h20M6 15h4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <div className="flex flex-col items-start">
        <span className="text-[10px] leading-[1.2] uppercase tracking-[0.04em] text-white/70">
          {t('billing', 'Billing')}
        </span>
        <span className="text-[14px] leading-[1.2] font-[600] whitespace-nowrap">
          {label}
        </span>
      </div>
    </Link>
  );
};

const cardButton =
  'h-[40px] px-[14px] rounded-[8px] text-[14px] font-[500] flex items-center justify-center transition-all disabled:opacity-50 whitespace-nowrap';

// The "Current plan" card at the top of the billing page
export const CurrentPlanCard: FC<{
  subscription?: Pick<
    Subscription,
    'subscriptionTier' | 'period' | 'cancelAt' | 'totalChannels'
  >;
  loading: string;
  onChangePlan: () => void;
  onSwitchPeriod: () => void;
  onCancel: () => void;
  onReactivate: () => void;
}> = (props) => {
  const {
    subscription,
    loading,
    onChangePlan,
    onSwitchPeriod,
    onCancel,
    onReactivate,
  } = props;
  const t = useT();
  const user = useUser();
  const planName = usePlanName();
  const { isGeneral } = useVariables();
  const { brands, limit, totalChannels } = useBrands();
  const { data: renewal } = useRenewal(!!subscription);

  if (!subscription) {
    return (
      <div className="flex items-center gap-[16px] rounded-[12px] border border-newTableBorder bg-newBgColorInner shadow-previewShadow px-[24px] py-[20px] mobile:flex-col mobile:items-stretch mobile:p-[16px]">
        <div className="flex-1 flex flex-col gap-[4px]">
          <div className="text-[12px] font-[600] uppercase tracking-[0.04em] text-textItemBlur">
            {t('billing_current_plan', 'Current Plan')}
          </div>
          <div className="text-[18px] font-[600]">
            {t('no_plan_yet', 'You do not have a plan yet')}
          </div>
        </div>
        <button
          type="button"
          onClick={onChangePlan}
          className={clsx(cardButton, 'bg-btnPrimary text-white hover:opacity-90')}
        >
          {t('choose_a_plan', 'Choose a plan')}
        </button>
      </div>
    );
  }

  const tier = subscription.subscriptionTier;
  const yearly = subscription.period === 'YEARLY';
  const price = yearly ? pricing[tier]?.year_price : pricing[tier]?.month_price;
  const status = subscription.cancelAt
    ? t('plan_cancels_on', 'Cancels on {{date}}, you will not be charged again', {
        date: newDayjs(subscription.cancelAt).local().format('D MMM, YYYY'),
      })
    : user?.isTrailing && renewal?.trialEnd
    ? t('plan_trial_ends_on', 'Free trial ends on {{date}} ({{count}} days left)', {
        date: formatDate(renewal.trialEnd),
        count: daysLeft(renewal.trialEnd),
      })
    : renewal?.renewsAt
    ? t('plan_renews_on', 'Renews on {{date}}', {
        date: formatDate(renewal.renewsAt),
      })
    : '';

  const spinner = (
    <ReactLoading type="spin" color="currentColor" width={18} height={18} />
  );

  return (
    <div className="flex flex-col gap-[16px] rounded-[12px] border border-newTableBorder bg-newBgColorInner shadow-previewShadow px-[24px] py-[20px] mobile:p-[16px]">
      <div className="flex items-start gap-[16px] mobile:flex-col">
        <div className="flex-1 flex flex-col gap-[6px] min-w-0">
          <div className="text-[12px] font-[600] uppercase tracking-[0.04em] text-textItemBlur">
            {t('billing_current_plan', 'Current Plan')}
          </div>
          <div className="flex items-center gap-[10px] flex-wrap">
            <div className="text-[22px] font-[700]">{planName(tier)}</div>
            {user?.isTrailing && !subscription.cancelAt && (
              <div className="h-[24px] px-[10px] rounded-full bg-[#D21F3C]/10 text-btnPrimary text-[12px] font-[600] flex items-center">
                {t('free_trial', 'Free trial')}
              </div>
            )}
            {!!subscription.cancelAt && (
              <div className="h-[24px] px-[10px] rounded-full bg-[#FFAC30]/15 text-[#C27A00] text-[12px] font-[600] flex items-center">
                {t('plan_canceled', 'Canceled')}
              </div>
            )}
          </div>
          <div className="text-[15px]">
            <span className="font-[600]">${price}</span>{' '}
            <span className="text-textItemBlur">
              {yearly
                ? t('billing_per_year', '/ year')
                : t('billing_per_month', '/ month')}
            </span>
          </div>
          {!!status && (
            <div className="text-[14px] text-textItemBlur">{status}</div>
          )}
        </div>
        <div className="flex flex-col gap-[6px] text-[14px] text-textItemBlur mobile:w-full">
          <div>
            {t('plan_social_accounts_used', '{{used}} of {{limit}} social accounts', {
              used: totalChannels,
              limit: subscription.totalChannels,
            })}
          </div>
          {limit !== null && (
            <div>
              {t('plan_brands_used', '{{used}} of {{limit}} brands', {
                used: brands.length,
                limit,
              })}{' '}
              <Link
                href="/settings?tab=brands"
                className="text-newTextColor underline"
              >
                {t('manage_brands', 'Manage brands')}
              </Link>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-[8px] flex-wrap mobile:flex-col mobile:items-stretch">
        <button
          type="button"
          onClick={onChangePlan}
          className={clsx(cardButton, 'bg-btnPrimary text-white hover:opacity-90')}
        >
          {t('billing_change_plan', 'Change plan')}
        </button>
        {!subscription.cancelAt && (
          <button
            type="button"
            disabled={!!loading}
            onClick={onSwitchPeriod}
            className={clsx(cardButton, 'bg-btnSimple text-btnText hover:opacity-80')}
          >
            {loading === 'PERIOD'
              ? spinner
              : yearly
              ? t('billing_switch_to_monthly', 'Switch to monthly')
              : t('billing_switch_to_yearly_save', 'Switch to yearly (2 months free)')}
          </button>
        )}
        <div className="flex-1 mobile:hidden" />
        {isGeneral && subscription.cancelAt && (
          <button
            type="button"
            disabled={!!loading}
            onClick={onReactivate}
            className={clsx(cardButton, 'bg-btnPrimary text-white hover:opacity-90')}
          >
            {loading === 'REACTIVATE'
              ? spinner
              : t('reactivate_subscription', 'Reactivate subscription')}
          </button>
        )}
        {isGeneral && !subscription.cancelAt && (
          <button
            type="button"
            disabled={!!loading}
            onClick={onCancel}
            className={clsx(
              cardButton,
              'border border-red-500/40 text-red-500 hover:bg-red-500/10'
            )}
          >
            {loading === 'CANCEL'
              ? spinner
              : t('cancel_subscription_1', 'Cancel subscription')}
          </button>
        )}
      </div>
    </div>
  );
};
