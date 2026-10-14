import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Organization } from '@prisma/client';
import { chunk, escape } from 'lodash';
import sharp from 'sharp';
import { readFile, stat } from 'fs/promises';
import { resolve, sep } from 'path';
import { ReportsRepository } from '@gitroom/nestjs-libraries/database/prisma/reports/reports.repository';
import {
  formatReportDate,
  readableBrandColor,
  ReportPdfService,
} from '@gitroom/nestjs-libraries/database/prisma/reports/report.pdf.service';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { BrandKitService } from '@gitroom/nestjs-libraries/database/prisma/brand-kit/brand-kit.service';
import { BrandKitView } from '@gitroom/nestjs-libraries/dtos/brand-kit/brand-kit.dto';
import { EmailService } from '@gitroom/nestjs-libraries/services/email.service';
import { AnalyticsData } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import {
  EmailReportDto,
  EmailReportResult,
  reportLimits,
  ReportRequestDto,
} from '@gitroom/nestjs-libraries/dtos/reports/report.dto';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { timer } from '@gitroom/helpers/utils/timer';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { getSsrfSafeAxios } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

const DAY = 24 * 60 * 60 * 1000;

// Platforms report the last 7, 30 or 90 days ending today (what the Analytics page offers)
const STATS_WINDOWS = [7, 30, 90];
// Platform calls are bounded so a report stays under the usual 60s proxy timeout
const STATS_MAX_CHANNELS = 30;
const STATS_CONCURRENCY = 4;
const STATS_CHANNEL_TIMEOUT = 15000;
const STATS_TOTAL_BUDGET = 40000;
const STATS_MAX_METRICS = 8;

const RECENT_POSTS = 15;
const POST_TEXT_LENGTH = 220;
const LOGO_MAX_BYTES = 5 * 1024 * 1024;
const EMAILS_PER_HOUR = 10;
const EMAILS_PER_USER_PER_HOUR = 20;
const EMAIL_CHANNELS = 20;

// Neutral colors for a workspace without a brand kit
const DEFAULT_COLORS = {
  primary: '#1F2937',
  secondary: '#6B7280',
  accent: '#2563EB',
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export type ReportStatsReason =
  | 'not_supported'
  | 'no_data'
  | 'timeout'
  | 'needs_reconnect'
  | 'out_of_window'
  | 'limit';

export type ReportChannelStats =
  | { status: 'ok'; days: number; metrics: { label: string; value: string }[] }
  | { status: 'not_available'; reason: ReportStatsReason };

export interface ReportChannel {
  id: string;
  name: string;
  platform: string;
  published: number;
  scheduled: number;
  stats: ReportChannelStats;
}

export interface ReportPost {
  date: Date;
  channelName: string;
  platform: string;
  text: string;
  url: string | null;
}

// What a report is made of, the PDF renderer only draws this
export interface ReportData {
  brand: {
    name: string;
    logo: Buffer | null;
    website: string | null;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  };
  range: { start: Date; end: Date; timezone: string };
  generatedAt: Date;
  summary: { published: number; scheduled: number; channels: number };
  // null when the range starts more than 90 days ago, no platform is asked then
  statsWindow: { days: number; start: Date; end: Date } | null;
  channels: ReportChannel[];
  posts: ReportPost[];
}

const notAvailable = (reason: ReportStatsReason): ReportChannelStats => ({
  status: 'not_available',
  reason,
});

const toColor = (color: string | null | undefined, fallback: string) =>
  color && HEX_COLOR.test(color) ? color : fallback;

// Only a timezone the server knows is used, anything else prints UTC dates
const toTimezone = (timezone?: string) => {
  if (!timezone) {
    return 'UTC';
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return timezone;
  } catch (err) {
    return 'UTC';
  }
};

// YYYY-MM-DD in the timezone of the report
const isoDate = (date: Date, timezone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

const slug = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '') || 'social-media';

// Same totals as the Analytics page: the sum of the period, or the mean for metrics that are averages.
// percentageChange is not used, several providers return a fixed value
const toMetrics = (data: AnalyticsData[]) =>
  (data || [])
    .flatMap((item) => {
      const values = (item?.data || [])
        .map((point) => Number(point?.total))
        .filter((value) => Number.isFinite(value));

      if (!item?.label || !values.length) {
        return [];
      }

      const sum = values.reduce((total, value) => total + value, 0);
      return [
        {
          label: item.label,
          value: (item as AnalyticsData & { average?: boolean }).average
            ? `${(sum / values.length).toFixed(2)}%`
            : new Intl.NumberFormat('en-US').format(Math.round(sum)),
        },
      ];
    })
    .slice(0, STATS_MAX_METRICS);

@Injectable()
export class ReportsService {
  constructor(
    private _reportsRepository: ReportsRepository,
    private _integrationService: IntegrationService,
    private _integrationManager: IntegrationManager,
    private _brandKitService: BrandKitService,
    private _emailService: EmailService,
    private _reportPdfService: ReportPdfService
  ) {}

  // The numbers and posts of a report, without the PDF
  async buildReportData(
    org: Organization,
    body: ReportRequestDto
  ): Promise<ReportData> {
    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    if (
      isNaN(start.getTime()) ||
      isNaN(end.getTime()) ||
      start >= end ||
      end.getTime() > Date.now() + DAY
    ) {
      throw new BadRequestException('invalid_range');
    }

    // a day of slack for timezones and daylight saving changes
    if (end.getTime() - start.getTime() > (reportLimits.maxDays + 1) * DAY) {
      throw new BadRequestException('range_too_long');
    }

    const channels = await this._reportsRepository.getReportChannels(
      org.id,
      body.integrations
    );
    if (!channels.length) {
      throw new BadRequestException('no_channels');
    }

    const ids = channels.map((channel) => channel.id);
    const [published, scheduled, posts, brand] = await Promise.all([
      this._reportsRepository.countPublishedByChannel(org.id, ids, start, end),
      this._reportsRepository.countScheduledByChannel(org.id, ids, new Date()),
      this._reportsRepository.getRecentPublishedPosts(
        org.id,
        ids,
        start,
        end,
        RECENT_POSTS
      ),
      this.loadBrand(org),
    ]);

    const publishedById = new Map(
      published.map((row) => [row.integrationId, row._count._all])
    );
    const scheduledById = new Map(
      scheduled.map((row) => [row.integrationId, row._count._all])
    );

    const statsWindow = this.statsWindow(start);
    const stats = await this.loadChannelStats(org, channels, statsWindow);

    const reportChannels: ReportChannel[] = channels.map((channel) => ({
      id: channel.id,
      name: channel.customName || channel.name,
      platform: this.platformName(channel.providerIdentifier),
      published: publishedById.get(channel.id) || 0,
      scheduled: scheduledById.get(channel.id) || 0,
      stats: stats.get(channel.id) || notAvailable('no_data'),
    }));
    const channelById = new Map(
      reportChannels.map((channel) => [channel.id, channel])
    );

    return {
      brand,
      range: { start, end, timezone: toTimezone(body.timezone) },
      generatedAt: new Date(),
      summary: {
        published: reportChannels.reduce((all, p) => all + p.published, 0),
        scheduled: reportChannels.reduce((all, p) => all + p.scheduled, 0),
        channels: reportChannels.length,
      },
      statsWindow,
      channels: reportChannels,
      posts: posts.map((post) => {
        const channel = channelById.get(post.integrationId);
        const text = stripHtmlValidation(
          'normal',
          post.content || '',
          false,
          true
        )
          .replace(/\s+/g, ' ')
          .trim();

        return {
          date: post.publishDate,
          channelName: channel?.name || '',
          platform: channel?.platform || '',
          text:
            text.length > POST_TEXT_LENGTH
              ? `${text.slice(0, POST_TEXT_LENGTH).trimEnd()}...`
              : text,
          url: /^https?:\/\//i.test(post.releaseURL || '')
            ? post.releaseURL
            : null,
        };
      }),
    };
  }

  async generatePdf(
    org: Organization,
    body: ReportRequestDto
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { buffer, filename } = await this.createReport(org, body);
    return { buffer, filename };
  }

  // Only called when a user clicks "Email this report", never automatically.
  // Follow-up (not built): monthly sending needs an opt-in schedule and a NEW Temporal
  // workflow + activity that call this method, the existing workflows stay untouched.
  // The email always comes from the platform sender (EMAIL_FROM_NAME), the brand name
  // is only in the subject and the body, so nobody can pick the "from" name of an email
  async emailReport(
    org: Organization,
    userId: string,
    body: EmailReportDto
  ): Promise<EmailReportResult> {
    if (!this._emailService.hasProvider() || !process.env.EMAIL_FROM_ADDRESS) {
      return { sent: false, reason: 'not_configured' };
    }

    // per workspace, and per user so more workspaces do not mean more emails
    if (
      !(await this.underHourlyLimit(
        `reports:email:${org.id}`,
        EMAILS_PER_HOUR
      )) ||
      !(await this.underHourlyLimit(
        `reports:email:user:${userId}`,
        EMAILS_PER_USER_PER_HOUR
      ))
    ) {
      throw new HttpException(
        'too_many_report_emails',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const { data, buffer, filename } = await this.createReport(org, body);
    const range = this.rangeLabel(data);
    const sent = await this._emailService.sendEmailWithAttachments(
      body.to,
      `${data.brand.name.replace(/\s+/g, ' ')} - social media report, ${range}`,
      this.emailHtml(data, range),
      [{ filename, content: buffer, contentType: 'application/pdf' }]
    );

    return sent ? { sent: true } : { sent: false, reason: 'failed' };
  }

  // Counts one more email for this hour, false once the limit is passed
  private async underHourlyLimit(key: string, limit: number) {
    const count = await ioRedis.incr(key);
    if (count === 1) {
      await ioRedis.expire(key, 3600);
    }
    return count <= limit;
  }

  private async createReport(org: Organization, body: ReportRequestDto) {
    const data = await this.buildReportData(org, body);
    const { timezone } = data.range;
    return {
      data,
      buffer: await this._reportPdfService.render(data),
      filename: `report-${slug(data.brand.name)}-${isoDate(
        data.range.start,
        timezone
      )}-${isoDate(data.range.end, timezone)}.pdf`,
    };
  }

  private rangeLabel(data: ReportData) {
    const { start, end, timezone } = data.range;
    return `${formatReportDate(start, timezone)} - ${formatReportDate(
      end,
      timezone
    )}`;
  }

  // A short summary, the full report is the attached PDF. No app name and no remote images
  private emailHtml(data: ReportData, range: string) {
    const summary: [string, number][] = [
      ['Posts published', data.summary.published],
      ['Upcoming scheduled posts', data.summary.scheduled],
      ['Channels in this report', data.summary.channels],
    ];
    const more = data.channels.length - EMAIL_CHANNELS;

    return `
    <div style="font-family: Helvetica, Arial, sans-serif; color: #111827; max-width: 560px;">
      <h1 style="font-size: 22px; margin: 0 0 8px; color: ${readableBrandColor(
        data.brand.primaryColor
      )};">${escape(data.brand.name)}</h1>
      <p style="margin: 0 0 16px; color: #374151;">Social media report for ${escape(
        range
      )}.</p>
      <table cellpadding="6" cellspacing="0" style="border-collapse: collapse; margin: 0 0 16px;">
        ${summary
          .map(
            ([label, value]) =>
              `<tr><td style="color: #6B7280;">${label}</td><td style="font-weight: bold;">${value}</td></tr>`
          )
          .join('')}
      </table>
      <p style="margin: 0 0 6px; font-weight: bold;">Posts published per channel</p>
      <ul style="margin: 0 0 16px; padding-left: 18px;">
        ${data.channels
          .slice(0, EMAIL_CHANNELS)
          .map(
            (channel) =>
              `<li>${escape(channel.name)} (${escape(channel.platform)}): ${
                channel.published
              }</li>`
          )
          .join('')}
        ${more > 0 ? `<li>${more} more channels</li>` : ''}
      </ul>
      <p style="margin: 0; color: #374151;">The full report is attached as a PDF.</p>
    </div>`;
  }

  // A brand kit problem never breaks a report, the neutral cover is used instead
  private async loadBrand(org: Organization): Promise<ReportData['brand']> {
    let kit: BrandKitView | null = null;
    try {
      kit = await this._brandKitService.getBrandKit(org.id);
    } catch (err) {
      Logger.warn(`Could not load the brand kit of ${org.id}: ${err}`);
    }

    return {
      name: kit?.name || org.name,
      logo: kit?.logo?.path ? await this.loadLogo(kit.logo.path) : null,
      website: kit?.website || null,
      primaryColor: toColor(kit?.primaryColor, DEFAULT_COLORS.primary),
      secondaryColor: toColor(kit?.secondaryColor, DEFAULT_COLORS.secondary),
      accentColor: toColor(kit?.accentColor, DEFAULT_COLORS.accent),
    };
  }

  // The logo as a PNG pdfkit can embed, null on any problem (the report is made without it)
  private async loadLogo(path: string): Promise<Buffer | null> {
    try {
      const file = await this.readLogo(path);
      if (!file) {
        return null;
      }

      return await sharp(file)
        .resize({
          width: 600,
          height: 300,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
    } catch (err) {
      Logger.warn(`Could not load the logo for a report: ${err}`);
      return null;
    }
  }

  // The path comes from the brand kit, which only takes it from the media of the workspace
  private async readLogo(path: string): Promise<Buffer | null> {
    const localPrefix = `${process.env.FRONTEND_URL}/uploads/`;
    if (
      process.env.UPLOAD_DIRECTORY &&
      process.env.FRONTEND_URL &&
      path.startsWith(localPrefix)
    ) {
      // same confinement as the uploads route of the frontend
      const base = resolve(process.env.UPLOAD_DIRECTORY);
      const filePath = resolve(
        base,
        decodeURIComponent(path.slice(localPrefix.length).split('?')[0])
      );
      if (!filePath.startsWith(base + sep)) {
        return null;
      }

      if ((await stat(filePath)).size > LOGO_MAX_BYTES) {
        return null;
      }

      return readFile(filePath);
    }

    if (!path.startsWith('https://')) {
      return null;
    }

    const { data } = await getSsrfSafeAxios().get(path, {
      responseType: 'arraybuffer',
      timeout: 5000,
      maxContentLength: LOGO_MAX_BYTES,
      maxRedirects: 3,
    });
    return Buffer.from(data);
  }

  private platformName(identifier: string) {
    return (
      this._integrationManager.getSocialIntegration(identifier)?.name ||
      identifier
    ).replace(/\n/g, ' ');
  }

  // Platforms only report the last 7, 30 or 90 days ending today: the smallest window
  // that covers the start of the range is used, none when it starts more than 90 days ago
  private statsWindow(start: Date): ReportData['statsWindow'] {
    const now = new Date();
    const needed = Math.ceil((now.getTime() - start.getTime()) / DAY);
    const days = STATS_WINDOWS.find((window) => window >= needed);
    return days
      ? { days, start: new Date(now.getTime() - days * DAY), end: now }
      : null;
  }

  // Same path as the Analytics page (IntegrationService.checkAnalytics), with bounded calls:
  // channels that can not answer are skipped, at most STATS_MAX_CHANNELS channels,
  // STATS_CONCURRENCY at a time, each one and the whole loop time-limited
  private async loadChannelStats(
    org: Organization,
    channels: Awaited<ReturnType<ReportsRepository['getReportChannels']>>,
    window: ReportData['statsWindow']
  ) {
    const stats = new Map<string, ReportChannelStats>();
    if (!window) {
      for (const channel of channels) {
        stats.set(channel.id, notAvailable('out_of_window'));
      }
      return stats;
    }

    const eligible: string[] = [];
    for (const channel of channels) {
      if (channel.disabled || channel.refreshNeeded || channel.inBetweenSteps) {
        stats.set(channel.id, notAvailable('needs_reconnect'));
      } else if (
        channel.type !== 'social' ||
        !this._integrationManager.getSocialIntegration(
          channel.providerIdentifier
        )?.analytics
      ) {
        stats.set(channel.id, notAvailable('not_supported'));
      } else if (eligible.length >= STATS_MAX_CHANNELS) {
        stats.set(channel.id, notAvailable('limit'));
      } else {
        eligible.push(channel.id);
      }
    }

    const deadline = Date.now() + STATS_TOTAL_BUDGET;
    for (const group of chunk(eligible, STATS_CONCURRENCY)) {
      const timeLeft = Math.min(STATS_CHANNEL_TIMEOUT, deadline - Date.now());
      await Promise.all(
        group.map(async (id) => {
          stats.set(
            id,
            timeLeft > 0
              ? await this.loadChannelAnalytics(org, id, window.days, timeLeft)
              : notAvailable('timeout')
          );
        })
      );
    }

    return stats;
  }

  // A call that takes too long keeps running in the background and fills the analytics cache
  private async loadChannelAnalytics(
    org: Organization,
    id: string,
    days: number,
    timeout: number
  ): Promise<ReportChannelStats> {
    try {
      const data = await Promise.race([
        this._integrationService.checkAnalytics(org, id, String(days)),
        timer(timeout).then(() => null),
      ]);
      if (!data) {
        return notAvailable('timeout');
      }

      const metrics = toMetrics(data);
      return metrics.length
        ? { status: 'ok', days, metrics }
        : notAvailable('no_data');
    } catch (err) {
      Logger.warn(`Could not load the statistics of ${id} for a report: ${err}`);
      return notAvailable('no_data');
    }
  }
}
