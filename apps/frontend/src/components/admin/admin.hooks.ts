'use client';

import { createContext, useCallback, useContext } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  AdminCustomerDetail,
  AdminCustomerRow,
  AdminLogEntry,
  AdminOverview,
  AdminSessionState,
} from '@gitroom/nestjs-libraries/dtos/admin/admin.dto';

// The hq pages tell the layout when the admin session ran out (the backend
// answers 428), so it asks for the authenticator code again
// active: the admin used hq in the last minutes (the overview only refreshes
// then, so an idle hq tab doesn't keep the session alive)
export const AdminSessionContext = createContext<{
  expired: () => void;
  active: boolean;
}>({
  expired: () => {},
  active: true,
});

const useAdminLoader = () => {
  const fetch = useFetch();
  const { expired } = useContext(AdminSessionContext);
  return useCallback(
    async (path: string) => {
      const response = await fetch(path);
      if (response.status === 428) {
        expired();
        throw new Error('admin_session_required');
      }
      if (!response.ok) {
        throw new Error(
          (await response.json().catch(() => ({})))?.message ||
            'Could not load this page'
        );
      }
      return response.json();
    },
    [expired]
  );
};

// A change from the hq pages: shows what went wrong, null when it failed
export const useAdminAction = () => {
  const fetch = useFetch();
  const toaster = useToaster();
  const { expired } = useContext(AdminSessionContext);
  return useCallback(
    async <T = unknown>(
      path: string,
      method: 'POST' | 'PUT' | 'DELETE',
      body?: object
    ): Promise<T | null> => {
      const response = await fetch(path, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (response.status === 428) {
        expired();
        return null;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = Array.isArray(data?.message)
          ? data.message.join(', ')
          : data?.message;
        toaster.show(message || 'Something went wrong', 'warning');
        return null;
      }
      return data as T;
    },
    [expired]
  );
};

const quiet = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  refreshWhenHidden: false,
  refreshWhenOffline: false,
};

export const useAdminSession = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    const response = await fetch('/admin/session');
    if (!response.ok) {
      throw new Error('not_admin');
    }
    return response.json();
  }, []);
  return useSWR<AdminSessionState>('admin-session', load, {
    ...quiet,
    shouldRetryOnError: false,
  });
};

// refreshes every 30 seconds while the admin is using hq
export const useAdminOverview = () => {
  const load = useAdminLoader();
  const { active } = useContext(AdminSessionContext);
  return useSWR<AdminOverview>('/admin/overview', load, {
    ...quiet,
    refreshInterval: active ? 30000 : 0,
  });
};

export const useAdminCustomers = (params: {
  search: string;
  status: string;
  tag: string;
  page: number;
}) => {
  const load = useAdminLoader();
  const query = new URLSearchParams({
    search: params.search,
    status: params.status,
    tag: params.tag,
    page: String(params.page),
  }).toString();
  return useSWR<{
    total: number;
    pages: number;
    customers: AdminCustomerRow[];
  }>(`/admin/customers?${query}`, load, {
    ...quiet,
    keepPreviousData: true,
  });
};

export const useAdminTags = () => {
  const load = useAdminLoader();
  return useSWR<{ name: string; count: number }[]>('/admin/tags', load, quiet);
};

export const useAdminCustomer = (id: string) => {
  const load = useAdminLoader();
  return useSWR<AdminCustomerDetail>(`/admin/customers/${id}`, load, quiet);
};

export const useAdminLog = (page: number) => {
  const load = useAdminLoader();
  return useSWR<{ total: number; pages: number; entries: AdminLogEntry[] }>(
    `/admin/log?page=${page}`,
    load,
    { ...quiet, keepPreviousData: true }
  );
};
