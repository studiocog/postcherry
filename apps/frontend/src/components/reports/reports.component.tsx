'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { groupBy, sortBy, uniq } from 'lodash';
import Link from 'next/link';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import SafeImage from '@gitroom/react/helpers/safe.image';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { getTimezone } from '@gitroom/frontend/components/layout/set.timezone';
import { useBrandKit } from '@gitroom/frontend/components/settings/brand-kit.component';
import {
  EmailReportResult,
  reportLimits,
} from '@gitroom/nestjs-libraries/dtos/reports/report.dto';

dayjs.extend(utc);
dayjs.extend(timezone);

type Preset =
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'last_month'
  | 'custom';

interface ReportChannelOption {
  id: string;
  name: string;
  identifier: string;
  picture: string;
  disabled: boolean;
  refreshNeeded: boolean;
  inBetweenSteps: boolean;
  customer?: { id: string; name: string } | null;
}

interface ReportBody {
  startDate: string;
  endDate: string;
  integrations: string[];
  timezone: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const useOrganizations = () => {
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

// Its own key (like the Analytics page) so a failed load is an error, not an empty list
const useReportChannels = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    const response = await fetch('/integrations/list');
    if (!response.ok) {
      throw new Error('Could not load the channels');
    }

    const { integrations } = await response.json();
    if (!Array.isArray(integrations)) {
      throw new Error('Could not load the channels');
    }

    return integrations as ReportChannelOption[];
  }, [fetch]);

  return useSWR<ReportChannelOption[]>('reports-channels', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    revalidateOnMount: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    // the page shows the error with a retry button instead of retrying in the background
    shouldRetryOnError: false,
  });
};

// Both actions only run when the user clicks, nothing is sent automatically
const useReportActions = () => {
  const fetch = useFetch();

  const downloadPdf = useCallback(
    (body: ReportBody) =>
      fetch('/reports/pdf', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { Accept: 'application/pdf' },
      }),
    [fetch]
  );

  const emailReport = useCallback(
    (body: ReportBody & { to: string }) =>
      fetch('/reports/email', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    [fetch]
  );

  return { downloadPdf, emailReport };
};

// The range in the timezone of the user: whole days, today included
const toRange = (preset: Preset, from: string, to: string) => {
  const tz = getTimezone();
  const today = dayjs().tz(tz);

  switch (preset) {
    case 'last_7_days':
    case 'last_30_days':
    case 'last_90_days': {
      const days = { last_7_days: 7, last_30_days: 30, last_90_days: 90 }[
        preset
      ];
      return {
        start: today.startOf('day').subtract(days - 1, 'day'),
        end: today.endOf('day'),
      };
    }
    case 'last_month': {
      const month = today.subtract(1, 'month');
      return { start: month.startOf('month'), end: month.endOf('month') };
    }
    case 'custom':
      return from && to
        ? {
            start: dayjs.tz(from, tz).startOf('day'),
            end: dayjs.tz(to, tz).endOf('day'),
          }
        : null;
  }
};

const Card: FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <div className="border border-newTableBorder rounded-[8px] p-[16px] bg-newBgColorInner flex flex-col gap-[12px] min-w-0">
    <div className="text-[16px] font-[600]">{title}</div>
    {children}
  </div>
);

export const ReportsComponent: FC = () => {
  const t = useT();
  const toaster = useToaster();
  const user = useUser();
  const {
    data: integrations,
    error: channelsError,
    isLoading,
    isValidating: reloadingChannels,
    mutate: reloadChannels,
  } = useReportChannels();
  const { data: brandKit } = useBrandKit();
  const { data: organizations } = useOrganizations();
  const { downloadPdf, emailReport } = useReportActions();

  const [preset, setPreset] = useState<Preset>('last_30_days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  // null until the user changes the selection: every channel is selected by default
  const [selected, setSelected] = useState<string[] | null>(null);
  const [email, setEmail] = useState('');
  const [working, setWorking] = useState<'pdf' | 'email' | null>(null);

  const channels: ReportChannelOption[] = useMemo(
    () => sortBy(integrations || [], (channel) => channel.name.toLowerCase()),
    [integrations]
  );
  const allIds = useMemo(() => channels.map((channel) => channel.id), [
    channels,
  ]);
  const selectedIds = selected ?? allIds;

  // agencies report per client: channels are grouped by customer when there are customers
  const groups = useMemo(() => {
    if (!channels.some((channel) => channel.customer)) {
      return [{ id: '', name: '', channels }];
    }

    // customers by name, the channels without a customer last
    return sortBy(
      Object.values(
        groupBy(channels, (channel) => channel.customer?.id || '')
      ).map((list) => ({
        id: list[0].customer?.id || '',
        name:
          list[0].customer?.name ||
          t('reports_no_customer', 'Without a customer'),
        channels: list,
      })),
      [(group) => !group.id, (group) => group.name.toLowerCase()]
    );
  }, [channels, t]);

  const range = useMemo(
    () => toRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );
  const rangeError = useMemo(() => {
    if (!range || !range.start.isBefore(range.end)) {
      return t(
        'reports_invalid_range',
        'Please choose a valid date range (up to one year).'
      );
    }
    if (range.end.diff(range.start, 'day') + 1 > reportLimits.maxDays) {
      return t(
        'reports_invalid_range',
        'Please choose a valid date range (up to one year).'
      );
    }
    return '';
  }, [range, t]);

  const toggle = useCallback(
    (ids: string[], value: boolean) => {
      setSelected((current) => {
        const base = current ?? allIds;
        return value
          ? uniq([...base, ...ids])
          : base.filter((id) => !ids.includes(id));
      });
    },
    [allIds]
  );

  const brandName =
    brandKit?.name ||
    organizations?.find((org) => org.id === user?.orgId)?.name ||
    '';
  const logo = brandKit?.logo?.path;

  const canCreate = !!selectedIds.length && !rangeError && !working;
  const emailValid = EMAIL_PATTERN.test(email.trim());

  const reportBody = useCallback((): ReportBody | null => {
    if (!range) {
      return null;
    }

    return {
      startDate: range.start.toISOString(),
      endDate: range.end.toISOString(),
      // every channel is sent as "all", so a large workspace never hits the list limit
      integrations: selectedIds.length === allIds.length ? [] : selectedIds,
      timezone: getTimezone(),
    };
  }, [range, selectedIds, allIds]);

  const errorMessage = useCallback(
    async (response: Response, fallback: string) => {
      const { message } = await response.json().catch(() => ({}));
      if (message === 'invalid_range' || message === 'range_too_long') {
        return t(
          'reports_invalid_range',
          'Please choose a valid date range (up to one year).'
        );
      }
      if (message === 'no_channels') {
        return t('reports_select_channel', 'Select at least one channel');
      }
      return fallback;
    },
    [t]
  );

  const download = useCallback(async () => {
    const body = reportBody();
    if (!body || !canCreate) {
      return;
    }

    setWorking('pdf');
    try {
      const response = await downloadPdf(body);
      const failed = t(
        'reports_download_failed',
        'We could not create the report. Please try again.'
      );
      if (!response.ok) {
        toaster.show(await errorMessage(response, failed), 'warning');
        return;
      }

      const filename =
        /filename="([^"]+)"/.exec(
          response.headers.get('Content-Disposition') || ''
        )?.[1] ||
        `report-${range!.start.format('YYYY-MM-DD')}-${range!.end.format(
          'YYYY-MM-DD'
        )}.pdf`;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toaster.show(t('reports_downloaded', 'Report downloaded'), 'success');
    } catch (err) {
      toaster.show(
        t(
          'reports_download_failed',
          'We could not create the report. Please try again.'
        ),
        'warning'
      );
    } finally {
      setWorking(null);
    }
  }, [reportBody, canCreate, downloadPdf, errorMessage, range, toaster, t]);

  const send = useCallback(async () => {
    const body = reportBody();
    const to = email.trim();
    if (!body || !canCreate || !EMAIL_PATTERN.test(to)) {
      return;
    }

    const failed = t(
      'reports_email_failed',
      'The email could not be sent. Please check the address and try again.'
    );
    setWorking('email');
    try {
      const response = await emailReport({ ...body, to });
      if (response.status === 429) {
        toaster.show(
          t(
            'reports_email_rate_limited',
            'Too many report emails. Please try again in an hour.'
          ),
          'warning'
        );
        return;
      }
      if (!response.ok) {
        toaster.show(await errorMessage(response, failed), 'warning');
        return;
      }

      const result: EmailReportResult = await response.json();
      if (result.sent) {
        toaster.show(
          t('reports_email_sent', 'Report sent to {{email}}', { email: to }),
          'success'
        );
        setEmail('');
        return;
      }

      toaster.show(
        'reason' in result && result.reason === 'not_configured'
          ? t(
              'reports_email_not_configured',
              'Email is not set up on this server yet, so the report could not be sent.'
            )
          : failed,
        'warning'
      );
    } catch (err) {
      toaster.show(failed, 'warning');
    } finally {
      setWorking(null);
    }
  }, [reportBody, email, canCreate, emailReport, errorMessage, toaster, t]);

  const presets: { key: Preset; label: string }[] = [
    { key: 'last_7_days', label: t('last_7_days', 'Last 7 days') },
    { key: 'last_30_days', label: t('last_30_days', 'Last 30 days') },
    { key: 'last_90_days', label: t('last_90_days', 'Last 90 days') },
    { key: 'last_month', label: t('last_month', 'Last month') },
    { key: 'custom', label: t('custom', 'Custom') },
  ];
  const today = dayjs().tz(getTimezone()).format('YYYY-MM-DD');

  if (isLoading && !channelsError) {
    return (
      <div className="bg-newBgColorInner p-[20px] flex flex-1 items-center justify-center">
        <LoadingComponent />
      </div>
    );
  }

  return (
    <div className="bg-newBgColorInner p-[20px] mobile:p-[12px] flex flex-1 flex-col gap-[16px] text-textColor min-w-0">
      <div className="flex flex-col gap-[4px]">
        <h2 className="text-[20px] font-[600]">{t('reports', 'Reports')}</h2>
        <div className="text-[14px] text-textItemBlur">
          {t(
            'reports_description',
            'Download a PDF report for your clients or your team, with your own logo and colors.'
          )}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,380px)] tablet:grid-cols-1 gap-[16px] items-start">
        <div className="flex flex-col gap-[16px] min-w-0">
          <Card title={t('reports_date_range', 'Date range')}>
            <div className="flex flex-wrap gap-[8px]">
              {presets.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setPreset(item.key)}
                  className={clsx(
                    'h-[32px] px-[12px] rounded-[8px] text-[13px] border cursor-pointer whitespace-nowrap',
                    preset === item.key
                      ? 'bg-forth text-white border-forth'
                      : 'bg-newBgColorInner text-textColor border-newTableBorder hover:bg-tableBorder'
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {preset === 'custom' && (
              <div className="flex flex-wrap gap-[12px]">
                <label className="flex flex-col gap-[6px]">
                  <span className="text-[12px] opacity-70">
                    {t('reports_from', 'From')}
                  </span>
                  <input
                    type="date"
                    value={customFrom}
                    max={customTo || today}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="bg-newBgColorInner h-[38px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
                  />
                </label>
                <label className="flex flex-col gap-[6px]">
                  <span className="text-[12px] opacity-70">{t('reports_to', 'To')}</span>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom}
                    max={today}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="bg-newBgColorInner h-[38px] border border-newTableBorder rounded-[8px] px-[10px] text-[14px] text-textColor"
                  />
                </label>
              </div>
            )}
            {!!range && !rangeError && (
              <div className="text-[13px] opacity-70">
                {range.start.format('MMM D, YYYY')} -{' '}
                {range.end.format('MMM D, YYYY')}
              </div>
            )}
            {!!rangeError && (preset !== 'custom' || (customFrom && customTo)) && (
              <div className="text-[13px] text-red-400">{rangeError}</div>
            )}
          </Card>

          <Card title={t('channels', 'Channels')}>
            {channelsError ? (
              <div className="flex flex-col items-start gap-[8px]">
                <div className="text-[13px] text-red-400">
                  {t(
                    'reports_channels_failed',
                    'We could not load your channels. Please try again.'
                  )}
                </div>
                <Button
                  secondary={true}
                  onClick={() => reloadChannels()}
                  loading={reloadingChannels}
                  className="rounded-[8px]"
                >
                  {t('try_again', 'Try again')}
                </Button>
              </div>
            ) : !channels.length ? (
              <div className="text-[13px] opacity-70">
                {t(
                  'reports_no_channels',
                  'Add a channel first to create a report.'
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-[16px] text-[13px]">
                  <button
                    type="button"
                    className="text-forth hover:underline cursor-pointer"
                    onClick={() => setSelected(allIds)}
                  >
                    {t('select_all', 'Select all')}
                  </button>
                  <button
                    type="button"
                    className="text-forth hover:underline cursor-pointer"
                    onClick={() => setSelected([])}
                  >
                    {t('clear', 'Clear')}
                  </button>
                  <div className="opacity-70">
                    {t('reports_selected_count', '{{count}} of {{total}} selected', {
                      count: selectedIds.length,
                      total: allIds.length,
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-[16px]">
                  {groups.map((group) => {
                    const ids = group.channels.map((channel) => channel.id);
                    const selectedCount = ids.filter((id) =>
                      selectedIds.includes(id)
                    ).length;
                    const allSelected = selectedCount === ids.length;
                    return (
                      <div key={group.id} className="flex flex-col gap-[8px]">
                        {!!group.name && (
                          <label className="flex items-center gap-[10px] cursor-pointer self-start">
                            <input
                              type="checkbox"
                              className="w-[18px] h-[18px] accent-forth cursor-pointer shrink-0"
                              checked={allSelected}
                              ref={(input) => {
                                // only some channels of the customer are selected
                                if (input) {
                                  input.indeterminate =
                                    !!selectedCount && !allSelected;
                                }
                              }}
                              onChange={(e) => toggle(ids, e.target.checked)}
                            />
                            <span className="text-[14px] font-[600]">
                              {group.name}
                            </span>
                          </label>
                        )}
                        <div
                          className={clsx(
                            'grid grid-cols-2 mobile:grid-cols-1 gap-[8px]',
                            !!group.name && 'ps-[28px]'
                          )}
                        >
                          {group.channels.map((channel) => (
                            <label
                              key={channel.id}
                              className="flex items-center gap-[10px] min-w-0 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                className="w-[18px] h-[18px] accent-forth cursor-pointer shrink-0"
                                checked={selectedIds.includes(channel.id)}
                                onChange={(e) =>
                                  toggle([channel.id], e.target.checked)
                                }
                              />
                              <div
                                className={clsx(
                                  'relative shrink-0',
                                  (channel.disabled ||
                                    channel.refreshNeeded ||
                                    channel.inBetweenSteps) &&
                                    'opacity-50'
                                )}
                              >
                                <ImageWithFallback
                                  fallbackSrc={`/icons/platforms/${channel.identifier}.png`}
                                  src={channel.picture}
                                  className="rounded-[8px]"
                                  alt=""
                                  width={28}
                                  height={28}
                                />
                                <SafeImage
                                  src={`/icons/platforms/${channel.identifier}.png`}
                                  className="rounded-[4px] absolute z-10 -bottom-[4px] -end-[4px] border border-fifth"
                                  alt={channel.identifier}
                                  width={14}
                                  height={14}
                                />
                              </div>
                              <span
                                className={clsx(
                                  'flex-1 text-[14px] whitespace-nowrap text-ellipsis overflow-hidden',
                                  channel.disabled && 'opacity-50'
                                )}
                              >
                                {channel.name}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {!!channels.length && !selectedIds.length && (
              <div className="text-[13px] text-red-400">
                {t('reports_select_channel', 'Select at least one channel')}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-[16px] min-w-0">
          <Card title={t('reports_cover', 'Cover')}>
            <div className="rounded-[8px] border border-newTableBorder bg-white flex flex-col gap-[10px] p-[16px] min-w-0 overflow-hidden">
              <div
                className="h-[6px] -mx-[16px] -mt-[16px] mb-[6px]"
                style={{ backgroundColor: brandKit?.primaryColor || '#1F2937' }}
              />
              {!!logo && (
                <img
                  src={logo}
                  alt={brandName}
                  className="max-h-[48px] max-w-[160px] object-contain self-start"
                />
              )}
              {!!brandName && (
                <div
                  className="text-[20px] font-[600] break-words"
                  style={{ color: brandKit?.primaryColor || '#111827' }}
                >
                  {brandName}
                </div>
              )}
              <div className="text-[13px] text-[#6B7280]">
                {t('reports_social_media_report', 'Social media report')}
              </div>
            </div>
            {!logo && (
              <div className="text-[13px] opacity-70">
                {t(
                  'reports_add_brand_kit',
                  'Add your logo and colors in Settings > Brand kit to put them on the report.'
                )}{' '}
                <Link
                  href="/settings?tab=brand_kit"
                  className="text-forth hover:underline"
                >
                  {t('brand_kit', 'Brand kit')}
                </Link>
              </div>
            )}
          </Card>

          <Card title={t('reports_create', 'Create the report')}>
            <Button
              onClick={download}
              disabled={!canCreate}
              loading={working === 'pdf'}
              className="rounded-[8px]"
            >
              {t('reports_download_pdf', 'Download PDF')}
            </Button>
            <div className="text-[13px] opacity-70">
              {t(
                'reports_generation_time',
                'Creating the report can take up to a minute while we load statistics from each platform.'
              )}
            </div>
            <div className="border-t border-newTableBorder pt-[12px] flex flex-col gap-[8px]">
              <div className="flex items-end gap-[8px]">
                <div className="flex-1 min-w-0">
                  <Input
                    disableForm={true}
                    removeError={true}
                    type="email"
                    name="report_email"
                    label={t('reports_email_label', 'Email this report')}
                    placeholder="name@company.com"
                    value={email}
                    maxLength={254}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        send();
                      }
                    }}
                  />
                </div>
                <Button
                  secondary={true}
                  onClick={send}
                  disabled={!canCreate || !emailValid}
                  loading={working === 'email'}
                  className="rounded-[8px] h-[42px]"
                >
                  {t('send', 'Send')}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
