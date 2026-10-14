'use client';

import { FC, useCallback, useId, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import clsx from 'clsx';
import copy from 'copy-to-clipboard';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Input } from '@gitroom/react/form/input';
import { Select } from '@gitroom/react/form/select';
import { Button } from '@gitroom/react/form/button';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import {
  PostApprovalRequest,
  useCreatePostApproval,
  usePostApprovals,
  useRevokePostApproval,
} from '@gitroom/frontend/components/post-approvals/post.approval.hooks';
import { ApprovalStatusBadge } from '@gitroom/frontend/components/post-approvals/post.approval.badge';

dayjs.extend(utc);

const EXPIRY_DAYS = [7, 14, 30, 60, 90];

const formatDate = (date: string) =>
  dayjs.utc(date).local().format('MMM D, YYYY HH:mm');

const useCopyLink = () => {
  const t = useT();
  const toaster = useToaster();
  return useCallback(
    (url: string) => {
      copy(url);
      toaster.show(
        t('link_copied_to_clipboard', 'Link copied to clipboard'),
        'success'
      );
    },
    [t, toaster]
  );
};

const ApprovalRequestRow: FC<{
  postId: string;
  approval: PostApprovalRequest;
}> = ({ postId, approval }) => {
  const t = useT();
  const toaster = useToaster();
  const copyLink = useCopyLink();
  const revoke = useRevokePostApproval();

  const revokeLink = useCallback(async () => {
    if (
      !(await deleteDialog(
        t(
          'approval_revoke_question',
          'Your client will no longer be able to open this link. Do you want to revoke it?'
        ),
        t('approval_revoke_confirm', 'Yes, revoke it')
      ))
    ) {
      return;
    }

    if (!(await revoke(postId, approval.id))) {
      // the link still works, the team has to know
      toaster.show(
        t('approval_revoke_failed', 'Could not revoke the link'),
        'warning'
      );
      return;
    }

    toaster.show(
      t('approval_link_revoked', 'Approval link revoked'),
      'success'
    );
  }, [postId, approval.id, revoke, toaster, t]);

  return (
    <div
      className={clsx(
        'flex flex-col gap-[6px] rounded-[8px] border border-newTableBorder p-[12px]',
        !approval.active && 'opacity-60'
      )}
    >
      <div className="flex items-center gap-[8px] flex-wrap">
        <ApprovalStatusBadge variant="pill" approval={approval} />
        {!!approval.clientName && (
          <div className="text-[14px] font-[600] break-all">
            {approval.clientName}
          </div>
        )}
        <div className="flex-1" />
        {approval.revokedAt ? (
          <div className="text-[12px] text-textItemBlur">
            {t('approval_revoked', 'Revoked')}
          </div>
        ) : !approval.active ? (
          <div className="text-[12px] text-textItemBlur">
            {t('approval_expired', 'Expired')}
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => copyLink(approval.url)}
              className="text-[13px] font-[600] hover:underline"
            >
              {t('copy_link', 'Copy Link')}
            </button>
            <button
              type="button"
              onClick={revokeLink}
              className="text-[13px] font-[600] text-[#FF3F3F] hover:underline"
            >
              {t('approval_revoke', 'Revoke')}
            </button>
          </>
        )}
      </div>
      {!!approval.decidedAt && (
        <div className="text-[13px]">
          {approval.decidedByName
            ? t('approval_decided_by', '{{name}} decided on {{date}}', {
                name: approval.decidedByName,
                date: formatDate(approval.decidedAt),
                interpolation: { escapeValue: false },
              })
            : t('approval_decided_on', 'Decided on {{date}}', {
                date: formatDate(approval.decidedAt),
              })}
        </div>
      )}
      {!!approval.clientComment && (
        <div className="text-[14px] whitespace-pre-wrap break-words border-s-[3px] border-btnPrimary ps-[8px]">
          {approval.clientComment}
        </div>
      )}
      <div className="text-[12px] text-textItemBlur">
        {approval.requestedBy
          ? t('approval_created_by', 'Created on {{date}} by {{name}}', {
              date: formatDate(approval.createdAt),
              name: approval.requestedBy,
              interpolation: { escapeValue: false },
            })
          : t('approval_created_on', 'Created on {{date}}', {
              date: formatDate(approval.createdAt),
            })}
        {!approval.revokedAt &&
          ` · ${t('approval_valid_until', 'Valid until {{date}}', {
            date: formatDate(approval.expiresAt),
          })}`}
      </div>
    </div>
  );
};

// `published`: the post already went out on one of its channels, the client
// could not decide on a new link
export const RequestApprovalModal: FC<{
  postId: string;
  published: boolean;
}> = ({ postId, published }) => {
  const t = useT();
  const toaster = useToaster();
  const copyLink = useCopyLink();
  const { data, error, isLoading } = usePostApprovals(postId);
  const createApproval = useCreatePostApproval();
  const [loading, setLoading] = useState(false);
  const [createdUrl, setCreatedUrl] = useState('');
  // names the field of the new link for screen readers
  const linkLabelId = useId();
  const form = useForm({
    defaultValues: {
      clientName: '',
      expiresInDays: '30',
    },
  });

  const submit = useCallback(
    async (values: { clientName: string; expiresInDays: string }) => {
      setLoading(true);
      const { created, published: publishedSince } = await createApproval(
        postId,
        {
          ...(values.clientName.trim()
            ? { clientName: values.clientName.trim() }
            : {}),
          expiresInDays: +values.expiresInDays,
        }
      );
      setLoading(false);

      if (!created) {
        toaster.show(
          publishedSince
            ? t(
                'approval_post_published',
                'This post is already published, your client can no longer approve it or request changes.'
              )
            : t('approval_create_failed', 'Could not create the approval link'),
          'warning'
        );
        return;
      }

      setCreatedUrl(created.url);
      form.reset({ clientName: '', expiresInDays: values.expiresInDays });
    },
    [postId, createApproval, toaster, t]
  );

  return (
    <div className="flex flex-col gap-[24px] w-[536px] max-w-full">
      <div className="text-[14px] text-textItemBlur">
        {t(
          'approval_saved_version_hint',
          'Your client sees the last saved version of this post without logging in, and can approve it or request changes.'
        )}
      </div>
      {published ? (
        <div className="text-[14px] rounded-[8px] bg-btnSimple p-[12px]">
          {t(
            'approval_post_published',
            'This post is already published, your client can no longer approve it or request changes.'
          )}
        </div>
      ) : (
        <FormProvider {...form}>
          <form
            onSubmit={form.handleSubmit(submit)}
            className="flex flex-col gap-[4px]"
          >
            <div className="flex gap-[12px] mobile:flex-col mobile:gap-0">
              <div className="flex-1">
                <Input
                  label={t('approval_client_name', 'Client name (optional)')}
                  placeholder={t(
                    'approval_client_name_placeholder',
                    'Who is the link for?'
                  )}
                  name="clientName"
                  maxLength={80}
                />
              </div>
              <div className="w-[160px] mobile:w-full">
                <Select
                  label={t('approval_link_valid_for', 'Link valid for')}
                  name="expiresInDays"
                >
                  {EXPIRY_DAYS.map((days) => (
                    <option key={days} value={String(days)}>
                      {t('approval_days', '{{days}} days', { days })}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <Button type="submit" loading={loading} className="rounded-[8px]">
              {t('create_approval_link', 'Create approval link')}
            </Button>
          </form>
        </FormProvider>
      )}
      {!!createdUrl && (
        <div className="flex flex-col gap-[8px]">
          <div id={linkLabelId} className="text-[14px] font-[600]">
            {t('approval_send_link', 'Send this link to your client')}
          </div>
          <div className="flex items-center gap-[8px]">
            <input
              readOnly={true}
              aria-labelledby={linkLabelId}
              value={createdUrl}
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-0 h-[42px] px-[16px] bg-newBgColorInner border border-newTableBorder rounded-[8px] text-[14px] text-textColor outline-none"
            />
            <Button
              className="rounded-[8px]"
              onClick={() => copyLink(createdUrl)}
            >
              {t('copy', 'Copy')}
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-[12px]">
        <div className="text-[16px] font-[600]">
          {t('approval_requests', 'Approval links')}
        </div>
        {isLoading ? (
          <div className="flex justify-center py-[12px]">
            <div className="animate-spin h-[20px] w-[20px] border-4 border-textColor border-t-transparent rounded-full" />
          </div>
        ) : !data && error ? (
          <div className="text-[14px] text-textItemBlur">
            {t(
              'approval_requests_load_failed',
              'Could not load the approval links, please try again later'
            )}
          </div>
        ) : !data?.length ? (
          <div className="text-[14px] text-textItemBlur">
            {t('approval_no_requests', 'No approval links yet')}
          </div>
        ) : (
          data.map((approval) => (
            <ApprovalRequestRow
              key={approval.id}
              postId={postId}
              approval={approval}
            />
          ))
        )}
      </div>
    </div>
  );
};
