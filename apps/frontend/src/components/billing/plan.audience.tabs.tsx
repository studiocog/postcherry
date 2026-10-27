'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PlanView } from '@gitroom/frontend/components/billing/use.plans';

export const PlanAudienceTabs: FC<{
  value: PlanView;
  onChange: (value: PlanView) => void;
  className?: string;
}> = ({ value, onChange, className }) => {
  const t = useT();

  const options: { value: PlanView; label: string }[] = [
    { value: 'INDIVIDUAL', label: t('billing_plans_for_me', 'Just me') },
    { value: 'BUSINESS', label: t('billing_plans_for_business', 'Business') },
    { value: 'AGENCY', label: t('billing_plans_for_agency', 'Agency') },
    { value: 'ALL', label: t('billing_view_all_plans', 'All plans') },
  ];

  return (
    <div
      role="group"
      aria-label={t('billing_plans_for', 'Show plans for')}
      className={clsx(
        'flex p-[4px] border border-newTableBorder rounded-[8px] text-[14px] font-[500] select-none',
        className
      )}
    >
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={clsx(
            'h-[34px] px-[16px] mobile:px-[8px] rounded-[6px] flex items-center justify-center whitespace-nowrap mobile:flex-1',
            value === option.value
              ? 'bg-boxFocused text-textItemFocused'
              : 'cursor-pointer'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
};
