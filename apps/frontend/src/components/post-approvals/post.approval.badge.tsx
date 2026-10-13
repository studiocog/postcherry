'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { truncate } from 'lodash';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PostApprovalBadgeData } from '@gitroom/frontend/components/post-approvals/post.approval.hooks';

export const useApprovalStatusLabel = () => {
  const t = useT();
  return (status: PostApprovalBadgeData['status']) =>
    status === 'APPROVED'
      ? t('approval_status_approved', 'Approved')
      : status === 'CHANGES_REQUESTED'
      ? t('approval_status_changes_requested', 'Changes requested')
      : t('approval_status_pending', 'Waiting for client');
};

const statusColor = (status: PostApprovalBadgeData['status']) =>
  status === 'APPROVED'
    ? 'bg-green-500'
    : status === 'CHANGES_REQUESTED'
    ? 'bg-orange-500'
    : 'bg-[#6b7280]';

// The status of the latest approval request: a dot like the published / error
// markers of the calendar, or a pill with the label.
export const ApprovalStatusBadge: FC<{
  approval?: Pick<
    PostApprovalBadgeData,
    'status' | 'clientName' | 'decidedByName' | 'clientComment'
  >;
  variant: 'dot' | 'pill';
  className?: string;
}> = ({ approval, variant, className }) => {
  const label = useApprovalStatusLabel();

  if (!approval) {
    return null;
  }

  // react-tooltip renders the content as text
  const who = approval.decidedByName || approval.clientName;
  const tooltip = [
    label(approval.status) + (who ? ` - ${who}` : ''),
    approval.status !== 'PENDING' && approval.clientComment
      ? `"${truncate(approval.clientComment, { length: 160 })}"`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (variant === 'pill') {
    return (
      <div
        className={clsx(
          'inline-flex items-center h-[24px] px-[8px] rounded-full text-white text-[12px] font-[500] whitespace-nowrap cursor-default',
          statusColor(approval.status),
          className
        )}
        data-tooltip-id="tooltip"
        data-tooltip-class-name="!max-w-[320px] whitespace-pre-wrap break-words"
        data-tooltip-content={tooltip}
      >
        {label(approval.status)}
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'w-[18px] h-[18px] rounded-full flex items-center justify-center text-white text-[11px] font-bold cursor-default',
        statusColor(approval.status),
        className
      )}
      data-tooltip-id="tooltip"
      data-tooltip-class-name="!max-w-[320px] whitespace-pre-wrap break-words"
      data-tooltip-content={tooltip}
    >
      {approval.status === 'APPROVED'
        ? '✓'
        : approval.status === 'CHANGES_REQUESTED'
        ? '!'
        : '…'}
    </div>
  );
};
