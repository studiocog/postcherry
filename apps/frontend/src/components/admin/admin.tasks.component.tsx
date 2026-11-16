'use client';

import React, { FC, useState } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useAdminTasks } from '@gitroom/frontend/components/admin/admin.hooks';
import {
  Loading,
  Section,
} from '@gitroom/frontend/components/admin/admin.ui';
import { TaskList } from '@gitroom/frontend/components/admin/admin.crm.component';
import { AdminTaskRow } from '@gitroom/nestjs-libraries/dtos/admin/admin.dto';

// open follow-ups in groups: overdue, today, upcoming, no date
const groupTasks = (tasks: AdminTaskRow[]) => {
  const today = dayjs().startOf('day');
  const tomorrow = today.add(1, 'day');
  const groups = {
    overdue: [] as AdminTaskRow[],
    today: [] as AdminTaskRow[],
    upcoming: [] as AdminTaskRow[],
    none: [] as AdminTaskRow[],
  };
  for (const task of tasks) {
    if (!task.dueAt) {
      groups.none.push(task);
    } else if (dayjs(task.dueAt).isBefore(today)) {
      groups.overdue.push(task);
    } else if (dayjs(task.dueAt).isBefore(tomorrow)) {
      groups.today.push(task);
    } else {
      groups.upcoming.push(task);
    }
  }
  return groups;
};

export const AdminTasksComponent: FC = () => {
  const [done, setDone] = useState(false);
  const { data, error, mutate } = useAdminTasks(done);
  const groups = groupTasks(data || []);

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-wrap items-center justify-between gap-[8px]">
        <div className="text-[22px] font-[600]">Tasks</div>
        <div className="flex rounded-[8px] border border-newTableBorder overflow-hidden text-[13px]">
          {[
            { value: false, label: 'To do' },
            { value: true, label: 'Done' },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setDone(option.value)}
              className={clsx(
                'h-[34px] px-[14px]',
                done === option.value
                  ? 'bg-forth text-white'
                  : 'bg-newBgColorInner hover:bg-newBgColor'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="text-[13px] opacity-70">
        Add follow-ups on a customer&apos;s page. They all show here.
      </div>

      {error && !data && <div className="text-red-400">{error.message}</div>}
      {!data ? (
        !error && <Loading />
      ) : done ? (
        <TaskList
          tasks={data}
          showWorkspace
          onChanged={() => mutate()}
          empty="Nothing done yet."
        />
      ) : (
        <>
          {[
            { key: 'overdue' as const, title: 'Overdue' },
            { key: 'today' as const, title: 'Today' },
            { key: 'upcoming' as const, title: 'Upcoming' },
            { key: 'none' as const, title: 'No date' },
          ]
            .filter(({ key }) => groups[key].length || key === 'today')
            .map(({ key, title }) => (
              <Section key={key} title={`${title} (${groups[key].length})`}>
                <TaskList
                  tasks={groups[key]}
                  showWorkspace
                  onChanged={() => mutate()}
                  empty={key === 'today' ? 'Nothing due today.' : ''}
                />
              </Section>
            ))}
        </>
      )}
    </div>
  );
};
