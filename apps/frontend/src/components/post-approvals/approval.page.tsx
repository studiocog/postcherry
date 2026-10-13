'use client';

import { FC, ReactNode, useCallback, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import clsx from 'clsx';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { minBy, uniq } from 'lodash';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Input } from '@gitroom/react/form/input';
import { Textarea } from '@gitroom/react/form/textarea';
import { sanitizePostContent } from '@gitroom/helpers/utils/sanitize.post.content';
import { PreviewLogo } from '@gitroom/frontend/components/preview/preview.logo';
import { PreviewPostCard } from '@gitroom/frontend/components/preview/preview.post.card';
import { RenderPreviewDateClient } from '@gitroom/frontend/components/preview/render.preview.date.client';
import {
  ClosedApprovalState,
  PublicApproval,
  useDecidePostApproval,
  usePublicApproval,
} from '@gitroom/frontend/components/post-approvals/post.approval.hooks';
import { ApprovalStatusBadge } from '@gitroom/frontend/components/post-approvals/post.approval.badge';

dayjs.extend(utc);

type Decision = 'APPROVED' | 'CHANGES_REQUESTED';

const formatDate = (date: string) =>
  dayjs.utc(date).local().format('MMMM D, YYYY h:mm A');

// why the client can no longer decide, for the page and for a decision sent
// after the link was closed
const useClosedApprovalMessage = () => {
  const t = useT();
  return useCallback(
    (state: ClosedApprovalState) =>
      state === 'locked'
        ? t(
            'approval_locked_published',
            'This post is already published, the decision can no longer be changed.'
          )
        : state === 'expired'
        ? t('approval_link_expired', 'This approval link has expired')
        : state === 'revoked'
        ? t('approval_link_revoked_message', 'This approval link was revoked')
        : t('approval_post_unavailable', 'This post is no longer available'),
    [t]
  );
};

const CenteredMessage: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="text-newTextColor fixed start-0 top-0 w-full h-full flex justify-center items-center text-[20px] text-center px-[16px]">
    {children}
  </div>
);

const Spinner = () => (
  <div className="animate-spin h-[20px] w-[20px] border-4 border-textColor border-t-transparent rounded-full" />
);

const DecisionButton: FC<{
  primary?: boolean;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
  children: ReactNode;
}> = ({ primary, disabled, loading, onClick, children }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={clsx(
      'relative flex-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 px-[16px] h-[44px] justify-center items-center flex rounded-[8px] text-[15px] font-[600]',
      primary ? 'bg-btnPrimary text-white' : 'bg-btnSimple'
    )}
  >
    {loading && (
      <div className="absolute left-[50%] top-[50%] -translate-y-[50%] -translate-x-[50%]">
        <Spinner />
      </div>
    )}
    <div className={clsx(loading && 'invisible')}>{children}</div>
  </button>
);

const ApprovalDecisionPanel: FC<{
  token: string;
  approval: PublicApproval;
  onDecided: (approval: PublicApproval) => void;
  reload: () => void;
}> = ({ token, approval, onDecided, reload }) => {
  const t = useT();
  const toaster = useToaster();
  const closedMessage = useClosedApprovalMessage();
  const decide = useDecidePostApproval(token);
  const [loading, setLoading] = useState<Decision | null>(null);
  const locked = approval.state === 'locked';
  const form = useForm({
    defaultValues: {
      name: approval.decidedByName || approval.clientName || '',
      comment: '',
    },
  });

  const submit = useCallback(
    (decision: Decision) =>
      async (values: { name: string; comment: string }) => {
        setLoading(decision);
        const { approval: updated, closedState } = await decide({
          decision,
          ...(values.name.trim() ? { name: values.name.trim() } : {}),
          ...(values.comment.trim() ? { comment: values.comment.trim() } : {}),
        });
        setLoading(null);

        if (!updated) {
          toaster.show(
            closedState
              ? closedMessage(closedState)
              : t(
                  'approval_decision_failed',
                  'Could not send your decision, please try again later'
                ),
            'warning'
          );
          reload();
          return;
        }

        form.reset({ name: values.name, comment: '' });
        onDecided(updated);
        toaster.show(
          t(
            'approval_decision_saved',
            'Thank you, your decision was sent to the team'
          ),
          'success'
        );
      },
    [decide, onDecided, reload, toaster, t, closedMessage]
  );

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-col gap-[4px]">
        <h1 className="text-[18px] font-[600]">
          {approval.clientName
            ? t('approval_greeting', '{{name}}, please review this post', {
                name: approval.clientName,
                interpolation: { escapeValue: false },
              })
            : t('approval_title', 'Please review this post')}
        </h1>
        <div className="text-[14px] text-textItemBlur">
          {t(
            'approval_intro',
            'Approve it or request changes, the team gets your decision right away.'
          )}
        </div>
      </div>

      {!!approval.status && approval.status !== 'PENDING' && (
        <div className="flex flex-col gap-[8px] rounded-[8px] border border-newTableBorder p-[12px]">
          <div className="flex items-center gap-[8px] flex-wrap">
            <div className="text-[14px]">
              {t('approval_current_decision', 'Current decision:')}
            </div>
            <ApprovalStatusBadge
              variant="pill"
              approval={{
                status: approval.status,
                clientName: approval.clientName || null,
                decidedByName: approval.decidedByName || null,
                clientComment: approval.clientComment || null,
              }}
            />
          </div>
          {!!approval.decidedAt && (
            <div className="text-[12px] text-textItemBlur">
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
          {!!approval.editedAfterDecision && !locked && (
            <div className="text-[14px] rounded-[8px] bg-btnSimple p-[12px]">
              {t(
                'approval_edited_after_your_decision',
                'The post was changed after this decision, please review it again.'
              )}
            </div>
          )}
        </div>
      )}

      {locked && (
        <div className="text-[14px] rounded-[8px] bg-btnSimple p-[12px]">
          {closedMessage('locked')}
        </div>
      )}

      <FormProvider {...form}>
        <form
          className="flex flex-col gap-[4px]"
          onSubmit={(e) => e.preventDefault()}
        >
          <Input
            label={t('approval_your_name', 'Your name (optional)')}
            placeholder={t('preview_comment_your_name', 'Your name')}
            name="name"
            maxLength={80}
            disabled={locked}
          />
          <Textarea
            label={t('approval_comment', 'Comment (optional)')}
            name="comment"
            className="!min-h-[90px] resize-none"
            placeholder={t(
              'approval_comment_placeholder',
              'What should the team know or change?'
            )}
            maxLength={2000}
            disabled={locked}
          />
          <div className="flex gap-[8px] -mt-[8px]">
            <DecisionButton
              primary={true}
              disabled={locked || !!loading}
              loading={loading === 'APPROVED'}
              onClick={form.handleSubmit(submit('APPROVED'))}
            >
              {t('approve', 'Approve')}
            </DecisionButton>
            <DecisionButton
              disabled={locked || !!loading}
              loading={loading === 'CHANGES_REQUESTED'}
              onClick={form.handleSubmit(submit('CHANGES_REQUESTED'))}
            >
              {t('approval_request_changes', 'Request changes')}
            </DecisionButton>
          </div>
        </form>
      </FormProvider>

      {!locked && !!approval.expiresAt && (
        <div className="text-[12px] text-textItemBlur">
          {t(
            'approval_change_until',
            'You can change your decision until the post is published. This link is valid until {{date}}.',
            { date: formatDate(approval.expiresAt) }
          )}
        </div>
      )}
    </div>
  );
};

// The page a client opens from an approval link, without logging in. It loads
// in the browser so the rate limit counts each visitor on their own address.
export const ApprovalPage: FC<{ token: string }> = ({ token }) => {
  const t = useT();
  const closedMessage = useClosedApprovalMessage();
  const { data, error, isLoading, mutate } = usePublicApproval(token);

  const onDecided = useCallback(
    (approval: PublicApproval) => {
      mutate(approval, { revalidate: false });
    },
    [mutate]
  );
  const reload = useCallback(() => {
    mutate();
  }, [mutate]);

  if (isLoading) {
    return (
      <CenteredMessage>
        <Spinner />
      </CenteredMessage>
    );
  }

  if (error || !data) {
    return (
      <CenteredMessage>
        {t(
          'approval_load_failed',
          'Could not load this page, please try again later'
        )}
      </CenteredMessage>
    );
  }

  if (data.state === 'not_found') {
    return (
      <CenteredMessage>
        {t('approval_link_not_found', 'This approval link was not found')}
      </CenteredMessage>
    );
  }

  // expired, revoked, or every channel of the post was deleted
  if (data.state !== 'open' && data.state !== 'locked') {
    return <CenteredMessage>{closedMessage(data.state)}</CenteredMessage>;
  }

  const channels = data.channels || [];
  const firstDate = minBy(
    channels.map((channel) => channel.publishDate),
    (date) => dayjs.utc(date).valueOf()
  );
  const sameDate =
    uniq(channels.map((channel) => channel.publishDate)).length < 2;

  return (
    <div className="mx-auto w-full max-w-[1346px] p-[12px] flex flex-col gap-[8px] text-newTextColor">
      <div className="flex bg-newBgColorInner rounded-[12px] min-h-[80px] px-[20px] py-[12px] items-center gap-[20px] flex-wrap">
        <PreviewLogo />
        <div className="flex-1" />
        {!!firstDate && (
          <div className="flex items-center gap-[20px] text-[14px] text-textItemBlur">
            <div>
              {t('publication_date', 'Publication Date:')}{' '}
              <span className="text-newTextColor">
                <RenderPreviewDateClient date={firstDate} />
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-[8px]">
        <div className="flex-1 flex flex-col gap-[8px]">
          {channels.map((channel, channelIndex) =>
            channel.values.map((value, index) => (
              <PreviewPostCard
                key={`${channelIndex}-${index}`}
                integration={channel.integration}
                media={value.media}
                badge={
                  index === 0 &&
                  (channel.published ? (
                    <span className="text-[12px] rounded-full px-[8px] h-[22px] inline-flex items-center bg-green-500 text-white">
                      {t('approval_channel_published', 'Published')}
                    </span>
                  ) : (
                    !sameDate && (
                      <span className="text-[12px] text-textItemBlur">
                        <RenderPreviewDateClient date={channel.publishDate} />
                      </span>
                    )
                  ))
                }
              >
                <div
                  className="text-[14px] whitespace-pre-wrap leading-[22px]"
                  dangerouslySetInnerHTML={{
                    __html: sanitizePostContent(value.content),
                  }}
                />
              </PreviewPostCard>
            ))
          )}
        </div>
        <div className="w-full lg:w-[380px] lg:flex-shrink-0">
          <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[20px] lg:sticky lg:top-[12px]">
            <ApprovalDecisionPanel
              token={token}
              approval={data}
              onDecided={onDecided}
              reload={reload}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
