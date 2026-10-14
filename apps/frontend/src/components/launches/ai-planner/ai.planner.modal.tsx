'use client';

import React, {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import i18next from 'i18next';
import { escape as escapeHtml } from 'lodash';
import { FormProvider, useForm } from 'react-hook-form';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { Select } from '@gitroom/react/form/select';
import { Textarea } from '@gitroom/react/form/textarea';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import Spinner from '@gitroom/frontend/components/layout/loading';
import { getTimezone } from '@gitroom/frontend/components/layout/set.timezone';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';
import { IntegrationListRow } from '@gitroom/frontend/components/new-launch/picks.socials.component';
import { useBrandKit } from '@gitroom/frontend/components/settings/brand-kit.component';
import {
  AiPlannerReview,
  ChannelAvatar,
  planItemLimit,
  useCategoryLabels,
} from '@gitroom/frontend/components/launches/ai-planner/ai.planner.review';
import {
  AI_PLANNER_MAX_CHANNELS,
  AI_PLANNER_MAX_DAYS,
  AI_PLANNER_MAX_POSTS_PER_WEEK,
  AiPlanItem,
  AiPlannerEvent,
  GeneratePlanDto,
  plannedPostsCount,
  plannerContentMix,
  PlannerContentMix,
  plannerLanguages,
} from '@gitroom/nestjs-libraries/dtos/ai-planner/ai.planner.dto';

type Step = 'form' | 'generating' | 'review' | 'saving';
type PlanResult = Extract<AiPlannerEvent, { name: 'result' }>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// the composer keeps a post as one paragraph per line
const toEditorHtml = (text: string) =>
  text
    .split('\n')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');

// dates and times of the plan are in the timezone of the user
const toLocalDate = (item: AiPlanItem) =>
  dayjs.tz(`${item.date} ${item.time}`, getTimezone());

// the same body as the "Save as draft" of the composer,
// all the channels of the item in one request so they are one post
const toDraft = (item: AiPlanItem) => {
  const group = makeId(10);
  return {
    type: 'draft',
    shortLink: false,
    tags: [] as { value: string; label: string }[],
    date: toLocalDate(item).utc().format('YYYY-MM-DDTHH:mm:ss'),
    posts: item.integrationIds.map((id) => ({
      integration: { id },
      group,
      settings: {},
      value: [
        {
          content: toEditorHtml(item.content.trim()),
          delay: 0,
          image: [] as { id: string; path: string }[],
        },
      ],
    })),
  };
};

// NDJSON like the post generator: an event can be split between two chunks,
// so only full lines are read
const readEvents = async (
  reader: ReadableStreamDefaultReader,
  onEvent: (event: AiPlannerEvent) => void
) => {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = done ? '' : lines.pop() || '';

    for (const line of lines) {
      let event: AiPlannerEvent | null = null;
      try {
        event = line.trim() ? JSON.parse(line) : null;
      } catch (e) {
        /** ignore unparseable lines **/
        event = null;
      }
      if (event) {
        onEvent(event);
      }
    }

    if (done) {
      return;
    }
  }
};

export const AiPlannerModal: FC<{
  integrations: Integrations[];
  customer: string | null;
  reloadCalendarView: () => void;
}> = ({ integrations, customer, reloadCalendarView }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const modal = useModals();
  const categoryLabels = useCategoryLabels();
  const { data: brandKit } = useBrandKit();

  const channels = useMemo(
    () => integrations.filter((p) => !p.disabled && !p.inBetweenSteps),
    [integrations]
  );

  const tomorrow = useMemo(
    () => dayjs().tz(getTimezone()).add(1, 'day').format('YYYY-MM-DD'),
    []
  );

  const resolver = useMemo(() => classValidatorResolver(GeneratePlanDto), []);

  const form = useForm<GeneratePlanDto>({
    mode: 'all',
    resolver,
    defaultValues: ((): GeneratePlanDto => {
      // the channels of the customer shown in the calendar, otherwise all of them
      const ofCustomer = customer
        ? channels.filter((p) => p.customer?.id === customer)
        : [];
      const language = (i18next.resolvedLanguage || 'en').split('-')[0];

      return {
        integrations: (ofCustomer.length ? ofCustomer : channels)
          .slice(0, AI_PLANNER_MAX_CHANNELS)
          .map((p) => p.id),
        startDate: tomorrow,
        endDate: dayjs(tomorrow).add(29, 'day').format('YYYY-MM-DD'),
        postsPerWeek: 3,
        goals: '',
        contentMix: [],
        language: plannerLanguages.some((p) => p.code === language)
          ? language
          : 'en',
      };
    })(),
  });

  const [selected, startDate, endDate, postsPerWeek, contentMix, goals] =
    form.watch([
      'integrations',
      'startDate',
      'endDate',
      'postsPerWeek',
      'contentMix',
      'goals',
    ]);

  const [step, setStep] = useState<Step>('form');
  const [progress, setProgress] = useState('');
  const [items, setItems] = useState<AiPlanItem[]>([]);
  const [channelLimits, setChannelLimits] = useState<Record<string, number>>(
    {}
  );
  const [brandVoice, setBrandVoice] = useState(false);
  // the range of the plan in review, the form can change in the meantime
  const [planRange, setPlanRange] = useState({ startDate: '', endDate: '' });
  const [edited, setEdited] = useState(false);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [saved, setSaved] = useState({ done: 0, total: 0 });
  const abort = useRef<AbortController | null>(null);
  const generatingFrom = useRef<'form' | 'review'>('form');

  // closing the planner stops the generation, the server stops calling the AI
  useEffect(() => () => abort.current?.abort(), []);

  const days = dayjs(endDate).diff(dayjs(startDate), 'day') + 1;

  // the same checks as the server, so the user knows before generating
  const rangeError = useMemo(() => {
    if (!DATE.test(startDate || '') || !DATE.test(endDate || '')) {
      return t('ai_planner_pick_dates', 'Pick a start and an end date');
    }
    if (startDate < tomorrow) {
      return t(
        'ai_planner_start_tomorrow',
        'The plan can start tomorrow at the earliest'
      );
    }
    if (endDate < startDate) {
      return t(
        'ai_planner_end_before_start',
        'The end date must be after the start date'
      );
    }
    if (days > AI_PLANNER_MAX_DAYS) {
      return t(
        'ai_planner_range_too_long',
        'A plan can cover up to {{days}} days',
        { days: AI_PLANNER_MAX_DAYS }
      );
    }
    return '';
  }, [startDate, endDate, tomorrow, days, t]);

  const channelsError = !selected?.length
    ? t('ai_planner_pick_channel', 'Pick at least one channel')
    : selected.length > AI_PLANNER_MAX_CHANNELS
    ? t('ai_planner_too_many_channels', 'Pick up to {{max}} channels', {
        max: AI_PLANNER_MAX_CHANNELS,
      })
    : '';

  // the only field without a valid default, so it says why Generate is disabled,
  // in red once the user typed in it
  const goalsMissing = (goals || '').trim().length < 3;
  const goalsTouched =
    !!form.formState.touchedFields.goals || !!form.formState.dirtyFields.goals;
  const goalsHint = t(
    'ai_planner_goals_required',
    'Tell the AI what to talk about (at least 3 characters)'
  );

  const hasBrandVoice = !!(
    brandKit?.voice ||
    brandKit?.dos?.length ||
    brandKit?.donts?.length
  );

  // the channels of the plan, as the server accepted them
  const planChannels = useMemo(
    () => channels.filter((p) => channelLimits[p.id]),
    [channels, channelLimits]
  );

  const setChannels = useCallback(
    (ids: string[]) => {
      form.setValue('integrations', ids, {
        shouldValidate: true,
        shouldDirty: true,
      });
    },
    [form]
  );

  const toggleChannel = (id: string) => () => {
    setChannels(
      selected.includes(id)
        ? selected.filter((p) => p !== id)
        : [...selected, id]
    );
  };

  // read at click time, the checkbox keeps the handler of an older render
  const toggleMix = (mix: PlannerContentMix) => () => {
    const current = form.getValues('contentMix') || [];
    form.setValue(
      'contentMix',
      current.includes(mix)
        ? current.filter((p) => p !== mix)
        : [...current, mix],
      { shouldValidate: true, shouldDirty: true }
    );
  };

  const generate = useCallback(
    async (values: GeneratePlanDto, from: 'form' | 'review') => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      generatingFrom.current = from;

      setProgress(t('ai_planner_planning', 'Planning your ideas...'));
      setStep('generating');

      const failed = (message?: string) => {
        toaster.show(
          message ||
            t(
              'ai_planner_failed',
              'Could not create the plan, please try again.'
            ),
          'warning'
        );
        setStep(from);
      };

      try {
        const response = await fetch('/ai-planner/generate', {
          method: 'POST',
          body: JSON.stringify(values),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          // the upgrade dialog was already shown
          if (response.status === 402) {
            setStep(from);
            return;
          }
          const { message } = await response.json().catch(() => ({} as any));
          failed(Array.isArray(message) ? message[0] : message);
          return;
        }

        const outcome: { result?: PlanResult; error?: string } = {};
        await readEvents(response.body.getReader(), (event) => {
          switch (event.name) {
            case 'outline':
              setProgress(t('ai_planner_planning', 'Planning your ideas...'));
              break;
            case 'writing':
              setProgress(
                t(
                  'ai_planner_writing',
                  'Writing posts {{done}} of {{total}}...',
                  { done: event.done, total: event.total }
                )
              );
              break;
            case 'result':
              outcome.result = event;
              break;
            case 'error':
              outcome.error = event.message;
              break;
          }
        });

        if (controller.signal.aborted) {
          return;
        }

        if (outcome.error || !outcome.result) {
          failed(outcome.error);
          return;
        }

        if (outcome.result.status === 'not_configured') {
          failed(
            t(
              'ai_planner_not_configured',
              'AI is not set up on this server yet, so the planner is not available.'
            )
          );
          return;
        }

        setItems(outcome.result.items);
        setChannelLimits(outcome.result.channelLimits);
        setBrandVoice(outcome.result.brandVoice);
        setPlanRange({ startDate: values.startDate, endDate: values.endDate });
        setEdited(false);
        setInvalid([]);
        setStep('review');
      } catch (err) {
        if (!controller.signal.aborted) {
          failed();
        }
      }
    },
    [fetch, toaster, t]
  );

  const cancel = useCallback(() => {
    abort.current?.abort();
    setStep(generatingFrom.current);
  }, []);

  // a new plan replaces the one in review
  const confirmReplace = useCallback(async () => {
    return (
      !edited ||
      !items.length ||
      deleteDialog(
        t(
          'ai_planner_regenerate_confirm',
          'Replace this plan with a new one? Your edits will be lost.'
        ),
        t('regenerate', 'Regenerate')
      )
    );
  }, [edited, items.length, t]);

  const submit = useCallback(
    async (values: GeneratePlanDto) => {
      if (await confirmReplace()) {
        generate(values, 'form');
      }
    },
    [confirmReplace, generate]
  );

  // the same inputs again, the form is fixed first if it was changed since
  const regenerate = useCallback(async () => {
    if (!(await form.trigger()) || rangeError || channelsError) {
      setStep('form');
      return;
    }
    if (await confirmReplace()) {
      generate(form.getValues(), 'review');
    }
  }, [form, rangeError, channelsError, confirmReplace, generate]);

  const updateItem = useCallback(
    (id: string, value: Partial<AiPlanItem>) => {
      setItems((list) =>
        list.map((item) => (item.id === id ? { ...item, ...value } : item))
      );
      setInvalid((list) => list.filter((p) => p !== id));
      setEdited(true);
    },
    []
  );

  const removeItem = useCallback((id: string) => {
    setItems((list) => list.filter((item) => item.id !== id));
    setInvalid((list) => list.filter((p) => p !== id));
    setEdited(true);
  }, []);

  const save = useCallback(async () => {
    const now = dayjs();
    const wrong = items
      .filter(
        (item) =>
          !item.integrationIds.length ||
          !item.content.trim() ||
          item.content.length > planItemLimit(item, channelLimits) ||
          !DATE.test(item.date) ||
          !TIME.test(item.time) ||
          !toLocalDate(item).isValid() ||
          !toLocalDate(item).isAfter(now)
      )
      .map((item) => item.id);

    setInvalid(wrong);
    if (wrong.length) {
      toaster.show(
        t(
          'ai_planner_fix_posts',
          'Some posts need a channel, a text within the limit or a date and time in the future. Fix the ones marked in red.'
        ),
        'warning'
      );
      return;
    }

    // aborted when the planner is closed, the drafts after the current one are not added
    const controller = new AbortController();
    abort.current = controller;
    setStep('saving');

    // one by one, a saved post leaves the list so trying again never adds it twice
    const total = items.length;
    let done = 0;
    for (const item of items) {
      setSaved({ done: done + 1, total });

      let response: Response | null = null;
      try {
        // never cancelled: the server can add the draft anyway, so the request
        // finishes and the calendar shows it even if the planner was closed
        response = await fetch('/posts', {
          method: 'POST',
          body: JSON.stringify(toDraft(item)),
        });
      } catch (err) {
        response = null;
      }

      if (response?.ok) {
        done++;
        setItems((list) => list.filter((p) => p.id !== item.id));
      }

      // the planner was closed while adding, the user still sees what was added
      if (controller.signal.aborted && done < total) {
        if (done) {
          reloadCalendarView();
          toaster.show(
            t(
              'ai_planner_added_partial',
              'Added {{done}} of {{total}} drafts to your calendar',
              { done, total }
            ),
            'warning'
          );
        }
        return;
      }

      if (!response?.ok) {
        // the upgrade dialog was already shown
        if (response?.status !== 402) {
          const { message } = response
            ? await response.json().catch(() => ({} as any))
            : ({} as any);
          const serverMessage = typeof message === 'string' ? message : '';
          toaster.show(
            done
              ? `${t(
                  'ai_planner_partial',
                  'Added {{done}} of {{total}} drafts. Fix the remaining posts and try again.',
                  { done, total }
                )} ${serverMessage}`.trim()
              : serverMessage ||
                  t(
                    'ai_planner_save_failed',
                    'Could not add the drafts, please try again.'
                  ),
            'warning'
          );
        }
        // the drafts added before the failure show in the calendar
        if (done) {
          reloadCalendarView();
        }
        setInvalid([item.id]);
        setStep('review');
        return;
      }
    }

    reloadCalendarView();
    toaster.show(
      t('ai_planner_added', '{{count}} drafts added to your calendar', {
        count: total,
        defaultValue_one: '{{count}} draft added to your calendar',
      }),
      'success'
    );
    // already closed when it was closed while adding the last one
    if (!controller.signal.aborted) {
      modal.closeAll();
    }
  }, [items, channelLimits, fetch, toaster, reloadCalendarView, modal, t]);

  if (step === 'generating') {
    return (
      <div className="flex flex-col items-center justify-center gap-[16px] py-[60px] text-center">
        <Spinner width={40} height={40} />
        <div className="text-[16px] animate-pulse">{progress}</div>
        <div className="text-[14px] text-textItemBlur">
          {t(
            'ai_planner_wait',
            'This can take a minute or two, keep this window open.'
          )}
        </div>
        <Button secondary={true} onClick={cancel}>
          {t('cancel', 'Cancel')}
        </Button>
      </div>
    );
  }

  if (step === 'review' || step === 'saving') {
    const saving = step === 'saving';
    return (
      <div className="flex flex-col gap-[16px]">
        <AiPlannerReview
          items={items}
          channels={planChannels}
          channelLimits={channelLimits}
          brandVoice={brandVoice}
          minDate={tomorrow}
          maxDate={planRange.endDate}
          invalidIds={invalid}
          disabled={saving}
          onChange={updateItem}
          onRemove={removeItem}
        />
        <div className="text-[14px] text-textItemBlur">
          {t(
            'ai_planner_drafts_info',
            'Posts are saved as drafts. Nothing is published until you open a draft, add images or videos if needed, and schedule it.'
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-[8px]">
          {saving && (
            <div className="flex-1 text-[14px] animate-pulse">
              {t('ai_planner_saving', 'Adding {{done}} of {{total}}...', saved)}
            </div>
          )}
          <Button
            secondary={true}
            disabled={saving}
            onClick={() => setStep('form')}
          >
            {t('back', 'Back')}
          </Button>
          <Button secondary={true} disabled={saving} onClick={regenerate}>
            {t('regenerate', 'Regenerate')}
          </Button>
          <Button onClick={save} loading={saving} disabled={!items.length}>
            {t('ai_planner_add_drafts', 'Add to calendar as drafts')}
          </Button>
        </div>
      </div>
    );
  }

  // no <form>: the modal can open on pages that already have one
  return (
    <FormProvider {...form}>
      <div className="flex flex-col gap-[16px]">
        <div className="text-[14px] text-textItemBlur">
          {t(
            'ai_planner_description',
            'Tell the AI what you want to talk about. It plans the posts of the period and writes them, then you review them before they are added to your calendar as drafts.'
          )}
        </div>

        <div className="flex flex-col gap-[8px]">
          <div className="flex items-center gap-[12px]">
            <div className="flex-1 text-[14px]">
              {t('ai_planner_channels', 'Channels')}
            </div>
            <button
              type="button"
              className="text-[14px] underline cursor-pointer"
              onClick={() =>
                setChannels(
                  channels.slice(0, AI_PLANNER_MAX_CHANNELS).map((p) => p.id)
                )
              }
            >
              {t('ai_planner_select_all', 'Select all')}
            </button>
            <button
              type="button"
              className="text-[14px] underline cursor-pointer"
              onClick={() => setChannels([])}
            >
              {t('ai_planner_clear', 'Clear')}
            </button>
          </div>
          <div className="flex flex-wrap gap-[12px] mobile:hidden">
            {channels.map((integration) => (
              <ChannelAvatar
                key={integration.id}
                integration={integration}
                size={42}
                selected={selected.includes(integration.id)}
                onClick={toggleChannel(integration.id)}
              />
            ))}
          </div>
          <div className="hidden mobile:flex flex-col gap-[4px]">
            {channels.map((integration) => (
              <IntegrationListRow
                key={integration.id}
                integration={integration}
                selected={selected.includes(integration.id)}
                onClick={toggleChannel(integration.id)}
              />
            ))}
          </div>
          <div className="text-red-400 text-[12px]">
            {channelsError || <>&nbsp;</>}
          </div>
        </div>

        <div className="flex flex-col gap-[6px]">
          <div className="grid grid-cols-3 mobile:grid-cols-1 gap-[16px]">
            <Input
              label={t('ai_planner_start_date', 'Start date')}
              name="startDate"
              type="date"
              min={tomorrow}
              removeError={true}
            />
            <Input
              label={t('ai_planner_end_date', 'End date')}
              name="endDate"
              type="date"
              min={startDate}
              max={
                DATE.test(startDate || '')
                  ? dayjs(startDate)
                      .add(AI_PLANNER_MAX_DAYS - 1, 'day')
                      .format('YYYY-MM-DD')
                  : undefined
              }
              removeError={true}
            />
            <Select
              label={t('ai_planner_posts_per_week', 'Posts per week')}
              name="postsPerWeek"
              extraForm={{ valueAsNumber: true }}
              hideErrors={true}
            >
              {[...new Array(AI_PLANNER_MAX_POSTS_PER_WEEK)].map((_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1}
                </option>
              ))}
            </Select>
          </div>
          <div
            className={clsx(
              'text-[12px]',
              rangeError ? 'text-red-400' : 'text-textItemBlur'
            )}
          >
            {rangeError ||
              t('ai_planner_estimate', 'About {{count}} posts will be planned', {
                count: plannedPostsCount(+postsPerWeek || 1, days),
                defaultValue_one: 'About {{count}} post will be planned',
              })}
          </div>
        </div>

        <Textarea
          label={t('ai_planner_goals', 'Goals and topics')}
          name="goals"
          maxLength={2000}
          className="!min-h-[110px]"
          // replaces the raw message of the validator
          error={
            !goalsMissing ? (
              <>&nbsp;</>
            ) : goalsTouched ? (
              goalsHint
            ) : (
              <span className="text-textItemBlur">{goalsHint}</span>
            )
          }
          placeholder={t(
            'ai_planner_goals_placeholder',
            'What do you want to talk about this month? Products, events, offers, the audience you want to reach...'
          )}
        />

        <div className="flex flex-col gap-[8px]">
          <div className="text-[14px]">
            {t('ai_planner_content_mix', 'Content mix (optional)')}
          </div>
          <div className="flex flex-wrap gap-[16px]">
            {plannerContentMix.map((mix) => (
              <Checkbox
                key={mix}
                disableForm={true}
                checked={!!contentMix?.includes(mix)}
                onChange={toggleMix(mix)}
                label={categoryLabels[mix]}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 mobile:grid-cols-1 gap-[16px]">
          <Select
            label={t('ai_planner_language', 'Language')}
            name="language"
            hideErrors={true}
          >
            {plannerLanguages.map((language) => (
              <option key={language.code} value={language.code}>
                {language.native}
              </option>
            ))}
          </Select>
        </div>

        {!!brandKit && (
          <div className="text-[14px] text-textItemBlur">
            {hasBrandVoice ? (
              t(
                'ai_planner_uses_brand_voice',
                'Your brand voice from the brand kit will be used.'
              )
            ) : (
              <>
                {t(
                  'ai_planner_no_brand_voice',
                  'Tip: set your brand voice in Settings > Brand kit for posts that sound like you.'
                )}{' '}
                <a
                  href="/settings?tab=brand_kit"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {t('ai_planner_open_brand_kit', 'Open the brand kit')}
                </a>
              </>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-[8px]">
          {!!items.length && (
            <Button secondary={true} onClick={() => setStep('review')}>
              {t('ai_planner_back_to_plan', 'Back to the plan')}
            </Button>
          )}
          <Button
            onClick={form.handleSubmit(submit)}
            disabled={
              !form.formState.isValid ||
              !!rangeError ||
              !!channelsError ||
              goalsMissing
            }
          >
            {t('ai_planner_generate', 'Generate plan')}
          </Button>
        </div>
      </div>
    </FormProvider>
  );
};
