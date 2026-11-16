'use client';

import React, { FC, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  AdminSessionContext,
  customersQuery,
  useAdminCustomers,
  useAdminTags,
} from '@gitroom/frontend/components/admin/admin.hooks';
import {
  CustomerTable,
  Loading,
  Pager,
  stageLabels,
  statusLabels,
} from '@gitroom/frontend/components/admin/admin.ui';
import {
  AdminCustomerStatus,
  adminCustomerStatuses,
  AdminPlanStatus,
  adminStages,
} from '@gitroom/nestjs-libraries/dtos/admin/admin.dto';

const sortLabels = { newest: 'Newest first', oldest: 'Oldest first', name: 'Name A-Z' };

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
  const stage = searchParams.get('stage') || '';
  const sort = searchParams.get('sort') || '';
  const fetch = useFetch();
  const toaster = useToaster();
  const { expired } = useContext(AdminSessionContext);
  const [exporting, setExporting] = useState(false);
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

  const setFilter = (
    name: 'status' | 'tag' | 'stage' | 'sort',
    value: string
  ) => {
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
    stage,
    sort,
    page,
  });

  // the list with these filters as a CSV file
  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const response = await fetch(
        `/admin/customers/export?${customersQuery({
          search,
          status,
          tag,
          stage,
          sort,
        })}`
      );
      if (response.status === 428) {
        expired();
        return;
      }
      if (!response.ok) {
        toaster.show('Could not export the list', 'warning');
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `postcherry-customers-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [search, status, tag, stage, sort]);
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
          value={stage}
          onChange={(e) => setFilter('stage', e.target.value)}
          className={selectClass}
        >
          <option value="">All stages</option>
          {adminStages.map((value) => (
            <option key={value} value={value}>
              {stageLabels[value]}
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
        <select
          value={sort || 'newest'}
          onChange={(e) =>
            setFilter('sort', e.target.value === 'newest' ? '' : e.target.value)
          }
          className={selectClass}
        >
          {Object.entries(sortLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={exportCsv}
          disabled={exporting}
          className="h-[40px] px-[14px] rounded-[8px] border border-newTableBorder bg-newBgColorInner text-[14px] hover:border-forth disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
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
