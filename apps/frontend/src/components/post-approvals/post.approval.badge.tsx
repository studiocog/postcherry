'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { truncate } from 'lodash';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PostApprovalBadgeData } from '@gitroom/frontend/components/post-approvals/post.approval.hooks';

type BadgeApproval = Pick<
  PostApprovalBadgeData,
  | 'status'
  | 'clientName'
  | 'decidedByName'
  | 'clientComment'
  | 'editedAfterDecision'
>;

// a decision on a version the team changed since no longer counts as one
const isOutdated = (approval: BadgeApproval) =>
  approval.status !== 'PENDING' && !!approval.editedAfterDecision;

export const useApprovalStatusLabel = () => {
  const t = useT();
  return (approval: BadgeApproval) =>
    approval.status === 'APPROVED'
      ? isOutdated(approval)
        ? t('approval_status_approved_edited', 'Edited after approval')
        : t('approval_status_approved', 'Approved')
      : approval.status === 'CHANGES_REQUESTED'
      ? isOutdated(approval)
        ? t(
            'approval_status_changes_requested_edited',
            'Edited after feedback'
          )
        : t('approval_status_changes_requested', 'Changes requested')
      : t('approval_status_pending', 'Waiting for client');
};

// an outdated decision is grey like a request still waiting for the client
const statusColor = (approval: BadgeApproval) =>
  approval.status === 'PENDING' || isOutdated(approval)
    ? 'bg-[#6b7280]'
    : approval.status === 'APPROVED'
    ? 'bg-green-500'
    : 'bg-orange-500';

// The status of the latest approval request: a dot like the published / error
// markers of the calendar, or a pill with the label.
export const ApprovalStatusBadge: FC<{
  approval?: BadgeApproval;
  variant: 'dot' | 'pill';
  className?: string;
}> = ({ approval, variant, className }) => {
  const t = useT();
  const label = useApprovalStatusLabel();

  if (!approval) {
    return null;
  }

  // react-tooltip renders the content as text
  const who = approval.decidedByName || approval.clientName;
  const tooltip = [
    label(approval) + (who ? ` - ${who}` : ''),
    isOutdated(approval)
      ? t(
          'approval_edited_hint',
          'Your client has not seen the latest version yet'
        )
      : '',
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
          statusColor(approval),
          className
        )}
        data-tooltip-id="tooltip"
        data-tooltip-class-name="!max-w-[320px] whitespace-pre-wrap break-words"
        data-tooltip-content={tooltip}
      >
        {label(approval)}
      </div>
    );
  }

  // the glyph means nothing on its own, screen readers get the label
  return (
    <div
      role="img"
      aria-label={label(approval)}
      className={clsx(
        'w-[18px] h-[18px] rounded-full flex items-center justify-center text-white text-[11px] font-bold cursor-default',
        statusColor(approval),
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
