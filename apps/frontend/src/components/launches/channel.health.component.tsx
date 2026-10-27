'use client';

import { FC, useMemo } from 'react';
import { Integration } from '@prisma/client';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';

type HealthIntegration = Integration & { identifier: string };

// A one-line summary of the channels above the calendar: a disconnected
// channel makes every post scheduled to it fail, so the ones that need a
// reconnect (or an unfinished connection) are listed with their action.
export const ChannelHealthComponent: FC<{
  integrations: HealthIntegration[];
  refreshChannel: (integration: HealthIntegration) => () => void;
  continueIntegration: (integration: Integration) => () => void;
}> = (props) => {
  const { integrations, refreshChannel, continueIntegration } = props;
  const t = useT();

  const needsAttention = useMemo(
    () =>
      (integrations || []).filter(
        (integration) =>
          integration.refreshNeeded || integration.inBetweenSteps
      ),
    [integrations]
  );

  if (!integrations?.length) {
    return null;
  }

  if (!needsAttention.length) {
    return (
      <div className="flex items-center gap-[8px] text-[13px] text-textColor opacity-70">
        <div className="w-[8px] h-[8px] rounded-full bg-green-500" />
        {t('all_channels_connected', 'All channels connected')}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-[8px] px-[12px] py-[8px] rounded-[8px] border border-red-500/40 bg-red-500/10 text-textColor text-[14px]">
      <div className="flex items-center gap-[8px] font-[600]">
        <div className="w-[8px] h-[8px] rounded-full bg-red-500" />
        {needsAttention.length === 1
          ? t('one_channel_needs_attention', '1 channel needs attention')
          : t('channels_need_attention', '{{count}} channels need attention', {
              count: needsAttention.length,
            })}
      </div>
      {needsAttention.map((integration) => (
        <div
          key={integration.id}
          onClick={
            integration.refreshNeeded
              ? refreshChannel(integration)
              : continueIntegration(integration)
          }
          className="flex items-center gap-[6px] ps-[4px] pe-[10px] py-[3px] rounded-full bg-red-500 text-white text-[12px] font-[600] cursor-pointer hover:opacity-80"
        >
          <ImageWithFallback
            fallbackSrc={`/icons/platforms/${integration.identifier}.png`}
            src={integration.picture || '/no-picture.jpg'}
            className="rounded-full"
            alt={integration.identifier}
            width={18}
            height={18}
          />
          <span className="max-w-[160px] truncate">{integration.name}</span>
          <span className="opacity-80">
            {integration.refreshNeeded
              ? t('reconnect', 'Reconnect')
              : t('finish_setup', 'Finish setup')}
          </span>
        </div>
      ))}
    </div>
  );
};
