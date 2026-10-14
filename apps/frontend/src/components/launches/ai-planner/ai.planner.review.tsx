'use client';

import React, { FC, useEffect, useMemo, useRef } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import { TrashIcon } from '@gitroom/frontend/components/ui/icons';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { PlatformBadge } from '@gitroom/frontend/components/new-launch/picks.socials.component';
import { AiPlanItem } from '@gitroom/nestjs-libraries/dtos/ai-planner/ai.planner.dto';

// a post that goes to several channels has to fit the strictest one
export const planItemLimit = (
  item: AiPlanItem,
  channelLimits: Record<string, number>
) =>
  Math.min(
    ...item.integrationIds
      .map((id) => channelLimits[id])
      .filter((limit) => !!limit)
  );

export const useCategoryLabels = () => {
  const t = useT();
  return useMemo(
    (): Record<AiPlanItem['category'], string> => ({
      tips: t('ai_planner_mix_tips', 'Tips'),
      promotions: t('ai_planner_mix_promotions', 'Promotions'),
      behind_the_scenes: t(
        'ai_planner_mix_behind_the_scenes',
        'Behind the scenes'
      ),
      questions: t('ai_planner_mix_questions', 'Questions'),
      news: t('ai_planner_mix_news', 'News'),
      other: t('ai_planner_mix_other', 'Other'),
    }),
    [t]
  );
};

export const ChannelAvatar: FC<{
  integration: Integrations;
  selected: boolean;
  size: number;
  onClick: () => void;
}> = ({ integration, selected, size, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={selected}
    aria-label={integration.name}
    data-tooltip-id="tooltip"
    data-tooltip-content={integration.name}
    className={clsx(
      'cursor-pointer border-[2px] relative rounded-full flex justify-center items-center bg-fifth transition-all',
      selected ? 'border-btnPrimary' : 'grayscale opacity-50 border-transparent'
    )}
  >
    <ImageWithFallback
      fallbackSrc="/no-picture.jpg"
      src={integration.picture || '/no-picture.jpg'}
      className="rounded-full"
      alt={integration.identifier}
      width={size}
      height={size}
    />
    <PlatformBadge integration={integration} />
  </button>
);

// grows with the text, so a long post is read without a scrollbar
const AutoGrowTextarea: FC<{
  value: string;
  label: string;
  onChange: (value: string) => void;
}> = ({ value, label, onChange }) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = `${ref.current.scrollHeight + 2}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={3}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="bg-newBgColorInner border border-newTableBorder rounded-[8px] p-[12px] outline-none text-[14px] text-textColor w-full resize-none overflow-hidden"
    />
  );
};

const PlanItemCard: FC<{
  item: AiPlanItem;
  channels: Integrations[];
  limit: number;
  minDate: string;
  maxDate: string;
  invalid: boolean;
  categoryLabel: string;
  onChange: (value: Partial<AiPlanItem>) => void;
  onRemove: () => void;
}> = ({
  item,
  channels,
  limit,
  minDate,
  maxDate,
  invalid,
  categoryLabel,
  onChange,
  onRemove,
}) => {
  const t = useT();
  const over = item.content.length > limit;

  const toggleChannel = (id: string) => () => {
    const integrationIds = item.integrationIds.includes(id)
      ? item.integrationIds.filter((p) => p !== id)
      : [...item.integrationIds, id];
    // a post always keeps one channel
    if (integrationIds.length) {
      onChange({ integrationIds });
    }
  };

  return (
    <div
      className={clsx(
        'bg-newBgColorInner border rounded-[8px] p-[16px] mobile:p-[12px] flex flex-col gap-[10px]',
        invalid ? 'border-red-400' : 'border-newTableBorder'
      )}
    >
      <div className="flex flex-wrap items-center gap-[8px]">
        <input
          type="date"
          value={item.date}
          min={minDate}
          max={maxDate}
          aria-label={t('ai_planner_post_date', 'Date')}
          onChange={(e) => onChange({ date: e.target.value })}
          className="bg-newBgColorInner h-[38px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
        />
        <input
          type="time"
          value={item.time}
          aria-label={t('ai_planner_post_time', 'Time')}
          onChange={(e) => onChange({ time: e.target.value })}
          className="bg-newBgColorInner h-[38px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
        />
        <div className="bg-boxFocused text-textItemFocused rounded-full px-[8px] py-[2px] text-[12px]">
          {categoryLabel}
        </div>
        <div className="flex flex-1 flex-wrap gap-[8px] justify-end">
          {channels.map((integration) => (
            <ChannelAvatar
              key={integration.id}
              integration={integration}
              size={28}
              selected={item.integrationIds.includes(integration.id)}
              onClick={toggleChannel(integration.id)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('ai_planner_remove_post', 'Remove this post')}
          data-tooltip-id="tooltip"
          data-tooltip-content={t('ai_planner_remove_post', 'Remove this post')}
          className="w-[32px] h-[32px] rounded-[6px] flex items-center justify-center cursor-pointer text-textItemBlur hover:bg-boxHover hover:text-red-400"
        >
          <TrashIcon size={16} />
        </button>
      </div>
      <input
        value={item.title}
        maxLength={120}
        aria-label={t('ai_planner_post_idea', 'Idea')}
        onChange={(e) => onChange({ title: e.target.value })}
        className="bg-transparent outline-none text-[14px] font-[600] text-textColor w-full"
      />
      <AutoGrowTextarea
        value={item.content}
        label={t('ai_planner_post_text', 'Post text')}
        onChange={(content) => onChange({ content })}
      />
      {Number.isFinite(limit) && (
        <div
          className={clsx(
            'text-[12px] text-end',
            over ? 'text-red-400' : 'text-textItemBlur'
          )}
        >
          {item.content.length} / {limit}
        </div>
      )}
    </div>
  );
};

// The plan as the user edits it, nothing here is saved
export const AiPlannerReview: FC<{
  items: AiPlanItem[];
  // the channels of the plan, as the server accepted them
  channels: Integrations[];
  channelLimits: Record<string, number>;
  brandVoice: boolean;
  minDate: string;
  maxDate: string;
  invalidIds: string[];
  disabled: boolean;
  onChange: (id: string, value: Partial<AiPlanItem>) => void;
  onRemove: (id: string) => void;
}> = ({
  items,
  channels,
  channelLimits,
  brandVoice,
  minDate,
  maxDate,
  invalidIds,
  disabled,
  onChange,
  onRemove,
}) => {
  const t = useT();
  const categoryLabels = useCategoryLabels();

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-wrap items-center gap-[12px]">
        <div className="flex-1 text-[16px] font-[600]">
          {t('ai_planner_count', '{{count}} posts planned', {
            count: items.length,
            defaultValue_one: '{{count}} post planned',
          })}
        </div>
        {brandVoice && (
          <div className="bg-boxFocused text-textItemFocused rounded-full px-[10px] py-[2px] text-[12px]">
            {t('ai_planner_brand_voice_used', 'Brand voice applied')}
          </div>
        )}
      </div>
      {!items.length ? (
        <div className="py-[40px] text-center text-textItemBlur">
          {t(
            'ai_planner_empty',
            'There are no posts left in this plan. Go back or generate a new one.'
          )}
        </div>
      ) : (
        // a fieldset so the keyboard cannot change the posts while they are added either
        <fieldset
          disabled={disabled}
          className={clsx(
            'flex flex-col gap-[12px] max-h-[60vh] min-w-0 overflow-y-auto pe-[4px] scrollbar scrollbar-thumb-fifth scrollbar-track-newBgColor',
            disabled && 'pointer-events-none opacity-75'
          )}
        >
          {items.map((item) => (
            <PlanItemCard
              key={item.id}
              item={item}
              channels={channels}
              limit={planItemLimit(item, channelLimits)}
              minDate={minDate}
              maxDate={maxDate}
              invalid={invalidIds.includes(item.id)}
              categoryLabel={categoryLabels[item.category]}
              onChange={(value) => onChange(item.id, value)}
              onRemove={() => onRemove(item.id)}
            />
          ))}
        </fieldset>
      )}
    </div>
  );
};
