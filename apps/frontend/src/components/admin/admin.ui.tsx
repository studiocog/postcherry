'use client';

import React, { FC, ReactNode } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  AdminCustomerRow,
  AdminHealth,
  AdminPlanStatus,
  AdminStage,
} from '@gitroom/nestjs-libraries/dtos/admin/admin.dto';

dayjs.extend(relativeTime);

export const statusLabels: Record<AdminPlanStatus, string> = {
  paying: 'Paying',
  cancelling: 'Cancelling',
  trial: 'Trial',
  owner: 'Free forever',
  free: 'Free plan',
  none: 'No plan',
};

const statusColors: Record<AdminPlanStatus, string> = {
  paying: 'bg-green-600/20 text-green-500',
  cancelling: 'bg-orange-500/20 text-orange-400',
  trial: 'bg-blue-500/20 text-blue-400',
  owner: 'bg-purple-500/20 text-purple-400',
  free: 'bg-gray-500/20 text-gray-400',
  none: 'bg-gray-500/10 text-gray-500',
};

export const stageLabels: Record<AdminStage, string> = {
  lead: 'Lead',
  trial: 'Trial',
  onboarding: 'Getting started',
  active: 'Active',
  at_risk: 'At risk',
  churned: 'Churned',
};

const stageColors: Record<AdminStage, string> = {
  lead: 'bg-sky-500/15 text-sky-500',
  trial: 'bg-blue-500/15 text-blue-500',
  onboarding: 'bg-amber-500/15 text-amber-600',
  active: 'bg-green-600/15 text-green-600',
  at_risk: 'bg-orange-500/15 text-orange-500',
  churned: 'bg-gray-500/15 text-gray-500',
};

export const StageBadge: FC<{ stage: AdminStage; set?: boolean }> = ({
  stage,
  set = true,
}) => (
  <span
    title={set ? 'Set by hand' : 'Worked out from the plan and posting'}
    className={clsx(
      'inline-flex items-center gap-[4px] h-[22px] px-[8px] rounded-full text-[12px] font-[600] whitespace-nowrap',
      stageColors[stage]
    )}
  >
    {stageLabels[stage]}
    {!set && <span className="opacity-60 font-[500]">· auto</span>}
  </span>
);

const healthColors = {
  healthy: 'bg-green-600',
  attention: 'bg-amber-500',
  risk: 'bg-red-500',
};
const healthLabels = {
  healthy: 'Healthy',
  attention: 'Needs attention',
  risk: 'At risk',
};

// a dot, the score and (with details) the reasons
export const HealthBadge: FC<{ health: AdminHealth; details?: boolean }> = ({
  health,
  details,
}) => (
  <span
    className="inline-flex items-center gap-[6px] whitespace-nowrap"
    title={
      health.reasons.length
        ? `${healthLabels[health.label]}: ${health.reasons.join(', ')}`
        : healthLabels[health.label]
    }
  >
    <span
      className={clsx(
        'w-[8px] h-[8px] rounded-full shrink-0',
        healthColors[health.label]
      )}
    />
    <span className="font-[600]">{health.score}</span>
    {details && <span className="opacity-70">{healthLabels[health.label]}</span>}
  </span>
);

export const StatusBadge: FC<{ status: AdminPlanStatus }> = ({ status }) => (
  <span
    className={clsx(
      'inline-flex items-center h-[22px] px-[8px] rounded-full text-[12px] font-[600] whitespace-nowrap',
      statusColors[status]
    )}
  >
    {statusLabels[status]}
  </span>
);

export const money = (value: number) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value % 1 ? 2 : 0,
  });

export const ago = (date: string | null) => (date ? dayjs(date).fromNow() : '-');

export const day = (date: string | null) =>
  date ? dayjs(date).format('D MMM YYYY') : '-';

export const Card: FC<{
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
}> = ({ label, value, hint, href }) => {
  const body = (
    <>
      <div className="text-[12px] opacity-70">{label}</div>
      <div className="text-[28px] font-[600] leading-[1.2]">{value}</div>
      {hint && <div className="text-[12px] opacity-70">{hint}</div>}
    </>
  );
  const className =
    'border border-newTableBorder rounded-[10px] p-[16px] bg-newBgColorInner flex flex-col gap-[2px]';
  return href ? (
    <Link href={href} className={clsx(className, 'hover:border-forth')}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
};

export const Section: FC<{
  title: string;
  right?: ReactNode;
  children: ReactNode;
}> = ({ title, right, children }) => (
  <div className="flex flex-col gap-[10px]">
    <div className="flex items-center justify-between gap-[12px]">
      <div className="text-[16px] font-[600]">{title}</div>
      {right}
    </div>
    {children}
  </div>
);

export const TagChip: FC<{ name: string }> = ({ name }) => (
  <span className="inline-flex items-center h-[20px] px-[6px] rounded-[6px] text-[11px] bg-forth/15 text-forth whitespace-nowrap">
    {name}
  </span>
);

// The customers table of the overview and the customers page
export const CustomerTable: FC<{ customers: AdminCustomerRow[] }> = ({
  customers,
}) => (
  <div className="border border-newTableBorder rounded-[10px] overflow-x-auto">
    <table className="w-full text-[13px] min-w-[1100px]">
      <thead>
        <tr className="bg-newBgColorInner text-[12px] uppercase opacity-70 text-start">
          <th className="text-start font-[500] px-[12px] py-[10px]">Workspace</th>
          <th className="text-start font-[500] px-[12px] py-[10px]">Owner</th>
          <th className="text-start font-[500] px-[12px] py-[10px]">Plan</th>
          <th className="text-start font-[500] px-[12px] py-[10px]">Stage</th>
          <th className="text-start font-[500] px-[12px] py-[10px]">Health</th>
          <th className="text-end font-[500] px-[12px] py-[10px]">$ / month</th>
          <th className="text-end font-[500] px-[12px] py-[10px]">Channels</th>
          <th className="text-end font-[500] px-[12px] py-[10px]">Posts this month</th>
          <th className="text-start font-[500] px-[12px] py-[10px]">Last active</th>
          <th className="text-start font-[500] px-[12px] py-[10px]">Signed up</th>
        </tr>
      </thead>
      <tbody>
        {customers.length === 0 && (
          <tr>
            <td colSpan={10} className="px-[12px] py-[16px] opacity-70">
              No workspaces match.
            </td>
          </tr>
        )}
        {customers.map((customer) => (
          <tr
            key={customer.id}
            className="border-t border-newTableBorder hover:bg-newBgColorInner"
          >
            <td className="px-[12px] py-[10px]">
              <Link
                href={`/admin/customers/${customer.id}`}
                className="font-[600] hover:underline"
              >
                {customer.name}
              </Link>
              {customer.tags.length > 0 && (
                <div className="flex flex-wrap gap-[4px] mt-[4px]">
                  {customer.tags.map((tag) => (
                    <TagChip key={tag} name={tag} />
                  ))}
                </div>
              )}
            </td>
            <td className="px-[12px] py-[10px]">
              <div>{customer.owner?.name || '-'}</div>
              <div className="opacity-70">{customer.owner?.email}</div>
            </td>
            <td className="px-[12px] py-[10px]">
              <div className="flex flex-col items-start gap-[2px]">
                <StatusBadge status={customer.status} />
                {customer.plan && (
                  <span className="text-[12px] opacity-70">
                    {customer.plan.replace(/_/g, ' ').toLowerCase()}
                    {customer.period ? ` · ${customer.period.toLowerCase()}` : ''}
                  </span>
                )}
              </div>
            </td>
            <td className="px-[12px] py-[10px]">
              <StageBadge stage={customer.stage} set={customer.stageSet} />
            </td>
            <td className="px-[12px] py-[10px]">
              <HealthBadge health={customer.health} />
            </td>
            <td className="px-[12px] py-[10px] text-end">
              {customer.monthlyRevenue ? money(customer.monthlyRevenue) : '-'}
            </td>
            <td className="px-[12px] py-[10px] text-end">{customer.channels}</td>
            <td className="px-[12px] py-[10px] text-end">
              {customer.postsThisMonth}
            </td>
            <td className="px-[12px] py-[10px]">{ago(customer.lastActive)}</td>
            <td className="px-[12px] py-[10px]">{day(customer.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const actionLabels: Record<string, string> = {
  signed_in: 'Signed in to HQ',
  free_plan_given: 'Gave the free-forever plan',
  free_plan_removed: 'Removed the free-forever plan',
  note_added: 'Added a note',
  note_deleted: 'Deleted a note',
  tags_changed: 'Changed the tags',
  logged_in_as: 'Opened the app as the customer',
  stage_changed: 'Moved to another stage',
  profile_changed: 'Changed the contact details',
  task_added: 'Added a task',
  task_done: 'Finished a task',
  task_reopened: 'Reopened a task',
  task_deleted: 'Deleted a task',
  customers_exported: 'Exported the customers list',
};

// "tags_changed" with { tags: [...] } -> "Changed the tags: vip, agency"
export const describeAction = (action: string, details: unknown) => {
  const label = actionLabels[action] || action;
  const value = details as {
    tags?: string[];
    email?: string;
    stage?: string;
    title?: string;
  } | null;
  if (value?.tags) {
    return `${label}: ${value.tags.join(', ') || 'none'}`;
  }
  if (value?.stage) {
    return `${label}: ${
      value.stage === 'auto'
        ? 'automatic'
        : stageLabels[value.stage as AdminStage] || value.stage
    }`;
  }
  if (value?.title) {
    return `${label}: ${value.title}`;
  }
  if (value?.email) {
    return `${label} (${value.email})`;
  }
  return label;
};

export const Loading = () => (
  <div className="opacity-70 text-[14px] py-[20px]">Loading…</div>
);

export const Pager: FC<{
  page: number;
  pages: number;
  onChange: (page: number) => void;
}> = ({ page, pages, onChange }) =>
  pages > 1 ? (
    <div className="flex items-center justify-end gap-[8px] text-[13px]">
      <button
        type="button"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
        className="h-[32px] px-[12px] rounded-[8px] border border-newTableBorder disabled:opacity-40"
      >
        Previous
      </button>
      <span className="opacity-70">
        Page {page + 1} of {pages}
      </span>
      <button
        type="button"
        disabled={page >= pages - 1}
        onClick={() => onChange(page + 1)}
        className="h-[32px] px-[12px] rounded-[8px] border border-newTableBorder disabled:opacity-40"
      >
        Next
      </button>
    </div>
  ) : null;
