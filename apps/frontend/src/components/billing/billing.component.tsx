'use client';

import { useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { MainBillingComponent } from './main.billing.component';
import { FirstBillingComponent } from './first.billing.component';
import { useVariables } from '@gitroom/react/helpers/variable.context';
export const BillingComponent = () => {
  const fetch = useFetch();
  const { isGeneral } = useVariables();
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const { isLoading: isLoadingTier, data: tiers } = useSWR(
    '/user/subscription/tiers',
    load
  );
  const { isLoading: isLoadingSubscription, data: subscription } = useSWR(
    '/user/subscription',
    load
  );
  if (isLoadingSubscription || isLoadingTier) {
    return <LoadingComponent />;
  }
  // the Free plan upgrades from the same plans and checkout as the first visit
  if (isGeneral && !subscription?.subscription) {
    return <FirstBillingComponent embedded={true} />;
  }
  return <MainBillingComponent sub={subscription?.subscription} />;
};
