'use client';

import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { escape as escapeHtml } from 'lodash';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import ImageWithFallback from '@gitroom/react/helpers/image.with.fallback';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import Spinner from '@gitroom/frontend/components/layout/loading';
import { useModals } from '@gitroom/frontend/components/layout/new-modal';
import { getTimezone } from '@gitroom/frontend/components/layout/set.timezone';
import { Integrations } from '@gitroom/frontend/components/launches/calendar.context';

export const BULK_IMPORT_MAX_ROWS = 500;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
// rows checked by the server in one request
const VALIDATE_CHUNK = 25;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
// the extensions the upload from a url accepts (ValidUrlExtension)
const MEDIA_EXTENSION = /\.(png|jpg|jpeg|gif|webp|mp4)$/;

const COLUMNS = [
  'date',
  'time',
  'channels',
  'text',
  'image_urls',
  'settings',
] as const;
type Column = (typeof COLUMNS)[number];
const REQUIRED: Column[] = ['date', 'time', 'channels', 'text'];

type Step = 'pick' | 'validating' | 'preview' | 'importing' | 'done';
type Translate = ReturnType<typeof useT>;

interface BulkImportRow {
  // the row number in a spreadsheet, the header is row 1
  line: number;
  values: Record<Column, string>;
  date: string;
  time: string;
  text: string;
  imageUrls: string[];
  settings: Record<string, unknown>;
  channels: Integrations[];
  errors: string[];
  status: 'ready' | 'invalid' | 'created' | 'failed';
}

interface PostValidation {
  valid: boolean;
  settingsError: string;
  errors: string | true;
  tooLong: boolean;
  maximumCharacters: number;
}

// RFC 4180: a quoted field can hold the delimiter, line breaks and "" for a
// quote, a row ends with CRLF or LF. Excel saves with ";" in some locales,
// so the delimiter is the one used by the header line
const detectDelimiter = (text: string) => {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const char of text) {
    if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && (char === '\n' || char === '\r')) {
      break;
    } else if (!quoted && char === ',') {
      commas++;
    } else if (!quoted && char === ';') {
      semicolons++;
    }
  }
  return semicolons > commas ? ';' : ',';
};

export const parseCsv = (input: string): string[][] => {
  const text = input.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
    } else if (char === '"' && !field) {
      // only a quote that opens the field starts a quoted field
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') {
        i++;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
};

const downloadCsv = (fileName: string, lines: string[][]) => {
  const escape = (value: string) => `"${(value || '').replace(/"/g, '""')}"`;
  const url = URL.createObjectURL(
    new Blob(
      ['\uFEFF' + lines.map((line) => line.map(escape).join(',')).join('\r\n')],
      { type: 'text/csv;charset=utf-8' }
    )
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// the composer keeps a post as one paragraph per line
const toEditorHtml = (text: string) =>
  text
    .split('\n')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');

// dates and times of the file are in the timezone of the user
const toLocalDate = (row: Pick<BulkImportRow, 'date' | 'time'>) =>
  dayjs.tz(`${row.date} ${row.time}`, getTimezone());

// the same posts as the composer sends, one per channel of the row
const toPosts = (
  row: BulkImportRow,
  group: string,
  images: { id: string; path: string }[]
) =>
  row.channels.map((channel) => ({
    integration: { id: channel.id },
    group,
    settings: { ...row.settings },
    value: [
      {
        content: toEditorHtml(row.text.trim()),
        delay: 0,
        image: images,
      },
    ],
  }));

const readMessage = async (response: Response | null) => {
  const { message } = response
    ? await response.json().catch(() => ({} as any))
    : ({} as any);
  if (Array.isArray(message)) {
    return message.join('. ');
  }
  return typeof message === 'string' ? message : '';
};

// a channel is written with its name or its id, several are separated by |
const findChannels = (
  value: string,
  integrations: Integrations[],
  t: Translate
) => {
  const channels: Integrations[] = [];
  const errors: string[] = [];

  for (const token of value
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p)) {
    const lower = token.toLowerCase();
    const byId = integrations.find((p) => p.id.toLowerCase() === lower);
    const found = byId
      ? [byId]
      : integrations.filter((p) => p.name.trim().toLowerCase() === lower);

    if (!found.length) {
      errors.push(
        t('bulk_import_unknown_channel', 'Unknown channel "{{name}}"', {
          name: token,
        })
      );
    } else if (found.length > 1) {
      errors.push(
        t(
          'bulk_import_ambiguous_channel',
          'Several channels are named "{{name}}", use the channel id instead',
          { name: token }
        )
      );
    } else if (found[0].disabled || found[0].inBetweenSteps) {
      errors.push(
        t(
          'bulk_import_channel_unavailable',
          'The channel "{{name}}" is disabled or not fully connected',
          { name: found[0].name }
        )
      );
    } else if (!channels.includes(found[0])) {
      channels.push(found[0]);
    }
  }

  if (!channels.length && !errors.length) {
    errors.push(t('bulk_import_no_channel', 'Add at least one channel'));
  }

  return { channels, errors };
};

const readRow = (
  line: number,
  values: Record<Column, string>,
  integrations: Integrations[],
  t: Translate
): BulkImportRow => {
  const errors: string[] = [];
  const date = values.date.trim();
  // spreadsheets often drop the leading zero of the hour or add the seconds
  const time = values.time
    .trim()
    .replace(/^(\d{1,2}:\d{2}):00$/, '$1')
    .padStart(5, '0');
  const text = values.text.replace(/\r\n?/g, '\n');
  const imageUrls = values.image_urls
    .split('|')
    .map((p) => p.trim())
    .filter((p) => p);

  if (!DATE.test(date) || !TIME.test(time)) {
    errors.push(
      t(
        'bulk_import_bad_date_format',
        'The date must be written as YYYY-MM-DD and the time as HH:mm'
      )
    );
  } else {
    const local = toLocalDate({ date, time });
    if (
      !local.isValid() ||
      local.format('YYYY-MM-DD') !== date ||
      local.format('HH:mm') !== time
    ) {
      errors.push(
        t('bulk_import_bad_date', 'This date or time does not exist')
      );
    } else if (!local.isAfter(dayjs())) {
      errors.push(t('bulk_import_past_date', 'This date is in the past'));
    }
  }

  const { channels, errors: channelErrors } = findChannels(
    values.channels,
    integrations,
    t
  );
  errors.push(...channelErrors);

  if (!text.trim() && !imageUrls.length) {
    errors.push(
      t('bulk_import_empty', 'The post needs a text or a picture')
    );
  }

  for (const url of imageUrls) {
    let valid = false;
    try {
      valid =
        new URL(url).protocol === 'https:' &&
        MEDIA_EXTENSION.test(url.split('?')[0]);
    } catch (err) {
      valid = false;
    }
    if (!valid) {
      errors.push(
        t(
          'bulk_import_bad_image_url',
          '"{{url}}" must be a public https link ending with .png, .jpg, .jpeg, .gif, .webp or .mp4',
          { url }
        )
      );
    }
  }

  let settings: Record<string, unknown> = {};
  if (values.settings.trim()) {
    try {
      const parsed = JSON.parse(values.settings);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        settings = parsed;
      } else {
        throw new Error();
      }
    } catch (err) {
      errors.push(
        t(
          'bulk_import_bad_settings',
          'The settings must be a JSON object, like {"key": "value"}'
        )
      );
    }
  }

  return {
    line,
    values,
    date,
    time,
    text,
    imageUrls,
    settings,
    channels,
    errors,
    status: errors.length ? 'invalid' : 'ready',
  };
};

const readFile = (
  content: string,
  integrations: Integrations[],
  t: Translate
): { error: string; rows: BulkImportRow[] } => {
  const [header, ...table] = parseCsv(content);
  const columns = (header || []).map((p) => p.trim().toLowerCase());
  const missing = REQUIRED.filter((p) => !columns.includes(p));

  if (missing.length) {
    return {
      rows: [],
      error: t(
        'bulk_import_missing_columns',
        'The file must have a header row with the columns {{columns}}. Missing: {{missing}}',
        { columns: REQUIRED.join(', '), missing: missing.join(', ') }
      ),
    };
  }

  const rows = table
    .map((cells, index) => ({ cells, line: index + 2 }))
    // the empty lines a spreadsheet leaves at the end
    .filter(({ cells }) => cells.some((p) => p.trim()));

  if (!rows.length) {
    return {
      rows: [],
      error: t('bulk_import_no_rows', 'The file has no posts'),
    };
  }

  if (rows.length > BULK_IMPORT_MAX_ROWS) {
    return {
      rows: [],
      error: t(
        'bulk_import_too_many_rows',
        'The file has {{count}} posts, you can import up to {{max}} at once',
        { count: rows.length, max: BULK_IMPORT_MAX_ROWS }
      ),
    };
  }

  return {
    error: '',
    rows: rows.map(({ cells, line }) =>
      readRow(
        line,
        COLUMNS.reduce((all, column) => {
          const index = columns.indexOf(column);
          all[column] = index > -1 ? cells[index] || '' : '';
          return all;
        }, {} as Record<Column, string>),
        integrations,
        t
      )
    ),
  };
};

export const BulkImportModal: FC<{
  integrations: Integrations[];
  reloadCalendarView: () => void;
}> = ({ integrations, reloadCalendarView }) => {
  const t = useT();
  const fetch = useFetch();
  const modal = useModals();
  const toaster = useToaster();
  const input = useRef<HTMLInputElement>(null);
  const closed = useRef(false);
  const [step, setStep] = useState<Step>('pick');
  const [fileError, setFileError] = useState('');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<BulkImportRow[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [showChannels, setShowChannels] = useState(false);

  // closing the modal stops the import after the post being created
  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
    };
  }, []);

  const available = integrations.filter(
    (p) => !p.disabled && !p.inBetweenSteps
  );

  const downloadTemplate = useCallback(() => {
    const names = available.map((p) => p.name);
    const tomorrow = dayjs().tz(getTimezone()).add(1, 'day');
    downloadCsv('bulk-import-template.csv', [
      [...COLUMNS],
      [
        tomorrow.format('YYYY-MM-DD'),
        '09:00',
        names[0] || 'My channel',
        t(
          'bulk_import_template_text_1',
          'Good morning! This is my first scheduled post.'
        ),
        '',
        '',
      ],
      [
        tomorrow.add(1, 'day').format('YYYY-MM-DD'),
        '18:30',
        names.slice(0, 2).join('|') || 'My channel',
        t(
          'bulk_import_template_text_2',
          'A post on two channels, with a comma, and\na second line.'
        ),
        '',
        '',
      ],
    ]);
  }, [available, t]);

  // the same checks the composer runs before saving: the settings of every
  // channel, the media rules and the length of the text
  const validateOnServer = useCallback(
    async (list: BulkImportRow[]) => {
      const ready = list.filter((p) => p.status === 'ready');
      setProgress({ done: 0, total: ready.length });

      for (let start = 0; start < ready.length; start += VALIDATE_CHUNK) {
        if (closed.current) {
          return;
        }

        const chunk = ready.slice(start, start + VALIDATE_CHUNK);
        let results: PostValidation[] | null = null;
        let failure = '';
        try {
          const response = await fetch('/posts/valid', {
            method: 'POST',
            body: JSON.stringify({
              type: 'schedule',
              // the pictures are downloaded during the import, so the
              // media rules of a row with pictures are checked then
              posts: chunk.flatMap((row) => toPosts(row, '', [])),
            }),
          });
          results = response.ok ? await response.json() : null;
          failure = response.ok ? '' : await readMessage(response);
        } catch (err) {
          results = null;
        }

        let index = 0;
        for (const row of chunk) {
          const own = results?.slice(index, index + row.channels.length);
          index += row.channels.length;

          if (!own || own.length !== row.channels.length) {
            row.errors.push(
              failure ||
                t(
                  'bulk_import_validation_failed',
                  'Could not check this post, try again'
                )
            );
          } else {
            own.forEach((item, position) => {
              const name = row.channels[position].name;
              if (item.valid === false) {
                row.errors.push(
                  t(
                    'bulk_import_needs_settings',
                    '{{name}} needs post settings: {{error}}. Add them in the settings column as JSON, or create this post in the editor',
                    {
                      name,
                      error:
                        item.settingsError ||
                        t('please_fix_your_settings', 'Please fix your settings'),
                    }
                  )
                );
              }
              if (!row.imageUrls.length && item.errors !== true) {
                row.errors.push(`${name}: ${item.errors}`);
              }
              if (item.tooLong) {
                row.errors.push(
                  t(
                    'bulk_import_too_long',
                    'The text is too long for {{name}}, the maximum is {{max}} characters',
                    { name, max: item.maximumCharacters }
                  )
                );
              }
            });
          }

          if (row.errors.length) {
            row.status = 'invalid';
          }
        }

        setProgress({
          done: Math.min(start + VALIDATE_CHUNK, ready.length),
          total: ready.length,
        });
      }
    },
    [fetch, t]
  );

  const pickFile = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // the same file can be picked again after it was fixed
      event.target.value = '';
      if (!file) {
        return;
      }

      setFileError('');
      setFileName(file.name);

      if (file.size > MAX_FILE_SIZE) {
        setFileError(
          t('bulk_import_file_too_big', 'The file is too big, the maximum is 5 MB')
        );
        return;
      }

      const { error, rows: list } = readFile(await file.text(), integrations, t);
      if (error) {
        setFileError(error);
        return;
      }

      setStep('validating');
      await validateOnServer(list);
      if (closed.current) {
        return;
      }
      setRows(list);
      setStep('preview');
    },
    [integrations, validateOnServer, t]
  );

  const updateRow = useCallback(
    (line: number, value: Partial<BulkImportRow>) => {
      setRows((list) =>
        list.map((row) => (row.line === line ? { ...row, ...value } : row))
      );
    },
    []
  );

  // pictures, then the post, with the same requests as the composer
  const createRow = useCallback(
    async (
      row: BulkImportRow,
      media: Map<string, { id: string; path: string }>
    ): Promise<{ error: string; limit?: boolean }> => {
      if (!toLocalDate(row).isAfter(dayjs())) {
        return {
          error: t('bulk_import_past_date', 'This date is in the past'),
        };
      }

      const images: { id: string; path: string }[] = [];
      for (const url of row.imageUrls) {
        // a picture used by several posts is downloaded once
        if (!media.has(url)) {
          let response: Response | null = null;
          try {
            response = await fetch('/media/upload-from-url', {
              method: 'POST',
              body: JSON.stringify({ url }),
            });
          } catch (err) {
            response = null;
          }

          if (!response?.ok) {
            return {
              error: `${t(
                'bulk_import_image_failed',
                'Could not download "{{url}}"',
                { url }
              )} ${await readMessage(response)}`.trim(),
            };
          }

          const saved = await response.json();
          media.set(url, { id: saved.id, path: saved.path });
        }
        images.push(media.get(url)!);
      }

      let response: Response | null = null;
      try {
        response = await fetch('/posts', {
          method: 'POST',
          body: JSON.stringify({
            type: 'schedule',
            shortLink: false,
            tags: [] as { value: string; label: string }[],
            date: toLocalDate(row).utc().format('YYYY-MM-DDTHH:mm:ss'),
            posts: toPosts(row, makeId(10), images),
          }),
        });
      } catch (err) {
        response = null;
      }

      if (response?.ok) {
        return { error: '' };
      }

      // the upgrade dialog was already shown, the next posts would fail too
      if (response?.status === 402) {
        return {
          limit: true,
          error: t(
            'bulk_import_plan_limit',
            'Your plan does not allow more posts'
          ),
        };
      }

      return {
        error:
          (await readMessage(response)) ||
          t('post_save_failed', 'Could not save the post'),
      };
    },
    [fetch, t]
  );

  const runImport = useCallback(async () => {
    const ready = rows.filter((p) => p.status === 'ready');
    const media = new Map<string, { id: string; path: string }>();
    let created = 0;
    let limit = false;

    setStep('importing');
    setProgress({ done: 0, total: ready.length });

    // one by one, like the planner, so the plan limits are checked on every post
    for (const row of ready) {
      if (closed.current) {
        break;
      }

      const result: { error: string; limit?: boolean } = limit
        ? {
            error: t(
              'bulk_import_plan_limit',
              'Your plan does not allow more posts'
            ),
          }
        : await createRow(row, media);

      limit = limit || !!result.limit;
      if (!result.error) {
        created++;
        // the calendar shows the posts as they come, even if the import stops
        if (created % 10 === 1) {
          reloadCalendarView();
        }
      }

      updateRow(
        row.line,
        result.error
          ? { status: 'failed', errors: [result.error] }
          : { status: 'created', errors: [] }
      );
      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    if (created) {
      reloadCalendarView();
    }

    toaster.show(
      t(
        'bulk_import_result',
        '{{created}} of {{total}} posts scheduled',
        { created, total: ready.length }
      ),
      created === ready.length ? 'success' : 'warning'
    );

    if (!closed.current) {
      setStep('done');
    }
  }, [rows, createRow, updateRow, reloadCalendarView, toaster, t]);

  // the rows to fix, with the reason, the file can be imported again once fixed
  const downloadErrors = useCallback(() => {
    downloadCsv(
      'bulk-import-errors.csv',
      [
        [...COLUMNS, 'error'],
        ...rows
          .filter((p) => p.status === 'invalid' || p.status === 'failed')
          .map((row) => [
            ...COLUMNS.map((column) => row.values[column]),
            row.errors.join(' | '),
          ]),
      ]
    );
  }, [rows]);

  const reset = useCallback(() => {
    setRows([]);
    setFileError('');
    setFileName('');
    setStep('pick');
  }, []);

  const count = (status: BulkImportRow['status']) =>
    rows.filter((p) => p.status === status).length;

  if (step === 'validating') {
    return (
      <div className="flex flex-col items-center justify-center gap-[16px] py-[60px] text-center">
        <Spinner width={40} height={40} />
        <div className="text-[16px] animate-pulse">
          {t('bulk_import_checking', 'Checking {{done}} of {{total}} posts...', progress)}
        </div>
      </div>
    );
  }

  if (step === 'pick') {
    return (
      <div className="flex flex-col gap-[16px]">
        <div className="text-[14px] text-textItemBlur">
          {t(
            'bulk_import_description',
            'Schedule many posts at once from a CSV file. Every row is one post, you can review them before anything is scheduled.'
          )}
        </div>

        <div className="flex flex-col gap-[8px] rounded-[8px] border border-newTableBorder bg-newBgColorInner p-[16px] text-[14px]">
          <div className="font-[600]">
            {t('bulk_import_columns', 'Columns of the file')}
          </div>
          <div>
            <span className="font-[600]">date</span>:{' '}
            {t('bulk_import_column_date', 'the day of the post, as YYYY-MM-DD')}
          </div>
          <div>
            <span className="font-[600]">time</span>:{' '}
            {t(
              'bulk_import_column_time',
              'the time as HH:mm, in your timezone ({{timezone}})',
              { timezone: getTimezone() }
            )}
          </div>
          <div>
            <span className="font-[600]">channels</span>:{' '}
            {t(
              'bulk_import_column_channels',
              'the names or the ids of your channels, separated by |'
            )}
          </div>
          <div>
            <span className="font-[600]">text</span>:{' '}
            {t('bulk_import_column_text', 'the text of the post')}
          </div>
          <div>
            <span className="font-[600]">image_urls</span>:{' '}
            {t(
              'bulk_import_column_image_urls',
              '(optional) public https links of pictures or videos, separated by |'
            )}
          </div>
          <div>
            <span className="font-[600]">settings</span>:{' '}
            {t(
              'bulk_import_column_settings',
              '(optional, advanced) the post settings of the channels as JSON, for the channels that need them'
            )}
          </div>
          <div className="text-textItemBlur">
            {t(
              'bulk_import_limits',
              'Up to {{max}} posts per file. Wrap a text with commas or line breaks in double quotes, spreadsheets do it for you.',
              { max: BULK_IMPORT_MAX_ROWS }
            )}
          </div>
        </div>

        <div className="flex flex-col gap-[8px]">
          <button
            type="button"
            className="text-[14px] underline cursor-pointer self-start"
            onClick={() => setShowChannels(!showChannels)}
          >
            {showChannels
              ? t('bulk_import_hide_channels', 'Hide your channels')
              : t('bulk_import_show_channels', 'Show the names and ids of your channels')}
          </button>
          {showChannels && (
            <div className="flex flex-col max-h-[220px] overflow-auto rounded-[8px] border border-newTableBorder">
              {available.map((integration) => (
                <div
                  key={integration.id}
                  className="flex items-center gap-[10px] px-[12px] py-[8px] border-b border-newTableBorder last:border-b-0 text-[14px]"
                >
                  <ImageWithFallback
                    fallbackSrc={`/icons/platforms/${integration.identifier}.png`}
                    src={integration.picture}
                    className="rounded-full"
                    alt={integration.identifier}
                    width={24}
                    height={24}
                  />
                  <div className="flex-1 min-w-0 truncate">
                    {integration.name}
                  </div>
                  <div className="text-textItemBlur text-[12px] select-all">
                    {integration.id}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!!fileError && (
          <div className="text-red-400 text-[14px]">
            {fileName ? `${fileName}: ` : ''}
            {fileError}
          </div>
        )}

        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={pickFile}
        />

        <div className="flex flex-wrap justify-end gap-[8px]">
          <Button secondary={true} onClick={downloadTemplate}>
            {t('bulk_import_download_template', 'Download the template')}
          </Button>
          <Button onClick={() => input.current?.click()}>
            {t('bulk_import_choose_file', 'Choose a CSV file')}
          </Button>
        </div>
      </div>
    );
  }

  const ready = count('ready');
  const invalid = count('invalid');
  const failed = count('failed');
  const created = count('created');
  const importing = step === 'importing';

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="flex flex-wrap items-center gap-[12px] text-[14px]">
        <div className="font-[600]">{fileName}</div>
        {step === 'preview' ? (
          <div className="text-textItemBlur">
            {t(
              'bulk_import_preview_summary',
              '{{ready}} ready, {{invalid}} with errors (they will not be imported)',
              { ready, invalid }
            )}
          </div>
        ) : (
          <div className="text-textItemBlur">
            {t(
              'bulk_import_done_summary',
              '{{created}} scheduled, {{failed}} failed, {{invalid}} skipped',
              { created, failed, invalid }
            )}
          </div>
        )}
      </div>

      {importing && (
        <div className="flex flex-col gap-[6px]">
          <div className="text-[14px] animate-pulse">
            {t(
              'bulk_import_importing',
              'Scheduling {{done}} of {{total}}... keep this window open',
              progress
            )}
          </div>
          <div className="h-[6px] rounded-full bg-newTableBorder overflow-hidden">
            <div
              className="h-full bg-btnPrimary transition-all"
              style={{
                width: `${
                  progress.total
                    ? Math.round((progress.done / progress.total) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col max-h-[55vh] overflow-auto rounded-[8px] border border-newTableBorder">
        <div className="grid grid-cols-[56px_140px_minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)] gap-x-[12px] items-center px-[12px] min-h-[40px] bg-newTableHeader text-[13px] text-newTableText sticky top-0 mobile:hidden">
          <div>{t('bulk_import_row', 'Row')}</div>
          <div>{t('bulk_import_when', 'When')}</div>
          <div>{t('channels', 'Channels')}</div>
          <div>{t('bulk_import_text', 'Text')}</div>
          <div>{t('bulk_import_status', 'Status')}</div>
        </div>
        {rows.map((row) => (
          <div
            key={row.line}
            className="grid grid-cols-[56px_140px_minmax(0,1fr)_minmax(0,2fr)_minmax(0,2fr)] mobile:grid-cols-1 gap-x-[12px] gap-y-[4px] items-start px-[12px] py-[10px] border-t border-newTableBorder text-[13px]"
          >
            <div className="text-textItemBlur">#{row.line}</div>
            <div>
              {row.date} {row.time}
            </div>
            <div className="flex flex-wrap gap-[4px]">
              {row.channels.map((channel) => (
                <div
                  key={channel.id}
                  data-tooltip-id="tooltip"
                  data-tooltip-content={channel.name}
                >
                  <ImageWithFallback
                    fallbackSrc={`/icons/platforms/${channel.identifier}.png`}
                    src={channel.picture}
                    className="rounded-full"
                    alt={channel.name}
                    width={22}
                    height={22}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-[2px] min-w-0">
              <div className="line-clamp-2 break-words whitespace-pre-line">
                {row.text}
              </div>
              {!!row.imageUrls.length && (
                <div className="text-textItemBlur">
                  {t('bulk_import_pictures', '{{count}} pictures', {
                    count: row.imageUrls.length,
                    defaultValue_one: '{{count}} picture',
                  })}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-[2px] break-words">
              {row.status === 'ready' && (
                <div className="text-textItemBlur">
                  {importing
                    ? t('bulk_import_waiting', 'Waiting')
                    : t('bulk_import_ready', 'Ready')}
                </div>
              )}
              {row.status === 'created' && (
                <div className="text-green-500">
                  {t('bulk_import_scheduled', 'Scheduled')}
                </div>
              )}
              {(row.status === 'invalid' || row.status === 'failed') &&
                row.errors.map((error, index) => (
                  <div key={index} className="text-red-400">
                    {error}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-[8px]">
        {!importing && (invalid > 0 || failed > 0) && (
          <Button secondary={true} onClick={downloadErrors}>
            {t('bulk_import_download_errors', 'Download the rows to fix')}
          </Button>
        )}
        {!importing && (
          <Button secondary={true} onClick={reset}>
            {t('bulk_import_another_file', 'Choose another file')}
          </Button>
        )}
        {step === 'done' ? (
          <Button onClick={modal.closeCurrent}>{t('close', 'Close')}</Button>
        ) : (
          <Button onClick={runImport} loading={importing} disabled={!ready}>
            {t('bulk_import_schedule', 'Schedule {{count}} posts', {
              count: ready,
              defaultValue_one: 'Schedule {{count}} post',
            })}
          </Button>
        )}
      </div>
    </div>
  );
};
