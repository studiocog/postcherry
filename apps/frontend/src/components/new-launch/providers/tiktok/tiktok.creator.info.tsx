'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { useCustomProviderFunction } from '@gitroom/frontend/components/launches/helpers/use.custom.provider.function';

// What TiktokProvider.creatorInfo returns
export interface TikTokCreatorInfo {
  canPost: boolean;
  error: string;
  nickname: string;
  username: string;
  avatar: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
}

// TikTok's Content Sharing Guidelines ask for creator_info every time the post
// page opens: revalidated on every mount, never served from an old cache.
// Only the "tiktok" provider has it (TikTok Business uses another API).
export const useTikTokCreatorInfo = () => {
  const { integration } = useIntegration();
  const customFunc = useCustomProviderFunction();

  const load = useCallback(async () => {
    try {
      // the function endpoint answers `false` when the call failed
      return ((await customFunc.get('creatorInfo')) ||
        false) as TikTokCreatorInfo | false;
    } catch (err) {
      return false as const;
    }
  }, [customFunc]);

  return useSWR(
    integration?.identifier === 'tiktok'
      ? `tiktok-creator-info-${integration.id}`
      : null,
    load,
    {
      revalidateOnMount: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      refreshInterval: 0,
    }
  );
};

const readVideoDuration = (src: string) =>
  new Promise<number>((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => resolve(video.duration || 0);
    video.onerror = () => resolve(0);
    video.src = src;
  });

// Length of the attached video in seconds (0 when it can't be read), to check
// against the creator's max_video_post_duration_sec before publishing.
export const useTikTokVideoDuration = (path?: string) => {
  return useSWR(
    path ? `tiktok-video-duration-${path}` : null,
    () => readVideoDuration(path!),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      refreshInterval: 0,
    }
  );
};
