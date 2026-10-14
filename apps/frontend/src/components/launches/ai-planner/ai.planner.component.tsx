'use client';

import React, { FC, useCallback } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';
import { AiPlannerModal } from '@gitroom/frontend/components/launches/ai-planner/ai.planner.modal';

export const useAiPlannerStatus = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    const response = await fetch('/ai-planner/status');
    if (!response.ok) {
      throw new Error('Failed to load the AI planner status');
    }
    return response.json();
  }, []);

  return useSWR<{ configured: boolean }>('ai-planner-status', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

// a calendar with the sparkle of the AI generator
const PlannerIcon: FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 20 20"
    fill="none"
    className="min-w-[18px] min-h-[18px]"
  >
    <path
      d="M17.5 8.33333H2.5M13.3333 1.66667V5M6.66667 1.66667V5M8.75 18.3333H6.5C5.09987 18.3333 4.3998 18.3333 3.86502 18.0609C3.39462 17.8212 3.01217 17.4387 2.77248 16.9683C2.5 16.4335 2.5 15.7335 2.5 14.3333V7.33333C2.5 5.9332 2.5 5.23314 2.77248 4.69836C3.01217 4.22795 3.39462 3.8455 3.86502 3.60582C4.3998 3.33333 5.09987 3.33333 6.5 3.33333H13.5C14.9001 3.33333 15.6002 3.33333 16.135 3.60582C16.6054 3.8455 16.9878 4.22795 17.2275 4.69836C17.5 5.23314 17.5 5.9332 17.5 7.33333V8.75"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M14.5833 11.25L15.1667 12.6667C15.2917 12.9708 15.3542 13.1229 15.4458 13.2512C15.5271 13.3649 15.6268 13.4646 15.7404 13.5458C15.8688 13.6375 16.0208 13.7 16.325 13.825L17.7417 14.4083L16.325 14.9917C16.0208 15.1167 15.8688 15.1792 15.7404 15.2708C15.6268 15.3521 15.5271 15.4518 15.4458 15.5654C15.3542 15.6938 15.2917 15.8458 15.1667 16.15L14.5833 17.5667L14 16.15C13.875 15.8458 13.8125 15.6938 13.7208 15.5654C13.6396 15.4518 13.5399 15.3521 13.4262 15.2708C13.2979 15.1792 13.1458 15.1167 12.8417 14.9917L11.425 14.4083L12.8417 13.825C13.1458 13.7 13.2979 13.6375 13.4262 13.5458C13.5399 13.4646 13.6396 13.3649 13.7208 13.2512C13.8125 13.1229 13.875 12.9708 14 12.6667L14.5833 11.25Z"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Shown for every account type, it is hidden only when there are no channels (like Create Post)
export const AiPlannerButton: FC<{ mobile?: boolean; collapsed?: boolean }> = ({
  mobile,
  collapsed,
}) => {
  const t = useT();
  const user = useUser();
  const router = useRouter();
  const modal = useModals();
  const toaster = useToaster();
  const { billingEnabled } = useVariables();
  const { integrations, customer, reloadCalendarView } = useCalendar();
  const { data: status } = useAiPlannerStatus();
  const notConfigured = status?.configured === false;
  const compact = mobile || collapsed;

  const label = t('plan_with_ai', 'Plan with AI');
  const notConfiguredText = t(
    'ai_planner_not_configured',
    'AI is not set up on this server yet, so the planner is not available.'
  );

  const open = useCallback(async () => {
    if (notConfigured) {
      toaster.show(notConfiguredText, 'warning');
      return;
    }

    if (!user?.tier?.ai) {
      if (!billingEnabled) {
        toaster.show(
          t(
            'ai_planner_not_in_plan',
            'AI features are not included in your plan.'
          ),
          'warning'
        );
        return;
      }

      if (
        await deleteDialog(
          t('upgrade_required', 'You need to upgrade to use this feature'),
          t('move_to_billing', 'Move to billing'),
          t('payment_required', 'Payment Required')
        )
      ) {
        router.push('/billing');
      }
      return;
    }

    // modals render outside of the calendar, so the planner gets what it needs
    // as props, the same way the composer gets the integrations and mutate
    modal.openModal({
      id: 'ai-planner',
      title: label,
      closeOnClickOutside: false,
      closeOnEscape: false,
      askClose: true,
      size: '100%',
      maxSize: 1100,
      classNames: {
        modal: 'text-textColor',
      },
      children: (
        <AiPlannerModal
          integrations={integrations}
          customer={customer}
          reloadCalendarView={reloadCalendarView}
        />
      ),
    });
  }, [
    notConfigured,
    notConfiguredText,
    user,
    billingEnabled,
    integrations,
    customer,
    reloadCalendarView,
    label,
    t,
  ]);

  const tooltip = notConfigured ? notConfiguredText : compact ? label : '';

  return (
    <div
      onClick={open}
      role="button"
      aria-label={label}
      {...(tooltip
        ? { 'data-tooltip-id': 'tooltip', 'data-tooltip-content': tooltip }
        : {})}
      className={clsx(
        'h-[44px] rounded-[8px] bg-btnSimple text-btnText flex items-center gap-[10px] select-none',
        compact
          ? 'w-[44px] min-w-[44px] justify-center'
          : 'w-full ps-[6px] pe-[16px]',
        notConfigured ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      )}
    >
      <div className="w-[32px] h-[32px] min-w-[32px] rounded-[6px] bg-ai flex items-center justify-center">
        <PlannerIcon />
      </div>
      {!compact && <div className="flex-1 text-start text-[14px]">{label}</div>}
    </div>
  );
};
