'use client';

import { FC, useCallback } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { BottomSheetRow } from '@gitroom/frontend/components/ui/bottom.sheet.component';
import { usePostApprovals } from '@gitroom/frontend/components/post-approvals/post.approval.hooks';
import {
  ApprovalStatusBadge,
  useApprovalStatusLabel,
} from '@gitroom/frontend/components/post-approvals/post.approval.badge';
import { RequestApprovalModal } from '@gitroom/frontend/components/post-approvals/request.approval.modal';

const ApprovalIcon: FC<{ size?: number }> = ({ size = 20 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 11.5v.5a9 9 0 1 1-5.34-8.22" />
    <path d="M21 4 12 13.01l-3-3" />
  </svg>
);

const useOpenRequestApproval = (postId: string) => {
  const t = useT();
  const modals = useModals();
  return useCallback(() => {
    modals.openModal({
      title: t('client_approval', 'Client approval'),
      withCloseButton: true,
      children: <RequestApprovalModal postId={postId} />,
    });
  }, [postId, modals, t]);
};

// the editor footer action, with the status of the latest link
export const RequestApprovalButton: FC<{ postId: string }> = ({ postId }) => {
  const t = useT();
  const label = useApprovalStatusLabel();
  const open = useOpenRequestApproval(postId);
  const { data } = usePostApprovals(postId);
  const latest = data?.find(
    (approval) =>
      !approval.revokedAt && (approval.active || approval.status !== 'PENDING')
  );

  // the footer is narrow on smaller screens, the icon and the status stay;
  // the name keeps the status for screen readers when the text is hidden
  return (
    <button
      type="button"
      onClick={open}
      aria-label={
        latest
          ? t('request_approval_with_status', 'Request approval, {{status}}', {
              status: label(latest),
              interpolation: { escapeValue: false },
            })
          : t('request_approval', 'Request approval')
      }
      className="cursor-pointer flex gap-[8px] items-center text-[15px] font-[600]"
    >
      <div
        data-tooltip-id="tooltip"
        data-tooltip-content={t('request_approval', 'Request approval')}
      >
        <ApprovalIcon />
      </div>
      <div className="tablet:hidden">
        {t('request_approval', 'Request approval')}
      </div>
      <ApprovalStatusBadge variant="pill" approval={latest} />
    </button>
  );
};

// the same action in the settings sheet of the mobile editor
export const RequestApprovalSheetRow: FC<{
  postId: string;
  onOpen?: () => void;
}> = ({ postId, onOpen }) => {
  const t = useT();
  const open = useOpenRequestApproval(postId);

  return (
    <BottomSheetRow
      icon={<ApprovalIcon size={24} />}
      label={t('request_approval', 'Request approval')}
      onClick={() => {
        onOpen?.();
        open();
      }}
    />
  );
};
