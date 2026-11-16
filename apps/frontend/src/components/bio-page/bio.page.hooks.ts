'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  BioPageChannelOption,
  BioPageView,
  BioSlugAvailability,
} from '@gitroom/nestjs-libraries/dtos/bio-page/bio-page.dto';

export const useBioPage = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    const response = await fetch('/bio-page');
    if (!response.ok) {
      throw new Error('Failed to load the link in bio page');
    }
    return response.json();
  }, []);

  return useSWR<Partial<BioPageView>>('bio-page', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

// the connected channels that have a public profile to link to
export const useBioPageChannels = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    const response = await fetch('/bio-page/channels');
    if (!response.ok) {
      return [] as BioPageChannelOption[];
    }
    return response.json();
  }, []);

  return useSWR<BioPageChannelOption[]>('bio-page-channels', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
};

// null while there is nothing to check
export const useBioSlugAvailability = (slug: string | null) => {
  const fetch = useFetch();

  const load = useCallback(async (key: string) => {
    const response = await fetch(
      `/bio-page/slug?slug=${encodeURIComponent(key.split(':')[1])}`
    );
    if (!response.ok) {
      throw new Error('Could not check the address');
    }
    return response.json();
  }, []);

  return useSWR<BioSlugAvailability>(
    slug ? `bio-page-slug:${slug}` : null,
    load,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
};
