'use client';

import React, { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { FormProvider, useForm } from 'react-hook-form';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { showMediaBox } from '@gitroom/frontend/components/media/media.component';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { Textarea } from '@gitroom/react/form/textarea';
import { Select } from '@gitroom/react/form/select';
import { ColorPicker } from '@gitroom/react/form/color.picker';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import {
  brandKitFonts,
  brandKitLimits,
  BrandKitView,
  LearnVoiceResult,
} from '@gitroom/nestjs-libraries/dtos/brand-kit/brand-kit.dto';

export const useBrandKit = () => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    const response = await fetch('/brand-kit');
    if (!response.ok) {
      throw new Error('Failed to load the brand kit');
    }
    return response.json();
  }, []);

  return useSWR<Partial<BrandKitView>>('brand-kit', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });
};

interface BrandKitForm {
  brandName: string;
  logo: { id: string | null; path: string } | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  website: string;
  voice: string;
  // one item per line
  dos: string;
  donts: string;
  // separated by spaces or commas
  hashtags: string;
}

const toFormValues = (kit?: Partial<BrandKitView>): BrandKitForm => ({
  brandName: kit?.brandName || '',
  logo: kit?.logo || null,
  primaryColor: kit?.primaryColor || '',
  secondaryColor: kit?.secondaryColor || '',
  accentColor: kit?.accentColor || '',
  headingFont: kit?.headingFont || '',
  bodyFont: kit?.bodyFont || '',
  website: kit?.website || '',
  voice: kit?.voice || '',
  dos: (kit?.dos || []).join('\n'),
  donts: (kit?.donts || []).join('\n'),
  hashtags: (kit?.hashtags || []).join(' '),
});

const toLines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => !!line);

const fontStyle = (font: string) =>
  font ? { fontFamily: `'${font}', sans-serif` } : {};

// https:// is added when no scheme is typed, '' clears the website
const toWebsite = (value: string) => {
  const website = value.trim();
  if (!website) {
    return '';
  }

  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
};

// Close to the check of the server: http or https, no spaces and a domain like
// example.com (or an IP address), so a wrong website is marked before saving
const isWebsite = (website: string) => {
  if (website.length > 500 || /[\s<>]/.test(website)) {
    return false;
  }

  try {
    const { protocol, hostname } = new URL(website);
    const labels = hostname.split('.');
    return (
      ['http:', 'https:'].includes(protocol) &&
      (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
        (labels.length > 1 &&
          /^([a-z]{2,}|xn--[a-z0-9-]+)$/i.test(labels[labels.length - 1]) &&
          labels.every(
            (label) =>
              label.length <= 63 &&
              /^[a-z0-9-]+$/i.test(label) &&
              !/^-|-$/.test(label)
          )))
    );
  } catch (err) {
    return false;
  }
};

// Black or white, whichever is easier to read on the color
const textColorOn = (color: string) => {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) {
    return undefined;
  }

  const [r, g, b] = [0, 2, 4].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#000000' : '#FFFFFF';
};

// The color picker shows its label only once it is enabled, so it is always shown here
const BrandColor: FC<{ name: keyof BrandKitForm; label: string }> = ({
  name,
  label,
}) => (
  <div
    role="group"
    aria-label={label}
    className="flex flex-col gap-[6px] grow min-w-0"
  >
    <div className="text-[14px]">{label}</div>
    <ColorPicker name={name} label="" enabled={true} canBeCancelled={true} />
  </div>
);

export const BrandKitComponent = () => {
  const t = useT();
  const { data, isLoading, isValidating, error, mutate } = useBrandKit();

  if (error && !data) {
    return (
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col items-start gap-[12px]">
        <div>
          {t('brand_kit_load_failed', 'We could not load your brand kit.')}
        </div>
        <Button onClick={() => mutate()} loading={isValidating}>
          {t('try_again', 'Try Again')}
        </Button>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
        <div className="animate-pulse">{t('loading', 'Loading...')}</div>
      </div>
    );
  }

  // a new key after every save, so the form starts again from what was stored
  return (
    <BrandKitFormComponent
      key={String(data.updatedAt || 'new')}
      kit={data}
      reload={mutate}
    />
  );
};

const BrandKitFormComponent: FC<{
  kit: Partial<BrandKitView>;
  reload: () => void;
}> = ({ kit, reload }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const user = useUser();
  const readOnly = user?.role === 'USER';
  const canLearn = !!user?.tier?.ai && !readOnly;
  const [saving, setSaving] = useState(false);
  const [learning, setLearning] = useState(false);

  const form = useForm<BrandKitForm>({
    defaultValues: toFormValues(kit),
  });

  const values = form.watch();

  const chooseLogo = useCallback(() => {
    showMediaBox((media) => {
      if (!media?.path) {
        return;
      }

      // the library only lists pictures here, this also covers anything picked another way
      if (hasExtension(media.path, 'mp4')) {
        toaster.show(
          t(
            'brand_logo_image_only',
            'The logo must be a picture, not a video'
          ),
          'warning'
        );
        return;
      }

      form.setValue(
        'logo',
        { id: media.id, path: media.path },
        { shouldDirty: true }
      );
    }, 'image');
  }, [form]);

  const removeLogo = useCallback(() => {
    form.setValue('logo', null, { shouldDirty: true });
  }, [form]);

  const save = useCallback(
    async (value: BrandKitForm) => {
      const website = toWebsite(value.website);
      const dos = toLines(value.dos);
      const donts = toLines(value.donts);
      const hashtags = value.hashtags.split(/[\s,]+/).filter((tag) => !!tag);

      // the same limits as the server, so the field that is wrong is marked
      const rulesError = (lines: string[]) =>
        lines.length > brandKitLimits.rules
          ? t('brand_rules_too_many', 'Use up to {{max}} lines', {
              max: brandKitLimits.rules,
            })
          : lines.some((line) => line.length > brandKitLimits.ruleLength)
          ? t(
              'brand_rules_too_long',
              'Each line can have up to {{max}} characters',
              { max: brandKitLimits.ruleLength }
            )
          : '';

      const errors = {
        dos: rulesError(dos),
        donts: rulesError(donts),
        hashtags:
          hashtags.length > brandKitLimits.hashtags
            ? t('brand_hashtags_too_many', 'Use up to {{max}} hashtags', {
                max: brandKitLimits.hashtags,
              })
            : hashtags.some(
                (tag) => tag.length > brandKitLimits.hashtagLength
              )
            ? t(
                'brand_hashtags_too_long',
                'Each hashtag can have up to {{max}} characters',
                { max: brandKitLimits.hashtagLength }
              )
            : '',
        website:
          website && !isWebsite(website)
            ? t(
                'brand_website_invalid',
                'Please enter a valid website, like https://example.com'
              )
            : '',
      };

      form.clearErrors();
      const fields = Object.keys(errors) as Array<keyof typeof errors>;
      const invalid = fields.filter((field) => !!errors[field]);
      if (invalid.length) {
        invalid.forEach((field) =>
          form.setError(field, { message: errors[field] })
        );
        toaster.show(
          t('brand_kit_fix_fields', 'Please fix the fields marked in red'),
          'warning'
        );
        return;
      }

      setSaving(true);
      try {
        const response = await fetch('/brand-kit', {
          method: 'PUT',
          body: JSON.stringify({
            brandName: value.brandName || null,
            logoMediaId: value.logo?.id || null,
            primaryColor: value.primaryColor || null,
            secondaryColor: value.secondaryColor || null,
            accentColor: value.accentColor || null,
            headingFont: value.headingFont || null,
            bodyFont: value.bodyFont || null,
            website: website || null,
            voice: value.voice || null,
            dos,
            donts,
            hashtags,
          }),
        });

        if (!response.ok) {
          toaster.show(
            t(
              'brand_kit_save_failed',
              'Could not save the brand kit, please check the fields and try again'
            ),
            'warning'
          );
          return;
        }

        toaster.show(t('brand_kit_saved', 'Brand kit saved'), 'success');
        reload();
      } catch (err) {
        toaster.show(
          t(
            'brand_kit_save_error',
            'Could not save the brand kit, please try again'
          ),
          'warning'
        );
      } finally {
        setSaving(false);
      }
    },
    [reload, form]
  );

  const learnVoice = useCallback(async () => {
    setLearning(true);
    let result: LearnVoiceResult | null = null;
    try {
      const response = await fetch('/brand-kit/learn-voice', {
        method: 'POST',
      });
      result = response.ok ? await response.json() : null;
    } catch (err) {
      result = null;
    } finally {
      setLearning(false);
    }

    if (!result) {
      toaster.show(
        t(
          'brand_voice_learn_failed',
          'We could not learn your voice right now, please try again later'
        ),
        'warning'
      );
      return;
    }

    if (result.status === 'not_configured') {
      toaster.show(
        t(
          'brand_voice_ai_not_configured',
          'AI is not set up on this server yet, so we can not learn your voice.'
        ),
        'warning'
      );
      return;
    }

    if (result.status === 'no_posts') {
      toaster.show(
        t(
          'brand_voice_no_posts',
          'Publish a few posts first, then we can learn your voice from them.'
        ),
        'warning'
      );
      return;
    }

    const current = form.getValues();
    if (
      (current.voice.trim() || current.dos.trim() || current.donts.trim()) &&
      !(await deleteDialog(
        t(
          'brand_voice_replace',
          'Replace your current voice with the suggestion?'
        ),
        t('replace', 'Replace')
      ))
    ) {
      return;
    }

    form.setValue('voice', result.voice, { shouldDirty: true });
    form.setValue('dos', result.dos.join('\n'), { shouldDirty: true });
    form.setValue('donts', result.donts.join('\n'), { shouldDirty: true });
    toaster.show(
      t(
        'brand_voice_review',
        'Here is a suggestion based on your last {{count}} posts. Review it and press Save.',
        { count: result.postsUsed }
      ),
      'success'
    );
  }, [form]);

  return (
    // The tab is rendered inside the profile form of the settings, so there is
    // no <form> here and Enter in a field must not submit the profile
    <div
      className="flex flex-col"
      onKeyDown={(e) => {
        if (
          e.key === 'Enter' &&
          (e.target as HTMLElement).tagName === 'INPUT'
        ) {
          e.preventDefault();
        }
      }}
    >
      <h3 className="text-[20px]">{t('brand_kit', 'Brand kit')}</h3>
      <div className="text-textItemBlur mt-[4px]">
        {t(
          'brand_kit_description',
          'Your logo, colors, fonts and the way you write. The AI uses your brand voice when it writes posts for you.'
        )}
      </div>
      {readOnly && (
        <div className="mt-[8px] text-[14px] text-textItemBlur">
          {t(
            'brand_kit_admin_only',
            'Only workspace admins can change the brand kit'
          )}
        </div>
      )}
      <FormProvider {...form}>
        <fieldset
          disabled={readOnly}
          className={clsx(
            'flex flex-col min-w-0',
            readOnly && 'pointer-events-none'
          )}
        >
          <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] mobile:p-[12px] flex flex-col gap-[16px]">
            <div className="text-[18px]">{t('brand_kit_look', 'Look')}</div>
            <Input
              label={t('brand_name', 'Brand name')}
              translationKey="brand_name"
              name="brandName"
              maxLength={100}
              placeholder={t(
                'brand_name_placeholder',
                'Your brand or business name'
              )}
            />
            <div className="flex flex-col gap-[6px]">
              <div className="text-[14px]">{t('logo', 'Logo')}</div>
              <div className="flex items-center gap-[16px] flex-wrap">
                <div className="w-[64px] h-[64px] rounded-[8px] border border-newTableBorder bg-newBgColorInner flex items-center justify-center overflow-hidden">
                  {!!values.logo?.path && (
                    <img
                      src={values.logo.path}
                      alt={t('logo', 'Logo')}
                      className="max-w-full max-h-full object-contain"
                    />
                  )}
                </div>
                <Button onClick={chooseLogo}>
                  {t('choose_logo', 'Choose logo')}
                </Button>
                {!!values.logo && (
                  <Button secondary={true} onClick={removeLogo}>
                    {t('remove', 'Remove')}
                  </Button>
                )}
              </div>
            </div>
            {/* a picker has a fixed width, so the colors wrap to a new line instead of
                sharing a row that is too narrow for them */}
            <div className="flex flex-wrap gap-[16px]">
              <BrandColor
                name="primaryColor"
                label={t('primary_color', 'Primary color')}
              />
              <BrandColor
                name="secondaryColor"
                label={t('secondary_color', 'Secondary color')}
              />
              <BrandColor
                name="accentColor"
                label={t('accent_color', 'Accent color')}
              />
            </div>
            <div className="grid grid-cols-2 mobile:grid-cols-1 gap-[16px]">
              <Select
                label={t('heading_font', 'Heading font')}
                translationKey="heading_font"
                name="headingFont"
              >
                <option value="">{t('default', 'Default')}</option>
                {brandKitFonts.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </Select>
              <Select
                label={t('body_font', 'Body font')}
                translationKey="body_font"
                name="bodyFont"
              >
                <option value="">{t('default', 'Default')}</option>
                {brandKitFonts.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              label={t('website', 'Website')}
              translationKey="website"
              name="website"
              maxLength={500}
              placeholder="https://example.com"
            />
          </div>

          <div className="bg-sixth border-fifth border rounded-[4px] p-[24px] mobile:p-[12px] flex flex-col gap-[16px]">
            <div className="text-[18px]">{t('preview', 'Preview')}</div>
            <div className="rounded-[8px] border border-newTableBorder bg-newBgColorInner flex flex-col min-w-0 overflow-hidden">
              {/* a band in the primary color, its text is black or white so it can always be read */}
              <div
                className={clsx(
                  'flex items-center gap-[12px] min-w-0 px-[16px] pt-[16px]',
                  !!values.primaryColor && 'pb-[16px]'
                )}
                style={
                  values.primaryColor
                    ? {
                        backgroundColor: values.primaryColor,
                        color: textColorOn(values.primaryColor),
                      }
                    : {}
                }
              >
                {!!values.logo?.path && (
                  <img
                    src={values.logo.path}
                    alt={t('logo', 'Logo')}
                    className="w-[40px] h-[40px] rounded-[8px] object-contain shrink-0"
                  />
                )}
                <div
                  className="text-[22px] font-[600] break-words min-w-0"
                  style={fontStyle(values.headingFont)}
                >
                  {values.brandName || t('brand_name', 'Brand name')}
                </div>
              </div>
              <div className="p-[16px] flex flex-col gap-[12px] min-w-0">
                <div className="text-[14px]" style={fontStyle(values.bodyFont)}>
                  {t(
                    'brand_kit_preview_body',
                    'This is a short sample text for your brand.'
                  )}
                </div>
                {(!!values.headingFont || !!values.bodyFont) && (
                  <div className="text-[12px] text-textItemBlur">
                    {t(
                      'brand_kit_font_hint',
                      'The preview shows a font only when it is installed on this device.'
                    )}
                  </div>
                )}
                <div className="flex items-end gap-[16px] flex-wrap">
                  {[
                    values.primaryColor,
                    values.secondaryColor,
                    values.accentColor,
                  ]
                    .filter((color) => !!color)
                    .map((color, index) => (
                      <div
                        key={index}
                        className="flex flex-col items-center gap-[4px]"
                      >
                        <div
                          className="w-[32px] h-[32px] rounded-[8px] border border-newTableBorder"
                          style={{ backgroundColor: color }}
                        />
                        <div className="text-[12px] text-textItemBlur">
                          {color}
                        </div>
                      </div>
                    ))}
                  {!!values.accentColor && (
                    <div
                      className="px-[12px] py-[4px] rounded-full text-[12px]"
                      style={{
                        backgroundColor: values.accentColor,
                        color: textColorOn(values.accentColor),
                      }}
                    >
                      {t('brand_kit_preview_button', 'Learn more')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="my-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] mobile:p-[12px] flex flex-col gap-[16px]">
            <div className="flex items-center justify-between gap-[12px] flex-wrap">
              <div className="flex flex-col">
                <div className="text-[18px]">
                  {t('brand_voice', 'Brand voice')}
                </div>
                <div className="text-[12px] text-textItemBlur">
                  {t(
                    'brand_voice_description',
                    'Tell the AI how you write: tone, personality and who you talk to.'
                  )}
                </div>
              </div>
              {canLearn && (
                <Button
                  onClick={learnVoice}
                  loading={learning}
                  className="mobile:w-full"
                >
                  {t('learn_my_voice', 'Learn my voice')}
                </Button>
              )}
            </div>
            <Textarea
              label={t('brand_voice_field', 'How you write')}
              translationKey="brand_voice_field"
              name="voice"
              maxLength={2000}
              placeholder={t(
                'brand_voice_placeholder',
                'Friendly and short, a bit funny, we talk to busy coffee lovers'
              )}
            />
            <div className="grid grid-cols-2 mobile:grid-cols-1 gap-[16px]">
              <Textarea
                label={t(
                  'brand_dos_limit',
                  "Do's (one per line, up to {{max}})",
                  { max: brandKitLimits.rules }
                )}
                translationKey="brand_dos_limit"
                translationParams={{ max: brandKitLimits.rules }}
                name="dos"
                placeholder={t('brand_dos_placeholder', 'Ask a question')}
              />
              <Textarea
                label={t(
                  'brand_donts_limit',
                  "Don'ts (one per line, up to {{max}})",
                  { max: brandKitLimits.rules }
                )}
                translationKey="brand_donts_limit"
                translationParams={{ max: brandKitLimits.rules }}
                name="donts"
                placeholder={t('brand_donts_placeholder', 'Use slang')}
              />
            </div>
            <div className="flex flex-col gap-[6px]">
              <div className="text-[14px]">
                {t('brand_hashtags_limit', 'Brand hashtags (up to {{max}})', {
                  max: brandKitLimits.hashtags,
                })}
              </div>
              <div className="text-[12px] text-textItemBlur">
                {t(
                  'brand_hashtags_hint',
                  'Kept with your brand kit for reference. They are not added to your posts automatically.'
                )}
              </div>
              <Input
                label=""
                aria-label={t('brand_hashtags', 'Brand hashtags')}
                name="hashtags"
                placeholder="#coffee #morning"
              />
            </div>
          </div>
        </fieldset>
      </FormProvider>
      {!readOnly && (
        <div>
          <Button
            onClick={form.handleSubmit(save)}
            loading={saving}
            className="mobile:w-full"
          >
            {t('save', 'Save')}
          </Button>
        </div>
      )}
    </div>
  );
};
