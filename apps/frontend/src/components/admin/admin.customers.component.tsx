'use client';

import React, { FC, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useAdminCustomers,
  useAdminTags,
} from '@gitroom/frontend/components/admin/admin.hooks';
import {
  CustomerTable,
  Loading,
  Pager,
  statusLabels,
} from '@gitroom/frontend/components/admin/admin.ui';
import {
  AdminCustomerStatus,
  adminCustomerStatuses,
  AdminPlanStatus,
} from '@gitroom/nestjs-libraries/dtos/admin/admin.dto';

const filterLabel = (status: AdminCustomerStatus) =>
  status === 'never_posted'
    ? 'Never posted'
    : statusLabels[status as AdminPlanStatus];

const selectClass =
  'h-[40px] bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor outline-none';

export const AdminCustomersComponent: FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get('status') || '';
  const tag = searchParams.get('tag') || '';
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [search, setSearch] = useState(searchInput);
  const [page, setPage] = useState(0);

  // wait until typing stops before searching
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const setFilter = (name: 'status' | 'tag', value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(name, value);
    } else {
      params.delete(name);
    }
    setPage(0);
    const query = params.toString();
    router.replace(`/admin/customers${query ? `?${query}` : ''}`);
  };

  const { data, error, isLoading } = useAdminCustomers({
    search,
    status,
    tag,
    page,
  });
  const { data: tags } = useAdminTags();

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
        <div className="text-[22px] font-[600]">Customers</div>
        {data && (
          <div className="text-[13px] opacity-70">
            {data.total.toLocaleString()} workspace{data.total === 1 ? '' : 's'}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-[8px]">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search name or email"
          className={`${selectClass} flex-1 min-w-[220px]`}
        />
        <select
          value={status}
          onChange={(e) => setFilter('status', e.target.value)}
          className={selectClass}
        >
          <option value="">All plans</option>
          {adminCustomerStatuses.map((value) => (
            <option key={value} value={value}>
              {filterLabel(value)}
            </option>
          ))}
        </select>
        <select
          value={tag}
          onChange={(e) => setFilter('tag', e.target.value)}
          className={selectClass}
        >
          <option value="">All tags</option>
          {(tags || []).map((item) => (
            <option key={item.name} value={item.name}>
              {item.name} ({item.count})
            </option>
          ))}
        </select>
      </div>

      {error && !data && <div className="text-red-400">{error.message}</div>}
      {isLoading && !data ? (
        <Loading />
      ) : (
        data && (
          <>
            <CustomerTable customers={data.customers} />
            <Pager page={page} pages={data.pages} onChange={setPage} />
          </>
        )
      )}
    </div>
  );
};
