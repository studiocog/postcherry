'use client';

import {
  createContext,
  FC,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
} from 'react';
import useSWR from 'swr';
import useCookie from 'react-use-cookie';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';

// A brand is a Customer (a group of channels), the brand switcher picks one
export interface Brand {
  id: string;
  name: string;
}

export const useCustomerList = () => {
  const fetch = useFetch();
  const load = useCallback(async (path: string) => {
    return (await fetch(path)).json();
  }, []);

  return useSWR<Brand[]>('/integrations/customers', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

// same key and loader as the workspace switcher (OrganizationSelector)
export const useOrganizationList = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/user/organizations')).json();
  }, []);

  return useSWR<{ id: string; name: string }[]>('organizations', load, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
    revalidateOnReconnect: false,
  });
};

interface BrandContextInterface {
  brands: Brand[];
  loading: boolean;
  // the selected brand id, '' is every brand (and every channel)
  current: string;
  currentBrand?: Brand;
  setCurrent: (id: string) => void;
  // the plan's brand count, null when brands are not limited
  limit: number | null;
  canAdd: boolean;
  // connected channels per brand id, '' holds the channels without a brand
  channels: Record<string, number>;
  totalChannels: number;
  reload: () => Promise<unknown>;
}

const BrandContext = createContext<BrandContextInterface>({
  brands: [],
  loading: true,
  current: '',
  setCurrent: () => {
    /** empty **/
  },
  limit: null,
  canAdd: true,
  channels: {},
  totalChannels: 0,
  reload: async () => {
    /** empty **/
  },
});

export const BrandProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const user = useUser();
  const { billingEnabled } = useVariables();
  const { data, isLoading, mutate } = useCustomerList();
  const {
    data: integrations,
    isLoading: integrationsLoading,
    mutate: mutateIntegrations,
  } = useIntegrationList();
  // per workspace, the page reloads when the workspace changes
  const [saved, setSaved] = useCookie(`brand_${user?.orgId || ''}`, '');

  const brands = useMemo(
    () =>
      (Array.isArray(data) ? data : [])
        .map((p) => ({ id: p.id, name: p.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data]
  );

  const channels = useMemo(() => {
    return (Array.isArray(integrations) ? integrations : []).reduce(
      (all: Record<string, number>, integration: any) => {
        const key = integration?.customer?.id || '';
        all[key] = (all[key] || 0) + 1;
        return all;
      },
      {} as Record<string, number>
    );
  }, [integrations]);

  const current = useMemo(() => {
    // the saved brand while the lists load, so the calendar loads it right away
    // (the channels decide the single brand rule below)
    if (!data || integrationsLoading) {
      return saved || '';
    }
    if (!brands.length) {
      return '';
    }
    if (saved && brands.some((p) => p.id === saved)) {
      return saved;
    }
    // a single brand that holds every channel is always the selected one
    if (brands.length === 1 && !channels['']) {
      return brands[0].id;
    }
    return '';
  }, [data, integrationsLoading, brands, saved, channels]);

  const setCurrent = useCallback((id: string) => {
    setSaved(id, { days: 365 });
  }, []);

  const limit = billingEnabled ? user?.tier?.brands ?? null : null;

  const reload = useCallback(
    () => Promise.all([mutate(), mutateIntegrations()]),
    [mutate, mutateIntegrations]
  );

  const value = useMemo(
    () => ({
      brands,
      loading: isLoading,
      current,
      currentBrand: brands.find((p) => p.id === current),
      setCurrent,
      limit,
      canAdd: limit === null || brands.length < limit,
      channels,
      totalChannels: Array.isArray(integrations) ? integrations.length : 0,
      reload,
    }),
    [brands, isLoading, current, setCurrent, limit, channels, integrations, reload]
  );

  return (
    <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
  );
};

export const useBrands = () => useContext(BrandContext);

// The query of a channel connect link: a channel connected while a brand is
// selected joins that brand (GET /integrations/social/:provider?customer=)
export const useConnectQuery = (onboarding?: boolean) => {
  const { current } = useBrands();
  return useCallback(
    (...extra: string[]) => {
      const query = [
        onboarding ? 'onboarding=true' : '',
        current ? `customer=${encodeURIComponent(current)}` : '',
        ...extra,
      ]
        .filter(Boolean)
        .join('&');
      return query ? `?${query}` : '';
    },
    [onboarding, current]
  );
};
