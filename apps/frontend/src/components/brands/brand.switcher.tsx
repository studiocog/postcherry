'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import Link from 'next/link';
import { useClickOutside } from '@mantine/hooks';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { Input } from '@gitroom/react/form/input';
import { Button } from '@gitroom/react/form/button';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { DropdownArrowIcon } from '@gitroom/frontend/components/ui/icons';
import {
  useBrands,
  useOrganizationList,
} from '@gitroom/frontend/components/brands/brand.context';

const avatarColors = [
  'bg-[#D21F3C]',
  'bg-[#E0567A]',
  'bg-[#F08A3E]',
  'bg-[#7C5CFF]',
  'bg-[#2BA673]',
  'bg-[#1E88E5]',
];

// the brand's initial on a color picked from its name
export const BrandAvatar: FC<{ name: string; size?: number }> = ({
  name,
  size = 28,
}) => {
  const color = useMemo(
    () =>
      avatarColors[
        Array.from(name || '').reduce((all, c) => all + c.charCodeAt(0), 0) %
          avatarColors.length
      ],
    [name]
  );
  return (
    <div
      style={{ width: size, height: size, minWidth: size }}
      className={clsx(
        'rounded-[8px] flex items-center justify-center text-white font-[700] uppercase select-none',
        size > 30 ? 'text-[15px]' : 'text-[13px]',
        color
      )}
    >
      {(name || '?').trim().charAt(0)}
    </div>
  );
};

export const AddBrandModal: FC<{
  close: () => void;
  onCreated?: (brand: { id: string; name: string }) => void;
}> = ({ close, onCreated }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { brands, channels, totalChannels, reload, setCurrent } = useBrands();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  // the first brand can take the channels the workspace already has
  const withoutBrand = channels[''] || 0;
  const offerAssign = !brands.length && withoutBrand > 0;
  const [assignAllChannels, setAssignAllChannels] = useState(true);

  const save = useCallback(async () => {
    if (!name.trim()) {
      return;
    }
    setLoading(true);
    const response = await fetch('/integrations/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        ...(offerAssign ? { assignAllChannels } : {}),
      }),
    });
    setLoading(false);
    // the plan limit (402) shows its own dialog
    if (response.status === 402) {
      return;
    }
    if (!response.ok) {
      const { message } = await response.json().catch(() => ({} as any));
      toaster.show(
        (Array.isArray(message) ? message[0] : message) ||
          t('could_not_create_brand', 'Could not create the brand.'),
        'warning'
      );
      return;
    }
    const brand = await response.json();
    await reload();
    setCurrent(brand.id);
    toaster.show(
      t(
        'brand_created',
        'Brand created. Connect its social accounts with Add Channel.'
      ),
      'success'
    );
    onCreated?.(brand);
    close();
  }, [name, offerAssign, assignAllChannels, reload, setCurrent, onCreated]);

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="text-[14px] text-textItemBlur">
        {t(
          'add_brand_description',
          'A brand groups the social accounts of one business or client. Pick it in the brand switcher to see only its calendar, channels and analytics.'
        )}
      </div>
      <Input
        name="brand_name"
        disableForm={true}
        label={t('brand_name', 'Brand name')}
        value={name}
        maxLength={100}
        autoFocus={true}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            save();
          }
        }}
      />
      {offerAssign && (
        <div className="flex items-center gap-[10px] text-[14px]">
          <Checkbox
            disableForm={true}
            checked={assignAllChannels}
            onChange={(e) => setAssignAllChannels(e.target.value)}
          />
          <div
            className="cursor-pointer select-none"
            onClick={() => setAssignAllChannels(!assignAllChannels)}
          >
            {t(
              'add_brand_assign_channels',
              'Put my {{count}} connected channels in this brand',
              { count: withoutBrand || totalChannels }
            )}
          </div>
        </div>
      )}
      <div className="flex">
        <Button onClick={save} loading={loading} disabled={!name.trim()}>
          {t('create_brand', 'Create brand')}
        </Button>
      </div>
    </div>
  );
};

export const useAddBrand = () => {
  const modals = useModals();
  const t = useT();
  return useCallback(() => {
    modals.openModal({
      title: t('add_brand', 'Add brand'),
      children: (close) => <AddBrandModal close={close} />,
    });
  }, [modals, t]);
};

// "Your plan includes N brands", with the way to more brands
export const BrandLimitNotice: FC<{ className?: string }> = ({
  className,
}) => {
  const t = useT();
  const user = useUser();
  const { limit } = useBrands();
  return (
    <div className={clsx('text-[13px] text-textItemBlur', className)}>
      {t('your_plan_includes_brands', 'Your plan includes {{count}} brands.', {
        count: limit || 0,
      })}{' '}
      {user?.role !== 'USER' && (
        <Link href="/billing" className="text-btnPrimary font-[600] underline">
          {t('upgrade_plan', 'Upgrade plan')}
        </Link>
      )}
    </div>
  );
};

export const BrandSwitcher: FC<{ variant?: 'bar' | 'mobile' }> = ({
  variant = 'bar',
}) => {
  const t = useT();
  const user = useUser();
  const {
    brands,
    current,
    currentBrand,
    setCurrent,
    canAdd,
    limit,
    channels,
    totalChannels,
  } = useBrands();
  const { data: organizations } = useOrganizationList();
  const addBrand = useAddBrand();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useClickOutside(() => setOpen(false));

  // a workspace without brands is its own single brand
  const orgName =
    (Array.isArray(organizations) &&
      organizations.find((p) => p.id === user?.orgId)?.name) ||
    t('my_brand', 'My brand');
  const showAll = brands.length > 1 || (brands.length === 1 && !!channels['']);
  const label = currentBrand
    ? currentBrand.name
    : brands.length
    ? t('all_brands', 'All brands')
    : orgName;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? brands.filter((p) => p.name.toLowerCase().includes(q))
      : brands;
  }, [brands, search]);

  const select = useCallback(
    (id: string) => () => {
      setCurrent(id);
      setOpen(false);
      setSearch('');
    },
    [setCurrent]
  );

  const row = (
    key: string,
    name: string,
    count: number,
    selected: boolean,
    onClick?: () => void,
    avatar = true
  ) => (
    <div
      key={key}
      onClick={onClick}
      className={clsx(
        'flex items-center gap-[10px] mx-[6px] px-[10px] h-[44px] rounded-[8px] select-none',
        onClick && 'cursor-pointer hover:bg-boxHover',
        selected && 'bg-boxFocused'
      )}
    >
      {avatar ? (
        <BrandAvatar name={name} />
      ) : (
        <div className="w-[28px] h-[28px] min-w-[28px] rounded-[8px] border border-dashed border-newTableBorder flex items-center justify-center text-textItemBlur">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 6h16M4 12h16M4 18h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-[600] truncate">{name}</div>
        <div className="text-[12px] text-textItemBlur">
          {t('brand_channels_count', '{{count}} channels', { count })}
        </div>
      </div>
      {selected && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-btnPrimary">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('switch_brand', 'Switch brand')}
        className={clsx(
          'flex items-center gap-[8px] rounded-[10px] transition-colors',
          variant === 'bar'
            ? 'h-[44px] ps-[6px] pe-[8px] bg-white/[0.08] hover:bg-white/[0.14] text-white'
            : 'h-[36px] ps-[4px] pe-[4px] hover:bg-boxFocused text-newTextColor'
        )}
      >
        {currentBrand || !brands.length ? (
          <BrandAvatar name={label} size={variant === 'bar' ? 32 : 28} />
        ) : (
          <div
            className={clsx(
              'rounded-[8px] flex items-center justify-center font-[700] text-[12px]',
              variant === 'bar'
                ? 'w-[32px] h-[32px] bg-white/[0.16]'
                : 'w-[28px] h-[28px] bg-boxFocused'
            )}
          >
            {brands.length}
          </div>
        )}
        <div
          className={clsx(
            'flex flex-col items-start min-w-0',
            variant === 'mobile' && 'max-w-[90px]'
          )}
        >
          {variant === 'bar' && (
            <span className="text-[10px] leading-[1.2] uppercase tracking-[0.04em] text-white/60">
              {t('brand', 'Brand')}
            </span>
          )}
          <span
            className={clsx(
              'font-[600] truncate max-w-[160px] tablet:max-w-[110px]',
              variant === 'bar' ? 'text-[14px] leading-[1.2]' : 'text-[13px] max-w-[90px]'
            )}
          >
            {label}
          </span>
        </div>
        <DropdownArrowIcon size={16} rotated={open} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-[calc(100%+8px)] start-0 mobile:start-auto mobile:end-0 z-[600] w-[300px] max-w-[calc(100vw-24px)] rounded-[12px] border border-newTableBorder bg-newBgColorInner text-newTextColor menu-shadow flex flex-col py-[8px] animate-normalFadeDown"
        >
          <div className="flex items-center justify-between px-[16px] pt-[4px] pb-[8px] text-[12px] font-[600] uppercase tracking-[0.04em] text-textItemBlur">
            <span>{t('brands', 'Brands')}</span>
            {limit !== null && (
              <span>
                {t('brands_used', '{{used}} of {{limit}}', {
                  used: brands.length,
                  limit,
                })}
              </span>
            )}
          </div>
          {brands.length > 6 && (
            <div className="px-[12px] pb-[8px]">
              <input
                value={search}
                autoFocus={true}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('search_brands', 'Search brands')}
                className="w-full h-[38px] px-[12px] rounded-[8px] border border-newTableBorder bg-newBgColor text-[14px] outline-none focus:border-btnPrimary"
              />
            </div>
          )}
          <div className="max-h-[320px] overflow-y-auto flex flex-col gap-[2px]">
            {showAll &&
              !search &&
              row(
                'all',
                t('all_brands', 'All brands'),
                totalChannels,
                !current,
                select(''),
                false
              )}
            {!brands.length && row('org', orgName, totalChannels, true)}
            {filtered.map((brand) =>
              row(
                brand.id,
                brand.name,
                channels[brand.id] || 0,
                current === brand.id,
                select(brand.id)
              )
            )}
            {!!search && !filtered.length && (
              <div className="px-[16px] py-[10px] text-[14px] text-textItemBlur">
                {t('no_brands_found', 'No brands found')}
              </div>
            )}
          </div>
          <div className="h-[1px] bg-newTableBorder my-[8px]" />
          {canAdd ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                addBrand();
              }}
              className="flex items-center gap-[10px] mx-[6px] px-[10px] h-[40px] rounded-[8px] hover:bg-boxHover text-[14px] font-[600] text-start"
            >
              <span className="w-[28px] text-center text-[18px] leading-none">
                +
              </span>
              {t('add_brand', 'Add brand')}
            </button>
          ) : (
            <div className="mx-[6px] px-[10px] py-[6px] flex flex-col gap-[2px]">
              <div className="flex items-center gap-[10px] text-[14px] font-[600] opacity-50">
                <span className="w-[28px] text-center text-[18px] leading-none">
                  +
                </span>
                {t('add_brand', 'Add brand')}
              </div>
              <BrandLimitNotice className="ps-[38px]" />
            </div>
          )}
          <Link
            href="/settings?tab=brands"
            onClick={() => setOpen(false)}
            className="flex items-center gap-[10px] mx-[6px] px-[10px] h-[40px] rounded-[8px] hover:bg-boxHover text-[14px] font-[500]"
          >
            <span className="w-[28px] flex justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            {t('manage_brands', 'Manage brands')}
          </Link>
        </div>
      )}
    </div>
  );
};
