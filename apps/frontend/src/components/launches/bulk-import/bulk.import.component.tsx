'use client';

import React, { FC, useCallback } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';
import { BulkImportModal } from '@gitroom/frontend/components/launches/bulk-import/bulk.import.modal';

// a sheet with an arrow coming in
const BulkImportIcon: FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="min-w-[18px] min-h-[18px]"
  >
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M12 11v6" />
    <path d="M9 14l3 3 3-3" />
  </svg>
);

// Shown for every account type, it is hidden only when there are no channels (like Create Post)
export const BulkImportButton: FC<{ mobile?: boolean; collapsed?: boolean }> = ({
  mobile,
  collapsed,
}) => {
  const t = useT();
  const modal = useModals();
  const { integrations, reloadCalendarView } = useCalendar();
  const compact = mobile || collapsed;
  const label = t('bulk_import', 'Bulk import (CSV)');

  const open = useCallback(() => {
    // modals render outside of the calendar, so the import gets what it needs
    // as props, the same way the planner does
    modal.openModal({
      id: 'bulk-import',
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
        <BulkImportModal
          integrations={integrations}
          reloadCalendarView={reloadCalendarView}
        />
      ),
    });
  }, [integrations, reloadCalendarView, label]);

  return (
    <button
      type="button"
      onClick={open}
      aria-label={label}
      {...(compact
        ? { 'data-tooltip-id': 'tooltip', 'data-tooltip-content': label }
        : {})}
      className={clsx(
        'h-[44px] rounded-[8px] bg-btnSimple text-btnText flex items-center gap-[10px] select-none cursor-pointer',
        compact
          ? 'w-[44px] min-w-[44px] justify-center'
          : 'w-full ps-[6px] pe-[16px]'
      )}
    >
      <div className="w-[32px] h-[32px] min-w-[32px] rounded-[6px] bg-newBgColorInner flex items-center justify-center">
        <BulkImportIcon />
      </div>
      {!compact && <div className="flex-1 text-start text-[14px]">{label}</div>}
    </button>
  );
};
