'use client';

import React, { FC, KeyboardEvent, useCallback, useState } from 'react';
import Link from 'next/link';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  useAdminAction,
  useAdminCustomer,
} from '@gitroom/frontend/components/admin/admin.hooks';
import {
  ago,
  Card,
  day,
  describeAction,
  HealthBadge,
  Loading,
  money,
  Section,
  StatusBadge,
} from '@gitroom/frontend/components/admin/admin.ui';
import {
  ProfileEditor,
  StageSelect,
  TaskForm,
  TaskList,
} from '@gitroom/frontend/components/admin/admin.crm.component';
import {
  adminLimits,
  AdminTimelineEntry,
} from '@gitroom/nestjs-libraries/dtos/admin/admin.dto';

const timelineIcons: Record<AdminTimelineEntry['kind'], string> = {
  signup: '🎉',
  channel: '🔗',
  post: '📣',
  plan: '💳',
  note: '📝',
  task: '✅',
  admin: '🛠',
};

const TagsEditor: FC<{
  tags: string[];
  onChange: (tags: string[]) => void;
}> = ({ tags, onChange }) => {
  const [value, setValue] = useState('');
  const add = () => {
    const tag = value.trim().toLowerCase();
    setValue('');
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
  };
  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-[6px]">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-[4px] h-[26px] ps-[8px] pe-[4px] rounded-[6px] text-[12px] bg-forth/15 text-forth"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="w-[18px] h-[18px] rounded-[4px] hover:bg-forth/20"
          >
            ×
          </button>
        </span>
      ))}
      {tags.length < adminLimits.tags && (
        <input
          value={value}
          maxLength={adminLimits.tag}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={keyDown}
          onBlur={add}
          placeholder="+ add tag"
          className="h-[26px] w-[110px] bg-transparent border border-dashed border-newTableBorder rounded-[6px] px-[8px] text-[12px] outline-none focus:border-forth"
        />
      )}
    </div>
  );
};

export const AdminCustomerComponent: FC<{ id: string }> = ({ id }) => {
  const { data, error, mutate } = useAdminCustomer(id);
  const action = useAdminAction();
  const toaster = useToaster();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');

  const loginAs = useCallback(async () => {
    if (
      !(await deleteDialog(
        'The app opens in a new tab as the owner of this workspace. Everything you do there is done as them. Use "Stop" in the yellow bar when you are done.',
        'Open the app as them',
        'Log in as this customer',
        'Cancel'
      ))
    ) {
      return;
    }
    setBusy('login');
    const result = await action<{ url: string }>(
      `/admin/customers/${id}/login-as`,
      'POST'
    );
    setBusy('');
    if (result) {
      window.open(result.url || '/', '_blank');
      mutate();
    }
  }, [id]);

  const setFreePlan = useCallback(
    async (enabled: boolean) => {
      if (
        !(await deleteDialog(
          enabled
            ? 'This workspace gets the top plan (Agency Pro) for free, forever. Stripe never charges it.'
            : 'This workspace goes back to having no plan: it will need to choose a paid plan (no new free trial).',
          enabled ? 'Give the free plan' : 'Remove the free plan',
          enabled ? 'Free forever plan' : 'Remove the free plan',
          'Cancel',
          !enabled
        ))
      ) {
        return;
      }
      setBusy('plan');
      const result = await action(`/admin/customers/${id}/free-plan`, 'PUT', {
        enabled,
      });
      setBusy('');
      if (result) {
        toaster.show(
          enabled ? 'Free plan given' : 'Free plan removed',
          'success'
        );
        mutate();
      }
    },
    [id]
  );

  const saveTags = useCallback(
    async (tags: string[]) => {
      if (await action(`/admin/customers/${id}/tags`, 'PUT', { tags })) {
        mutate();
      }
    },
    [id]
  );

  const addNote = useCallback(async () => {
    if (!note.trim()) {
      return;
    }
    setBusy('note');
    const result = await action(`/admin/customers/${id}/notes`, 'POST', {
      text: note,
    });
    setBusy('');
    if (result) {
      setNote('');
      mutate();
    }
  }, [id, note]);

  const deleteNote = useCallback(
    async (noteId: string) => {
      if (!(await deleteDialog('Delete this note?', 'Delete'))) {
        return;
      }
      if (await action(`/admin/customers/${id}/notes/${noteId}`, 'DELETE')) {
        mutate();
      }
    },
    [id]
  );

  if (error && !data) {
    return (
      <div className="flex flex-col gap-[12px]">
        <Link href="/admin/customers" className="text-[13px] text-forth">
          ← Customers
        </Link>
        <div className="text-red-400">{error.message}</div>
      </div>
    );
  }
  if (!data) {
    return <Loading />;
  }

  const { customer } = data;
  const isOwnerPlan = customer.status === 'owner';
  const paysWithStripe =
    !!customer.subscription && customer.subscription.provider !== 'manual';

  return (
    <div className="flex flex-col gap-[24px]">
      <div className="flex flex-col gap-[12px]">
        <Link href="/admin/customers" className="text-[13px] text-forth">
          ← Customers
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-[12px]">
          <div className="flex flex-col gap-[8px]">
            <div className="flex flex-wrap items-center gap-[10px]">
              <div className="text-[22px] font-[600]">{customer.name}</div>
              <StatusBadge status={customer.status} />
            </div>
            <div className="text-[13px] opacity-70">
              {customer.owner
                ? `${customer.owner.name || 'No name'} · ${customer.owner.email}`
                : 'No owner'}
              {customer.accountType
                ? ` · ${customer.accountType.toLowerCase()}`
                : ''}
            </div>
            <div className="flex flex-wrap items-center gap-[12px] text-[13px]">
              <span className="flex items-center gap-[6px]">
                <span className="opacity-70">Stage</span>
                <StageSelect
                  organizationId={id}
                  stage={customer.stage}
                  stageSet={customer.stageSet}
                  onChanged={() => mutate()}
                />
              </span>
              <span className="flex items-center gap-[6px]">
                <span className="opacity-70">Health</span>
                <HealthBadge health={customer.health} details />
              </span>
            </div>
            {customer.health.reasons.length > 0 && (
              <div className="text-[12px] opacity-70">
                {customer.health.reasons.join(' · ')}
              </div>
            )}
            <TagsEditor tags={customer.tags} onChange={saveTags} />
          </div>
          <div className="flex flex-wrap gap-[8px]">
            {customer.owner?.email && (
              <a
                href={`mailto:${customer.owner.email}`}
                className="h-[40px] px-[16px] flex items-center rounded-[8px] border border-newTableBorder bg-newBgColorInner text-[14px] hover:border-forth"
              >
                Email
              </a>
            )}
            <Button
              onClick={loginAs}
              loading={busy === 'login'}
              className="!h-[40px]"
            >
              Log in as them
            </Button>
            {isOwnerPlan ? (
              <Button
                secondary
                onClick={() => setFreePlan(false)}
                loading={busy === 'plan'}
                className="!h-[40px]"
              >
                Remove free plan
              </Button>
            ) : (
              !paysWithStripe && (
                <Button
                  secondary
                  onClick={() => setFreePlan(true)}
                  loading={busy === 'plan'}
                  className="!h-[40px]"
                >
                  Give free plan
                </Button>
              )
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-[12px]">
        <Card
          label="$ / month"
          value={customer.monthlyRevenue ? money(customer.monthlyRevenue) : '-'}
        />
        <Card label="Channels" value={customer.channels} />
        <Card label="Members" value={customer.members} />
        <Card label="Posts this month" value={customer.postsThisMonth} />
        <Card label="Published, 30 days" value={data.activity.published30Days} />
        <Card label="Errors, 30 days" value={data.activity.errors30Days} />
        <Card label="Last active" value={<span className="text-[18px]">{ago(customer.lastActive)}</span>} />
        <Card label="Signed up" value={<span className="text-[18px]">{day(customer.createdAt)}</span>} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-[24px]">
        <Section title="Plan">
          <div className="border border-newTableBorder rounded-[10px] bg-newBgColorInner p-[14px] text-[14px] flex flex-col gap-[6px]">
            {customer.subscription ? (
              <>
                <div>
                  <b>{customer.subscription.tier.replace(/_/g, ' ')}</b>
                  {' · '}
                  {customer.subscription.period.toLowerCase()}
                  {customer.subscription.isLifetime ? ' · lifetime' : ''}
                </div>
                <div className="opacity-70">
                  {customer.subscription.provider === 'manual'
                    ? 'Given for free from HQ (Stripe never charges it)'
                    : `Paid through ${customer.subscription.provider}`}
                  {' · since '}
                  {day(customer.subscription.since)}
                </div>
                {customer.subscription.cancelAt && (
                  <div className="text-orange-400">
                    Cancels on {day(customer.subscription.cancelAt)}
                  </div>
                )}
              </>
            ) : (
              <div className="opacity-70">
                {customer.status === 'free'
                  ? 'On the Free plan'
                  : customer.status === 'trial'
                  ? 'On a trial'
                  : 'No plan yet'}
              </div>
            )}
            <div className="opacity-70">
              First post {day(data.activity.firstPost)} · last post{' '}
              {day(data.activity.lastPost)}
            </div>
          </div>
        </Section>

        <Section title="Notes">
          <div className="flex flex-col gap-[8px]">
            <textarea
              value={note}
              maxLength={adminLimits.note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Agency lead, called on 16 Nov, wants white label"
              rows={3}
              className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[10px] text-[14px] text-textColor outline-none focus:border-forth resize-y"
            />
            <div>
              <Button
                onClick={addNote}
                loading={busy === 'note'}
                disabled={!note.trim()}
                className="!h-[36px]"
              >
                Add note
              </Button>
            </div>
            {data.notes.map((item) => (
              <div
                key={item.id}
                className="border border-newTableBorder rounded-[8px] p-[10px] text-[14px] flex gap-[8px]"
              >
                <div className="flex-1 whitespace-pre-wrap break-words">
                  {item.text}
                  <div className="text-[12px] opacity-60 mt-[4px]">
                    {item.author} · {ago(item.createdAt)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => deleteNote(item.id)}
                  className="text-[12px] opacity-60 hover:opacity-100 self-start"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-[24px]">
        <Section title="Contact details">
          <ProfileEditor
            organizationId={id}
            profile={customer.profile}
            onSaved={() => mutate()}
          />
        </Section>

        <Section
          title={`Follow-ups (${data.tasks.filter((task) => !task.doneAt).length} open)`}
        >
          <div className="flex flex-col gap-[8px]">
            <TaskForm organizationId={id} onAdded={() => mutate()} />
            <TaskList
              tasks={data.tasks}
              onChanged={() => mutate()}
              empty="No follow-ups yet."
            />
          </div>
        </Section>
      </div>

      <Section title="Members">
        <div className="border border-newTableBorder rounded-[10px] overflow-x-auto">
          <table className="w-full text-[13px] min-w-[700px]">
            <thead>
              <tr className="bg-newBgColorInner text-[12px] uppercase opacity-70">
                <th className="text-start font-[500] px-[12px] py-[10px]">Name</th>
                <th className="text-start font-[500] px-[12px] py-[10px]">Email</th>
                <th className="text-start font-[500] px-[12px] py-[10px]">Role</th>
                <th className="text-start font-[500] px-[12px] py-[10px]">Sign-in</th>
                <th className="text-start font-[500] px-[12px] py-[10px]">Last online</th>
                <th className="text-start font-[500] px-[12px] py-[10px]">Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((member) => (
                <tr key={member.id} className="border-t border-newTableBorder">
                  <td className="px-[12px] py-[10px]">
                    {member.name || '-'}
                    {member.disabled && (
                      <span className="ms-[6px] text-[11px] opacity-60">(disabled)</span>
                    )}
                  </td>
                  <td className="px-[12px] py-[10px]">{member.email}</td>
                  <td className="px-[12px] py-[10px] capitalize">
                    {member.role.toLowerCase()}
                  </td>
                  <td className="px-[12px] py-[10px] capitalize">
                    {member.login.toLowerCase()}
                    {!member.activated && (
                      <span className="ms-[6px] text-[11px] text-orange-400">not activated</span>
                    )}
                  </td>
                  <td className="px-[12px] py-[10px]">{ago(member.lastOnline)}</td>
                  <td className="px-[12px] py-[10px]">{day(member.joined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={`Channels (${data.channels.length})`}>
        {data.channels.length === 0 ? (
          <div className="text-[14px] opacity-70">No channels connected yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[8px]">
            {data.channels.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center gap-[10px] border border-newTableBorder rounded-[10px] bg-newBgColorInner p-[10px]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/icons/platforms/${channel.provider}.png`}
                  alt={channel.provider}
                  width={28}
                  height={28}
                  className="rounded-[6px]"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-[600] truncate">{channel.name}</div>
                  <div className="text-[12px] opacity-70">
                    {channel.provider} · {day(channel.connected)}
                  </div>
                </div>
                {channel.needsReconnect ? (
                  <span className="text-[11px] text-orange-400">reconnect</span>
                ) : channel.disabled ? (
                  <span className="text-[11px] opacity-60">off</span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Timeline">
        <div className="border border-newTableBorder rounded-[10px] overflow-hidden">
          {data.timeline.map((entry, index) => (
            <div
              key={`${entry.at}-${index}`}
              className="flex gap-[10px] px-[12px] py-[10px] text-[13px] border-b border-newTableBorder last:border-b-0"
            >
              <span aria-hidden="true">{timelineIcons[entry.kind]}</span>
              <span className="flex-1 min-w-0 break-words">
                {entry.kind === 'admin'
                  ? describeAction(entry.text, entry.details)
                  : entry.text}
              </span>
              <span className="opacity-60 whitespace-nowrap" title={entry.at}>
                {day(entry.at)}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
};
