'use client';

import { FC } from 'react';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// Platforms whose API terms ask for a visible, clickable attribution next to
// the data they provide (YouTube API Services: branding requirements).
const analyticsSources: Record<string, { name: string; url: string }> = {
  youtube: { name: 'YouTube', url: 'https://www.youtube.com' },
};

export const AnalyticsSource: FC<{ identifier?: string }> = ({
  identifier,
}) => {
  const t = useT();
  const source = identifier ? analyticsSources[identifier] : undefined;

  if (!source) {
    return null;
  }

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-[6px] text-[12px] text-textItemBlur hover:text-newTableText"
    >
      <span>{t('analytics_data_from', 'Data from')}</span>
      <SafeImage
        src={`/icons/platforms/${identifier}.png`}
        alt={source.name}
        width={16}
        height={16}
        className="rounded-[4px]"
      />
      <span>{source.name}</span>
    </a>
  );
};
