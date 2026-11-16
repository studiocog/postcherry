'use client';

import React, { FC } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { useAdminOverview } from '@gitroom/frontend/components/admin/admin.hooks';
import {
  Card,
  CustomerTable,
  Loading,
  money,
  Section,
  StatusBadge,
} from '@gitroom/frontend/components/admin/admin.ui';
import { AdminPlanStatus } from '@gitroom/nestjs-libraries/dtos/admin/admin.dto';

const planOrder: AdminPlanStatus[] = [
  'paying',
  'cancelling',
  'trial',
  'owner',
  'free',
  'none',
];

export const AdminOverviewComponent: FC = () => {
  const { data, error } = useAdminOverview();

  if (error && !data) {
    return <div className="text-red-400">{error.message}</div>;
  }
  if (!data) {
    return <Loading />;
  }

  const maxSignups = Math.max(1, ...data.signupsPerDay.map((d) => d.count));

  return (
    <div className="flex flex-col gap-[24px]">
      <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
        <div className="text-[22px] font-[600]">Overview</div>
        <div className="text-[12px] opacity-60">Updates every 30 seconds</div>
      </div>

      {!data.billingEnabled && (
        <div className="text-[14px] bg-newBgColorInner border border-newTableBorder rounded-[10px] p-[12px]">
          Payments are off: Stripe isn&apos;t connected yet, so everyone uses
          the app without paying. Revenue starts counting once Stripe is set
          up.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-[12px]">
        <Card
          label="Users"
          value={data.users.total.toLocaleString()}
          hint={`+${data.users.today} today · +${data.users.week} this week`}
        />
        <Card
          label="Workspaces"
          value={data.workspaces.total.toLocaleString()}
          hint={`+${data.workspaces.week} this week`}
          href="/admin/customers"
        />
        <Card
          label="Paying"
          value={data.revenue.payingWorkspaces.toLocaleString()}
          hint={`${data.revenue.cancelling} cancelling`}
          href="/admin/customers?status=paying"
        />
        <Card
          label="Monthly revenue (est.)"
          value={money(data.revenue.mrr)}
          hint="From the price list"
        />
        <Card
          label="Posts today"
          value={data.activity.postsToday.toLocaleString()}
          hint={
            data.activity.failedToday
              ? `${data.activity.failedToday} failed`
              : `${data.activity.postsMonth.toLocaleString()} this month`
          }
          href={data.activity.failedToday ? '/admin/errors' : undefined}
        />
        <Card
          label="Channels"
          value={data.activity.channels.toLocaleString()}
          hint={`${data.activity.channelsNeedReconnect} need reconnecting`}
        />
        <Card
          label="Follow-ups due"
          value={(data.tasks.overdue + data.tasks.today).toLocaleString()}
          hint={
            data.tasks.overdue
              ? `${data.tasks.overdue} overdue`
              : 'Nothing overdue'
          }
          href="/admin/tasks"
        />
        <Card
          label="Pipeline"
          value={<span className="text-[18px]">Open board →</span>}
          hint="Leads, trials, active, at risk"
          href="/admin/pipeline"
        />
      </div>

      <Section title="Plans">
        <div className="flex flex-wrap gap-[8px]">
          {planOrder.map((status) => (
            <Link
              key={status}
              href={`/admin/customers?status=${status}`}
              className="flex items-center gap-[8px] h-[40px] px-[12px] rounded-[10px] border border-newTableBorder bg-newBgColorInner hover:border-forth"
            >
              <StatusBadge status={status} />
              <span className="text-[16px] font-[600]">
                {data.plans[status].toLocaleString()}
              </span>
            </Link>
          ))}
          <Link
            href="/admin/customers?status=never_posted"
            className="flex items-center h-[40px] px-[12px] rounded-[10px] border border-newTableBorder bg-newBgColorInner hover:border-forth text-[13px]"
          >
            Signed up but never posted →
          </Link>
        </div>
      </Section>

      <Section
        title="Sign-ups, last 30 days"
        right={
          <span className="text-[13px] opacity-70">
            {data.users.month} new users
          </span>
        }
      >
        <div className="border border-newTableBorder rounded-[10px] bg-newBgColorInner p-[12px]">
          <div className="flex items-end gap-[3px] h-[120px]">
            {data.signupsPerDay.map((d) => (
              <div
                key={d.day}
                title={`${dayjs(d.day).format('D MMM')}: ${d.count}`}
                className="flex-1 bg-forth/70 hover:bg-forth rounded-t-[3px] min-h-[2px]"
                style={{ height: `${(d.count / maxSignups) * 100}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[11px] opacity-60 mt-[6px]">
            <span>{dayjs(data.signupsPerDay[0]?.day).format('D MMM')}</span>
            <span>Today</span>
          </div>
        </div>
      </Section>

      <Section
        title="Newest workspaces"
        right={
          <Link href="/admin/customers" className="text-[13px] text-forth">
            All customers →
          </Link>
        }
      >
        <CustomerTable customers={data.latest} />
      </Section>
    </div>
  );
};
