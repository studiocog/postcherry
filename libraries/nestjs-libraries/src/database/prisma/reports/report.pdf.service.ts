/// <reference path="./pdfkit.d.ts" />
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
// types only, the reports service is the one that uses this renderer
import type {
  ReportChannel,
  ReportData,
  ReportStatsReason,
} from '@gitroom/nestjs-libraries/database/prisma/reports/reports.service';

// Only the fonts built into pdfkit, nothing is downloaded
const FONT = 'Helvetica';
const FONT_BOLD = 'Helvetica-Bold';

const TEXT = '#111827';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';
const ZEBRA = '#F3F4F6';
const WHITE = '#FFFFFF';

const MARGIN = 48;
const CELL_PADDING = 6;
const HEADER_ROW_HEIGHT = 22;
const ROW_HEIGHT = 20;
const POST_TEXT_LINES = 3;

const NOT_AVAILABLE: Record<ReportStatsReason, string> = {
  not_supported: 'this platform does not provide statistics',
  no_data: 'the platform returned no data',
  timeout: 'the platform did not answer in time',
  needs_reconnect: 'the channel needs to be reconnected',
  out_of_window: 'the date range starts more than 90 days ago',
  limit: 'too many channels selected',
};

// Built-in Helvetica only knows WinAnsi (cp1252): everything else (emoji, CJK, Arabic, Hebrew,
// Cyrillic...) is left out, so the PDF never shows broken glyphs
const WIN_ANSI_EXTRA = new Set(
  '\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178'
);

export const toPdfText = (value?: string | null) =>
  Array.from((value || '').replace(/\s+/g, ' '))
    .filter((char) => {
      const code = char.codePointAt(0)!;
      return (
        (code >= 0x20 && code <= 0x7e) ||
        (code >= 0xa0 && code <= 0xff) ||
        WIN_ANSI_EXTRA.has(char)
      );
    })
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();

// "Oct 14, 2026" in the timezone of the report
export const formatReportDate = (date: Date, timezone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);

const luminance = (color: string) => {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const value = parseInt(color.slice(index, index + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// A brand color used as text on white, a color too light to be read (contrast below 3:1)
// falls back to dark text
export const readableBrandColor = (color: string) =>
  1.05 / (luminance(color) + 0.05) >= 3 ? color : TEXT;

// Black or white text, whichever is easier to read on the color (same rule as the brand kit preview)
const textOn = (color: string) => (luminance(color) > 0.179 ? TEXT : WHITE);

const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-US').format(value);

// a name written only in characters the PDF font does not have
const channelName = (name: string) => toPdfText(name) || 'Channel';

interface TableColumn {
  label: string;
  width: number;
  align?: 'left' | 'right';
}

// Draws one report, a new writer is used for every PDF
class ReportPdfWriter {
  private readonly left = MARGIN;
  private readonly width: number;
  private readonly brandName: string;
  private readonly timezone: string;
  private readonly colors: {
    primary: string;
    secondary: string;
    accent: string;
    // the same colors when they are used as text on white
    primaryText: string;
    secondaryText: string;
    accentText: string;
    // text on a primary color background
    onPrimary: string;
  };

  constructor(private doc: PDFDocument, private data: ReportData) {
    this.width = doc.page.width - MARGIN * 2;
    this.brandName = toPdfText(data.brand.name);
    this.timezone = data.range.timezone;

    const { primaryColor, secondaryColor, accentColor } = data.brand;
    this.colors = {
      primary: primaryColor,
      secondary: secondaryColor,
      accent: accentColor,
      primaryText: readableBrandColor(primaryColor),
      secondaryText: readableBrandColor(secondaryColor),
      accentText: readableBrandColor(accentColor),
      onPrimary: textOn(primaryColor),
    };
  }

  write() {
    this.cover();
    this.summary();
    this.channelStatistics();
    this.recentPosts();
    this.footers();
  }

  private get bottom() {
    return this.doc.page.height - this.doc.page.margins.bottom;
  }

  private date(date: Date) {
    return formatReportDate(date, this.timezone);
  }

  // Starts a new page when the next block does not fit, so blocks are never split
  private ensureSpace(height: number) {
    if (this.doc.y + height <= this.bottom) {
      return false;
    }

    this.doc.addPage();
    return true;
  }

  // One line of text, cut with an ellipsis to fit the width in the current font
  private fit(text: string, width: number) {
    const { doc } = this;
    if (doc.widthOfString(text) <= width) {
      return text;
    }

    let end = text.length;
    while (end > 0 && doc.widthOfString(`${text.slice(0, end)}\u2026`) > width) {
      end--;
    }
    return end > 0 ? `${text.slice(0, end).trimEnd()}\u2026` : '';
  }

  // Single line cells never break lines, so they can never open a new page by themselves
  private cell(
    text: string,
    x: number,
    y: number,
    width: number,
    align: 'left' | 'right' = 'left',
    link?: string | null
  ) {
    const value = this.fit(toPdfText(text), width);
    if (!value) {
      return;
    }

    const textWidth = this.doc.widthOfString(value);
    const offset = align === 'right' ? width - textWidth : 0;
    this.doc.text(value, x + offset, y, { lineBreak: false });

    // the link option of text() needs the line wrapper (lineBreak: false gives it no width),
    // so the clickable area is added by hand
    if (link) {
      this.doc.link(
        x + offset,
        y,
        textWidth,
        this.doc.currentLineHeight(),
        link
      );
    }
  }

  private heading(title: string) {
    const { doc } = this;
    // a title is never left alone at the bottom of a page
    this.ensureSpace(90);

    doc
      .font(FONT_BOLD)
      .fontSize(16)
      .fillColor(this.colors.primaryText)
      .text(title, this.left, doc.y, { width: this.width });

    const y = doc.y + 4;
    doc.rect(this.left, y, 32, 3).fill(this.colors.accent);
    doc.y = y + 16;
  }

  private subheading(title: string) {
    const { doc } = this;
    this.ensureSpace(70);
    doc.font(FONT_BOLD).fontSize(11).fillColor(TEXT);
    this.cell(title, this.left, doc.y, this.width);
    doc.y += 20;
  }

  private paragraph(text: string) {
    const { doc } = this;
    doc
      .font(FONT)
      .fontSize(9)
      .fillColor(MUTED)
      .text(toPdfText(text), this.left, doc.y, { width: this.width });
    doc.y += 12;
  }

  private tableHeader(columns: TableColumn[]) {
    const { doc } = this;
    const top = doc.y;
    doc.rect(this.left, top, this.width, HEADER_ROW_HEIGHT).fill(this.colors.primary);
    doc.font(FONT_BOLD).fontSize(9).fillColor(this.colors.onPrimary);

    let x = this.left;
    for (const column of columns) {
      this.cell(
        column.label,
        x + CELL_PADDING,
        top + 7,
        column.width - CELL_PADDING * 2,
        column.align
      );
      x += column.width;
    }
    doc.y = top + HEADER_ROW_HEIGHT;
  }

  // A table row that does not fit goes to the next page, with the header again
  private tableRow(columns: TableColumn[], height: number, index: number) {
    const { doc } = this;
    if (this.ensureSpace(height)) {
      this.tableHeader(columns);
    }

    const top = doc.y;
    if (index % 2 === 1) {
      doc.rect(this.left, top, this.width, height).fill(ZEBRA);
    }
    doc
      .moveTo(this.left, top + height)
      .lineTo(this.left + this.width, top + height)
      .lineWidth(0.5)
      .strokeColor(BORDER)
      .stroke();
    doc.y = top + height;
    return top;
  }

  private cover() {
    const { doc, data } = this;
    doc.rect(0, 0, doc.page.width, 10).fill(this.colors.primary);
    doc.y = 170;

    if (data.brand.logo) {
      const image = doc.openImage(data.brand.logo);
      const scale = Math.min(200 / image.width, 100 / image.height);
      doc.image(image, this.left, doc.y, {
        width: image.width * scale,
        height: image.height * scale,
      });
      doc.y += image.height * scale + 28;
    }

    if (this.brandName) {
      doc
        .font(FONT_BOLD)
        .fontSize(30)
        .fillColor(this.colors.primaryText)
        .text(this.brandName, this.left, doc.y, { width: this.width });
      doc.y += 6;
    }

    doc
      .font(FONT)
      .fontSize(16)
      .fillColor(this.colors.secondaryText)
      .text('Social media report', this.left, doc.y, { width: this.width });
    doc.y += 18;

    doc
      .fontSize(12)
      .fillColor(TEXT)
      .text(
        `${this.date(data.range.start)} \u2013 ${this.date(data.range.end)}`,
        this.left,
        doc.y,
        { width: this.width }
      );
    doc.y += 4;

    doc
      .fontSize(10)
      .fillColor(MUTED)
      .text(`Generated on ${this.date(data.generatedAt)}`, this.left, doc.y, {
        width: this.width,
      });

    if (data.brand.website) {
      doc.y += 4;
      doc.fontSize(10).fillColor(this.colors.accentText);
      this.cell(
        data.brand.website,
        this.left,
        doc.y,
        this.width,
        'left',
        data.brand.website
      );
      doc.y += 14;
    }

    doc.y += 18;
    doc.rect(this.left, doc.y, 60, 4).fill(this.colors.accent);
  }

  private summary() {
    const { doc, data } = this;
    doc.addPage();
    this.heading('Summary');

    const gap = 12;
    const cardWidth = (this.width - gap * 2) / 3;
    const cardHeight = 72;
    const top = doc.y;
    const cards: [number, string][] = [
      [data.summary.published, 'Posts published'],
      [data.summary.scheduled, 'Upcoming scheduled posts'],
      [data.summary.channels, 'Channels'],
    ];

    cards.forEach(([value, label], index) => {
      const x = this.left + index * (cardWidth + gap);
      doc
        .save()
        .roundedRect(x, top, cardWidth, cardHeight, 6)
        .fillColor(this.colors.primary, 0.08)
        .fill()
        .restore();
      doc.font(FONT_BOLD).fontSize(26).fillColor(this.colors.accentText);
      this.cell(formatNumber(value), x + 14, top + 12, cardWidth - 28);
      doc.font(FONT).fontSize(9).fillColor(MUTED);
      this.cell(label, x + 14, top + 50, cardWidth - 28);
    });
    doc.y = top + cardHeight + 28;

    this.subheading('Posts per channel');
    const columns: TableColumn[] = [
      { label: 'Channel', width: this.width - 290 },
      { label: 'Platform', width: 150 },
      { label: 'Published', width: 70, align: 'right' },
      { label: 'Scheduled', width: 70, align: 'right' },
    ];
    this.tableHeader(columns);

    data.channels.forEach((channel, index) => {
      const top = this.tableRow(columns, ROW_HEIGHT, index);
      const values = [
        channelName(channel.name),
        channel.platform,
        formatNumber(channel.published),
        formatNumber(channel.scheduled),
      ];

      doc.font(FONT).fontSize(9).fillColor(TEXT);
      let x = this.left;
      columns.forEach((column, columnIndex) => {
        this.cell(
          values[columnIndex],
          x + CELL_PADDING,
          top + 6,
          column.width - CELL_PADDING * 2,
          column.align
        );
        x += column.width;
      });
      doc.y = top + ROW_HEIGHT;
    });
    doc.y += 28;
  }

  private channelStatistics() {
    const { doc, data } = this;
    this.heading('Channel statistics');

    if (!data.statsWindow) {
      this.paragraph(
        'Platform statistics are only available for the last 90 days, so they are not part of this report.'
      );
      return;
    }

    const { days, start, end } = data.statsWindow;
    this.paragraph(
      `Statistics for the last ${days} days (${this.date(start)} \u2013 ${this.date(
        end
      )}), as reported by each platform. This period can differ from the date range of this report.`
    );
    doc.y += 6;

    for (const channel of data.channels) {
      this.channelBlock(channel);
    }
  }

  private channelBlock(channel: ReportChannel) {
    const { doc } = this;
    const { stats } = channel;
    const columnGap = 24;
    const inner = this.width - 12;
    const columnWidth = (inner - columnGap) / 2;
    const metricRows =
      stats.status === 'ok' ? Math.ceil(stats.metrics.length / 2) : 1;
    const height = 22 + metricRows * 16;

    this.ensureSpace(height + 14);
    const top = doc.y;
    doc.rect(this.left, top, 3, height).fill(this.colors.accent);

    doc.font(FONT_BOLD).fontSize(11).fillColor(TEXT);
    this.cell(channelName(channel.name), this.left + 12, top + 2, inner * 0.6);
    doc.font(FONT).fontSize(9).fillColor(MUTED);
    this.cell(
      channel.platform,
      this.left + 12 + inner * 0.6,
      top + 4,
      inner * 0.4,
      'right'
    );

    if (stats.status === 'ok') {
      stats.metrics.forEach((metric, index) => {
        const x = this.left + 12 + (index % 2) * (columnWidth + columnGap);
        const y = top + 22 + Math.floor(index / 2) * 16;
        doc.font(FONT).fontSize(9).fillColor(MUTED);
        this.cell(metric.label, x, y, columnWidth * 0.65);
        doc.font(FONT_BOLD).fontSize(10).fillColor(TEXT);
        this.cell(
          metric.value,
          x + columnWidth * 0.65,
          y - 1,
          columnWidth * 0.35,
          'right'
        );
      });
    } else {
      doc.font(FONT).fontSize(9).fillColor(MUTED);
      this.cell(
        `Statistics not available \u2013 ${NOT_AVAILABLE[stats.reason]}`,
        this.left + 12,
        top + 22,
        inner
      );
    }

    doc.y = top + height + 14;
  }

  private recentPosts() {
    const { doc, data } = this;
    doc.y += 10;
    this.heading('Recent published posts');

    if (!data.posts.length) {
      this.paragraph('No posts were published in this period.');
      return;
    }

    const columns: TableColumn[] = [
      { label: 'Date', width: 80 },
      { label: 'Channel', width: 130 },
      { label: 'Post', width: this.width - 210 },
    ];
    const textWidth = columns[2].width - CELL_PADDING * 2;
    this.tableHeader(columns);

    data.posts.forEach((post, index) => {
      const text = toPdfText(post.text);
      doc.font(FONT).fontSize(9);
      const lineHeight = doc.currentLineHeight(true);
      const textHeight = text
        ? Math.min(
            doc.heightOfString(text, { width: textWidth }),
            lineHeight * POST_TEXT_LINES
          )
        : lineHeight;
      const height = Math.max(textHeight, 32) + CELL_PADDING * 2;
      const top = this.tableRow(columns, height, index);
      const y = top + CELL_PADDING;

      doc.font(FONT).fontSize(9).fillColor(TEXT);
      this.cell(
        this.date(post.date),
        this.left + CELL_PADDING,
        y,
        columns[0].width - CELL_PADDING * 2
      );

      const channelX = this.left + columns[0].width + CELL_PADDING;
      const channelWidth = columns[1].width - CELL_PADDING * 2;
      doc.font(FONT_BOLD).fontSize(9).fillColor(TEXT);
      this.cell(channelName(post.channelName), channelX, y, channelWidth);
      doc.font(FONT).fontSize(8).fillColor(MUTED);
      this.cell(post.platform, channelX, y + 11, channelWidth);
      if (post.url) {
        doc.fillColor(this.colors.accentText);
        this.cell('View post', channelX, y + 21, channelWidth, 'left', post.url);
      }

      if (text) {
        doc
          .font(FONT)
          .fontSize(9)
          .fillColor(TEXT)
          .text(text, this.left + columns[0].width + columns[1].width + CELL_PADDING, y, {
            width: textWidth,
            // + 1 so rounding never hides the last line
            height: lineHeight * POST_TEXT_LINES + 1,
            ellipsis: true,
            ...(post.url ? { link: post.url, underline: false } : {}),
          });
      }
      doc.y = top + height;
    });
  }

  // Brand name and page number on every page, never the name of the app
  private footers() {
    const { doc } = this;
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index++) {
      doc.switchToPage(index);
      const y = doc.page.height - 34;
      doc
        .moveTo(this.left, y - 8)
        .lineTo(this.left + this.width, y - 8)
        .lineWidth(0.5)
        .strokeColor(this.colors.secondary)
        .stroke();
      doc.font(FONT).fontSize(8).fillColor(MUTED);
      this.cell(this.brandName, this.left, y, this.width / 2);
      this.cell(
        `Page ${index - range.start + 1} of ${range.count}`,
        this.left + this.width / 2,
        y,
        this.width / 2,
        'right'
      );
    }
  }
}

@Injectable()
export class ReportPdfService {
  render(data: ReportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const title = `${data.brand.name} social media report`.trim();
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
        bufferPages: true,
        // replaces the "PDFKit" producer and creator, the PDF only carries the brand
        info: {
          Title: title,
          Author: data.brand.name,
          Creator: data.brand.name,
          Producer: data.brand.name,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        new ReportPdfWriter(doc, data).write();
        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}
