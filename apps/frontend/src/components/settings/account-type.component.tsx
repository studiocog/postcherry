'use client';

import React, { FC, useCallback, useState } from 'react';
import clsx from 'clsx';
import { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';

export type AccountType = 'INDIVIDUAL' | 'BUSINESS' | 'AGENCY';

// Individuals and businesses get the simple interface, agencies (or nothing chosen yet) get everything
export const useAccountType = () => {
  const user = useUser();
  const accountType = user?.accountType || null;
  return {
    accountType,
    isIndividual: accountType === 'INDIVIDUAL',
    isSimple: accountType === 'INDIVIDUAL' || accountType === 'BUSINESS',
  };
};

export const useSaveAccountType = () => {
  const fetch = useFetch();
  const { mutate } = useSWRConfig();

  return useCallback(
    async (accountType: AccountType) => {
      await fetch('/settings/account-type', {
        method: 'POST',
        body: JSON.stringify({ accountType }),
      });
      await mutate('/user/self');
    },
    [fetch, mutate]
  );
};

export const AccountTypePicker: FC<{
  value: AccountType | null;
  onSelect: (accountType: AccountType) => void;
}> = ({ value, onSelect }) => {
  const t = useT();

  const options: {
    type: AccountType;
    emoji: string;
    title: string;
    description: string;
  }[] = [
    {
      type: 'INDIVIDUAL',
      emoji: '🙋',
      title: t('account_type_individual', 'Just me'),
      description: t(
        'account_type_individual_description',
        'Creator, influencer or personal brand'
      ),
    },
    {
      type: 'BUSINESS',
      emoji: '🏪',
      title: t('account_type_business', 'My business'),
      description: t(
        'account_type_business_description',
        'I post for my own company, shop or brand'
      ),
    },
    {
      type: 'AGENCY',
      emoji: '🏢',
      title: t('account_type_agency', 'Agency or freelancer'),
      description: t(
        'account_type_agency_description',
        'I manage social media for clients'
      ),
    },
  ];

  return (
    <div className="grid grid-cols-3 mobile:grid-cols-1 gap-[16px] w-full max-w-[860px]">
      {options.map((option) => (
        <button
          key={option.type}
          type="button"
          onClick={() => onSelect(option.type)}
          className={clsx(
            'flex flex-col items-center text-center gap-[8px] p-[24px] rounded-[16px] border-2 transition-colors hover:border-btnPrimary',
            value === option.type
              ? 'border-btnPrimary bg-boxFocused'
              : 'border-newColColor bg-newTableHeader'
          )}
        >
          <span className="text-[40px] leading-none">{option.emoji}</span>
          <span className="text-[18px] font-semibold">{option.title}</span>
          <span className="text-[14px] text-textItemBlur">
            {option.description}
          </span>
        </button>
      ))}
    </div>
  );
};

const AccountTypeComponent = () => {
  const t = useT();
  const toaster = useToaster();
  const { accountType } = useAccountType();
  const saveAccountType = useSaveAccountType();
  const [localValue, setLocalValue] = useState<AccountType | null>(
    accountType
  );

  const handleSelect = useCallback(
    async (newValue: AccountType) => {
      setLocalValue(newValue);
      await saveAccountType(newValue);
      toaster.show(t('settings_updated', 'Settings updated'), 'success');
    },
    [saveAccountType, toaster, t]
  );

  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[24px]">
      <div className="flex flex-col">
        <div className="mt-[4px]">{t('account_type', 'Account type')}</div>
        <div className="text-[12px] text-textItemBlur">
          {t(
            'account_type_settings_description',
            'Individuals and businesses get a simpler interface. Agencies see every feature.'
          )}
        </div>
      </div>
      <AccountTypePicker value={localValue} onSelect={handleSelect} />
    </div>
  );
};

export default AccountTypeComponent;
