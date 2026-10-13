'use client';

import { useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { PreviewIntegration } from '@gitroom/frontend/components/preview/preview.post.card';

export type PostApprovalStatus = 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED';

export interface PostApprovalBadgeData {
  id: string;
  status: PostApprovalStatus;
  clientName: string | null;
  decidedByName: string | null;
  clientComment: string | null;
  decidedAt: string | null;
}

export interface PostApprovalRequest extends PostApprovalBadgeData {
  url: string;
  active: boolean;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  requestedBy: string | null;
}

export interface PublicApprovalChannel {
  integration: PreviewIntegration;
  publishDate: string;
  published: boolean;
  values: {
    content: string;
    media: { path: string; thumbnail?: string; alt?: string }[];
  }[];
}

export interface PublicApproval {
  state:
    | 'open'
    | 'locked'
    | 'expired'
    | 'revoked'
    | 'unavailable'
    | 'not_found';
  status?: PostApprovalStatus;
  clientName?: string | null;
  decidedByName?: string | null;
  clientComment?: string | null;
  decidedAt?: string | null;
  expiresAt?: string;
  channels?: PublicApprovalChannel[];
}

// the backend accepts at most 500 posts per call
const MAX_STATUS_IDS = 500;
const STATUSES_KEY = 'post-approval-statuses:';
const isStatusesKey = (key: unknown) =>
  typeof key === 'string' && key.startsWith(STATUSES_KEY);

export const usePostApprovals = (postId?: string) => {
  const fetch = useFetch();
  const load = useCallback(async (path: string) => {
    const response = await fetch(path);
    if (!response.ok) {
      return [] as PostApprovalRequest[];
    }
    return (await response.json()) as PostApprovalRequest[];
  }, []);

  return useSWR<PostApprovalRequest[]>(
    postId ? `/post-approvals/post/${postId}` : null,
    load
  );
};

// the latest approval of every post on screen, keyed by post id
export const usePostApprovalStatuses = (
  postIds: string[],
  enabled: boolean
) => {
  const fetch = useFetch();
  const load = useCallback(async (key: string) => {
    const response = await fetch('/post-approvals/statuses', {
      method: 'POST',
      body: JSON.stringify({
        postIds: key.slice(STATUSES_KEY.length).split(','),
      }),
    });
    if (!response.ok) {
      return {} as Record<string, PostApprovalBadgeData>;
    }
    return (await response.json()) as Record<string, PostApprovalBadgeData>;
  }, []);

  return useSWR<Record<string, PostApprovalBadgeData>>(
    enabled && postIds.length
      ? STATUSES_KEY + postIds.slice(0, MAX_STATUS_IDS).join(',')
      : null,
    load,
    {
      revalidateOnFocus: false,
    }
  );
};

export const usePublicApproval = (token: string) => {
  const fetch = useFetch();
  const load = useCallback(async (path: string) => {
    const response = await fetch(path);
    if (response.status === 404) {
      return { state: 'not_found' } as PublicApproval;
    }
    if (!response.ok) {
      throw new Error('Could not load the approval');
    }
    return (await response.json()) as PublicApproval;
  }, []);

  return useSWR<PublicApproval>(
    `/public/approvals/${encodeURIComponent(token)}`,
    load,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
};

export const useCreatePostApproval = () => {
  const fetch = useFetch();
  const { mutate } = useSWRConfig();

  return useCallback(
    async (
      postId: string,
      body: { clientName?: string; expiresInDays: number }
    ) => {
      const response = await fetch(`/post-approvals/post/${postId}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        return null;
      }
      const created = (await response.json()) as { id: string; url: string };
      await Promise.all([
        mutate(`/post-approvals/post/${postId}`),
        mutate(isStatusesKey),
      ]);
      return created;
    },
    [fetch, mutate]
  );
};

export const useRevokePostApproval = () => {
  const fetch = useFetch();
  const { mutate } = useSWRConfig();

  return useCallback(
    async (postId: string, id: string) => {
      const response = await fetch(`/post-approvals/${id}/revoke`, {
        method: 'PUT',
      });
      await Promise.all([
        mutate(`/post-approvals/post/${postId}`),
        mutate(isStatusesKey),
      ]);
      return response.ok;
    },
    [fetch, mutate]
  );
};

export const useDecidePostApproval = (token: string) => {
  const fetch = useFetch();

  return useCallback(
    async (body: {
      decision: 'APPROVED' | 'CHANGES_REQUESTED';
      comment?: string;
      name?: string;
    }) => {
      const response = await fetch(
        `/public/approvals/${encodeURIComponent(token)}/decision`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        }
      );
      if (!response.ok) {
        const { message } = await response.json().catch(() => ({} as any));
        return {
          approval: null,
          // a closed link (expired, revoked, published) explains itself
          message:
            response.status === 400 && typeof message === 'string'
              ? message
              : undefined,
        };
      }
      return {
        approval: (await response.json()) as PublicApproval,
        message: undefined,
      };
    },
    [fetch, token]
  );
};
