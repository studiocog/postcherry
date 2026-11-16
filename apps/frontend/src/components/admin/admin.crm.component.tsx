'use client';

import React, { FC, FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { Button } from '@gitroom/react/form/button';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { useAdminAction } from '@gitroom/frontend/components/admin/admin.hooks';
import { stageLabels } from '@gitroom/frontend/components/admin/admin.ui';
import {
  adminLimits,
  AdminProfile,
  AdminStage,
  adminStages,
  AdminTaskRow,
} from '@gitroom/nestjs-libraries/dtos/admin/admin.dto';

const fieldClass =
  'h-[38px] w-full bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor outline-none focus:border-forth';

// The pipeline stage of a workspace: automatic (from the plan and posting)
// or set by hand
export const StageSelect: FC<{
  organizationId: string;
  stage: AdminStage;
  stageSet: boolean;
  onChanged: () => void;
}> = ({ organizationId, stage, stageSet, onChanged }) => {
  const action = useAdminAction();
  const change = useCallback(
    async (value: string) => {
      if (
        await action(`/admin/customers/${organizationId}/stage`, 'PUT', {
          stage: value,
        })
      ) {
        onChanged();
      }
    },
    [organizationId, onChanged]
  );
  return (
    <select
      value={stageSet ? stage : 'auto'}
      onChange={(e) => change(e.target.value)}
      className="h-[30px] bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[8px] text-[13px] text-textColor outline-none"
    >
      <option value="auto">Automatic ({stageLabels[stage]})</option>
      {adminStages.map((value) => (
        <option key={value} value={value}>
          {stageLabels[value]}
        </option>
      ))}
    </select>
  );
};

const profileFields: { key: keyof AdminProfile; label: string; placeholder: string }[] = [
  { key: 'company', label: 'Company', placeholder: 'Sunny Marketing Ltd' },
  { key: 'phone', label: 'Phone', placeholder: '+1 555 0100' },
  { key: 'website', label: 'Website', placeholder: 'sunnymarketing.com' },
  { key: 'country', label: 'Country', placeholder: 'United States' },
  { key: 'source', label: 'Found us via', placeholder: 'Google, Product Hunt, a friend…' },
];

// Contact details the admin keeps about a workspace
export const ProfileEditor: FC<{
  organizationId: string;
  profile: AdminProfile;
  onSaved: () => void;
}> = ({ organizationId, profile, onSaved }) => {
  const action = useAdminAction();
  const [values, setValues] = useState(profile);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setValues(profile);
  }, [profile]);
  const changed = profileFields.some(
    ({ key }) => (values[key] || '') !== (profile[key] || '')
  );

  const save = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setSaving(true);
      const result = await action(
        `/admin/customers/${organizationId}/profile`,
        'PUT',
        values
      );
      setSaving(false);
      if (result) {
        onSaved();
      }
    },
    [organizationId, values, onSaved]
  );

  return (
    <form
      onSubmit={save}
      className="border border-newTableBorder rounded-[10px] bg-newBgColorInner p-[14px] grid grid-cols-1 md:grid-cols-2 gap-[10px]"
    >
      {profileFields.map(({ key, label, placeholder }) => (
        <label key={key} className="flex flex-col gap-[4px] text-[12px]">
          <span className="opacity-70">{label}</span>
          <input
            value={values[key] || ''}
            maxLength={adminLimits.profileField}
            placeholder={placeholder}
            onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            className={fieldClass}
          />
        </label>
      ))}
      <div className="flex items-end">
        <Button
          type="submit"
          loading={saving}
          disabled={!changed}
          className="!h-[38px]"
        >
          Save details
        </Button>
      </div>
    </form>
  );
};

const dueLabel = (dueAt: string | null) => {
  if (!dueAt) {
    return { text: 'No date', className: 'opacity-60' };
  }
  const due = dayjs(dueAt);
  const today = dayjs().startOf('day');
  if (due.isBefore(today)) {
    return { text: `Overdue · ${due.format('D MMM')}`, className: 'text-red-500' };
  }
  if (due.isBefore(today.add(1, 'day'))) {
    return { text: 'Today', className: 'text-amber-600' };
  }
  if (due.isBefore(today.add(2, 'day'))) {
    return { text: 'Tomorrow', className: 'opacity-80' };
  }
  return { text: due.format('ddd D MMM'), className: 'opacity-80' };
};

// A list of follow-ups: tick to finish, delete; shows the workspace when the
// list mixes workspaces (the Tasks page)
export const TaskList: FC<{
  tasks: AdminTaskRow[];
  showWorkspace?: boolean;
  onChanged: () => void;
  empty: string;
}> = ({ tasks, showWorkspace, onChanged, empty }) => {
  const action = useAdminAction();
  const toggle = useCallback(
    async (task: AdminTaskRow) => {
      if (await action(`/admin/tasks/${task.id}`, 'PUT', { done: !task.doneAt })) {
        onChanged();
      }
    },
    [onChanged]
  );
  const remove = useCallback(
    async (task: AdminTaskRow) => {
      if (!(await deleteDialog(`Delete the task "${task.title}"?`, 'Delete'))) {
        return;
      }
      if (await action(`/admin/tasks/${task.id}`, 'DELETE')) {
        onChanged();
      }
    },
    [onChanged]
  );

  if (!tasks.length) {
    return <div className="text-[14px] opacity-70">{empty}</div>;
  }
  return (
    <div className="border border-newTableBorder rounded-[10px] overflow-hidden">
      {tasks.map((task) => {
        const due = dueLabel(task.dueAt);
        return (
          <div
            key={task.id}
            className="flex items-start gap-[10px] px-[12px] py-[10px] text-[14px] border-b border-newTableBorder last:border-b-0 bg-newBgColorInner"
          >
            <input
              type="checkbox"
              checked={!!task.doneAt}
              onChange={() => toggle(task)}
              aria-label={task.doneAt ? 'Mark as not done' : 'Mark as done'}
              className="mt-[3px] w-[16px] h-[16px] accent-[#D21F3C] cursor-pointer"
            />
            <div className="flex-1 min-w-0">
              <div className={clsx('break-words', task.doneAt && 'line-through opacity-60')}>
                {task.title}
              </div>
              <div className="text-[12px] flex flex-wrap gap-x-[8px]">
                {task.doneAt ? (
                  <span className="opacity-60">
                    Done {dayjs(task.doneAt).format('D MMM')}
                  </span>
                ) : (
                  <span className={due.className}>{due.text}</span>
                )}
                {showWorkspace && (
                  <Link
                    href={`/admin/customers/${task.organization.id}`}
                    className="text-forth hover:underline"
                  >
                    {task.organization.name}
                  </Link>
                )}
                <span className="opacity-50">{task.author}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => remove(task)}
              className="text-[12px] opacity-50 hover:opacity-100"
            >
              Delete
            </button>
          </div>
        );
      })}
    </div>
  );
};

// A new follow-up for a workspace, with an optional due date
export const TaskForm: FC<{ organizationId: string; onAdded: () => void }> = ({
  organizationId,
  onAdded,
}) => {
  const action = useAdminAction();
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [saving, setSaving] = useState(false);
  const add = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!title.trim()) {
        return;
      }
      setSaving(true);
      const result = await action(
        `/admin/customers/${organizationId}/tasks`,
        'POST',
        {
          title,
          ...(dueAt ? { dueAt: dayjs(dueAt).hour(9).toISOString() } : {}),
        }
      );
      setSaving(false);
      if (result) {
        setTitle('');
        setDueAt('');
        onAdded();
      }
    },
    [organizationId, title, dueAt, onAdded]
  );
  return (
    <form onSubmit={add} className="flex flex-wrap gap-[8px]">
      <input
        value={title}
        maxLength={adminLimits.task}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Call about the agency plan"
        className={clsx(fieldClass, 'flex-1 min-w-[200px] !w-auto')}
      />
      <input
        type="date"
        value={dueAt}
        onChange={(e) => setDueAt(e.target.value)}
        aria-label="Due date"
        className={clsx(fieldClass, '!w-[150px]')}
      />
      <Button type="submit" loading={saving} disabled={!title.trim()} className="!h-[38px]">
        Add task
      </Button>
    </form>
  );
};
