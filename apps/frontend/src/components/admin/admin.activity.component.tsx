'use client';

import React, { FC, useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';
import { useAdminLog } from '@gitroom/frontend/components/admin/admin.hooks';
import {
  describeAction,
  Loading,
  Pager,
} from '@gitroom/frontend/components/admin/admin.ui';

export const AdminActivityComponent: FC = () => {
  const [page, setPage] = useState(0);
  const { data, error } = useAdminLog(page);

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
        <div className="text-[22px] font-[600]">Activity log</div>
        <div className="text-[13px] opacity-70">
          Every change made from HQ, who made it and when
        </div>
      </div>
      {error && !data && <div className="text-red-400">{error.message}</div>}
      {!data ? (
        !error && <Loading />
      ) : data.entries.length === 0 ? (
        <div className="text-[14px] opacity-70">Nothing yet.</div>
      ) : (
        <>
          <div className="border border-newTableBorder rounded-[10px] overflow-x-auto">
            <table className="w-full text-[13px] min-w-[700px]">
              <thead>
                <tr className="bg-newBgColorInner text-[12px] uppercase opacity-70">
                  <th className="text-start font-[500] px-[12px] py-[10px]">When</th>
                  <th className="text-start font-[500] px-[12px] py-[10px]">Who</th>
                  <th className="text-start font-[500] px-[12px] py-[10px]">What</th>
                  <th className="text-start font-[500] px-[12px] py-[10px]">Workspace</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.id} className="border-t border-newTableBorder">
                    <td className="px-[12px] py-[10px] whitespace-nowrap">
                      {dayjs(entry.createdAt).format('D MMM YYYY, HH:mm')}
                    </td>
                    <td className="px-[12px] py-[10px]">{entry.admin}</td>
                    <td className="px-[12px] py-[10px]">
                      {describeAction(entry.action, entry.details)}
                    </td>
                    <td className="px-[12px] py-[10px]">
                      {entry.organization ? (
                        <Link
                          href={`/admin/customers/${entry.organization.id}`}
                          className="hover:underline"
                        >
                          {entry.organization.name}
                        </Link>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager page={page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
};
