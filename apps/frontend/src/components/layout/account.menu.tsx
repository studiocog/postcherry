'use client';

import React, { FC, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useClickOutside } from '@mantine/hooks';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useLogout } from '@gitroom/frontend/components/layout/logout.component';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// The signed-in person's menu at the end of the top bar: who is signed in,
// Settings, Billing and Log out (so Log out is never hidden in Settings)
export const AccountMenu: FC<{ variant?: 'bar' | 'mobile' }> = ({
  variant = 'bar',
}) => {
  const user = useUser();
  const logout = useLogout();
  const { billingEnabled, adminUrl } = useVariables();
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  const name =
    [user?.name, user?.lastName].filter(Boolean).join(' ') || user?.email || '';
  const initial = (name || '?').trim().charAt(0).toUpperCase();

  const item =
    'flex items-center gap-[10px] mx-[6px] px-[10px] h-[40px] rounded-[8px] text-[14px] cursor-pointer hover:bg-boxHover select-none';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('account_menu', 'Account menu')}
        title={name}
        className={clsx(
          'flex items-center justify-center rounded-full font-[700] transition-colors',
          variant === 'bar'
            ? 'w-[36px] h-[36px] text-[15px] bg-white text-[#B5172F] hover:bg-white/90'
            : 'w-[32px] h-[32px] text-[14px] bg-btnPrimary text-white'
        )}
      >
        {initial}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-[calc(100%+8px)] end-0 z-[600] w-[260px] max-w-[calc(100vw-24px)] rounded-[12px] border border-newTableBorder bg-newBgColorInner text-newTextColor menu-shadow flex flex-col py-[8px] animate-normalFadeDown"
        >
          <div className="flex items-center gap-[10px] px-[16px] pt-[4px] pb-[10px] border-b border-newTableBorder mb-[6px]">
            <div className="w-[36px] h-[36px] min-w-[36px] rounded-full bg-btnPrimary text-white flex items-center justify-center font-[700]">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-[600] truncate">{name}</div>
              {!!user?.email && name !== user.email && (
                <div className="text-[12px] text-textItemBlur truncate">
                  {user.email}
                </div>
              )}
            </div>
          </div>
          <Link
            href="/settings"
            role="menuitem"
            className={item}
            onClick={() => setOpen(false)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
            {t('settings', 'Settings')}
          </Link>
          {billingEnabled && (
            <Link
              href="/billing"
              role="menuitem"
              className={item}
              onClick={() => setOpen(false)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect
                  x="2.5"
                  y="5"
                  width="19"
                  height="14"
                  rx="2.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <path d="M2.5 10h19" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              {t('billing', 'Billing')}
            </Link>
          )}
          {!!user?.isSuperAdmin && (
            <a
              href={`${adminUrl || ''}/admin`}
              target={adminUrl ? '_blank' : undefined}
              rel="noreferrer"
              role="menuitem"
              className={item}
              onClick={() => setOpen(false)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
              {t('admin_hq', 'Admin (HQ)')}
            </a>
          )}
          <div className="h-[1px] bg-newTableBorder my-[6px]" />
          <div
            role="menuitem"
            tabIndex={0}
            className={clsx(item, 'text-red-500')}
            onClick={() => {
              setOpen(false);
              logout();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setOpen(false);
                logout();
              }
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t('log_out', 'Log out')}
          </div>
        </div>
      )}
    </div>
  );
};
