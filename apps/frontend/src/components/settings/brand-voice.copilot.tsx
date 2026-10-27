'use client';

import { FC, useMemo } from 'react';
import { useCopilotReadable } from '@copilotkit/react-core';
import { useBrandKit } from '@gitroom/frontend/components/settings/brand-kit.component';

// Gives the brand voice of the workspace to the AI assistant of the composer.
// Without a voice nothing is added, so the assistant works as before
export const BrandVoiceCopilotContext: FC = () => {
  const { data } = useBrandKit();

  const value = useMemo(
    () => ({
      voice: data?.voice || '',
      dos: data?.dos || [],
      donts: data?.donts || [],
    }),
    [data]
  );

  const hasVoice = !!value.voice || !!value.dos.length || !!value.donts.length;

  useCopilotReadable({
    description:
      'Brand voice of this workspace. Always follow it when you write or improve post text',
    value,
    available: hasVoice ? 'enabled' : 'disabled',
  });

  return null;
};
