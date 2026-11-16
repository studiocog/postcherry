'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import copy from 'copy-to-clipboard';
import { useDebounce } from 'use-debounce';
import { FormProvider, useFieldArray, useForm } from 'react-hook-form';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { showMediaBox } from '@gitroom/frontend/components/media/media.component';
import { Button } from '@gitroom/react/form/button';
import { Input } from '@gitroom/react/form/input';
import { Textarea } from '@gitroom/react/form/textarea';
import { hasExtension } from '@gitroom/helpers/utils/has.extension';
import { websiteUrl } from '@gitroom/frontend/components/auth/terms.notice';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import {
  BioPageChannelOption,
  BioPageLink,
  bioPageLimits,
  BioPageTheme,
  bioPageThemes,
  BioPageView as BioPageData,
  bioSlugProblem,
  BioSlugAvailability,
} from '@gitroom/nestjs-libraries/dtos/bio-page/bio-page.dto';
import {
  useBioPage,
  useBioPageChannels,
  useBioSlugAvailability,
} from '@gitroom/frontend/components/bio-page/bio.page.hooks';
import {
  bioPageThemeStyles,
  BioPageView,
} from '@gitroom/frontend/components/bio-page/bio.page.view';

interface BioPageForm {
  slug: string;
  title: string;
  description: string;
  avatar: { id: string | null; path: string } | null;
  theme: BioPageTheme;
  links: BioPageLink[];
  showChannels: boolean;
  channelIds: string[];
  published: boolean;
}

const toFormValues = (page?: Partial<BioPageData>): BioPageForm => ({
  slug: page?.slug || '',
  title: page?.title || '',
  description: page?.description || '',
  avatar: page?.avatar || null,
  theme: page?.theme || 'light',
  links: page?.links || [],
  showChannels: !!page?.showChannels,
  channelIds: page?.channelIds || [],
  published: !!page?.published,
});

// https:// is added when no scheme is typed
const toUrl = (value: string) => {
  const url = value.trim();
  if (!url) {
    return '';
  }

  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
};

// Close to the check of the server, so a wrong link is marked before saving
const isLinkUrl = (url: string) => {
  if (url.length > bioPageLimits.linkUrl || /[\s<>]/.test(url)) {
    return false;
  }

  try {
    const { protocol, hostname } = new URL(url);
    return ['http:', 'https:'].includes(protocol) && hostname.includes('.');
  } catch (err) {
    return false;
  }
};

const useSlugMessage = () => {
  const t = useT();
  return useCallback(
    (reason?: BioSlugAvailability['reason']) =>
      reason === 'length'
        ? t('bio_slug_length', 'Use {{min}} to {{max}} characters', {
            min: bioPageLimits.slugMin,
            max: bioPageLimits.slugMax,
          })
        : reason === 'format'
        ? t(
            'bio_slug_format',
            'Use lowercase letters, numbers and dashes, not at the start or the end'
          )
        : reason === 'reserved'
        ? t(
            'bio_slug_reserved',
            'This address is reserved, please pick another'
          )
        : reason === 'taken'
        ? t('bio_slug_taken', 'This address is already taken')
        : '',
    [t]
  );
};

export const BioPageComponent = () => {
  const t = useT();
  const { data, isLoading, isValidating, error, mutate } = useBioPage();

  if (error && !data) {
    return (
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col items-start gap-[12px]">
        <div>
          {t(
            'bio_page_load_failed',
            'We could not load your link in bio page.'
          )}
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
    <BioPageFormComponent
      key={String(data.updatedAt || 'new')}
      page={data}
      reload={mutate}
    />
  );
};

const SlugStatus: FC<{ slug: string; savedSlug: string }> = ({
  slug,
  savedSlug,
}) => {
  const t = useT();
  const slugMessage = useSlugMessage();
  const [debounced] = useDebounce(slug, 400);
  const problem = bioSlugProblem(debounced);
  // the saved address is always free for this workspace
  const { data, isLoading } = useBioSlugAvailability(
    debounced && !problem && debounced !== savedSlug ? debounced : null
  );

  if (!slug || slug !== debounced) {
    return <div className="text-[12px]">&nbsp;</div>;
  }

  if (problem) {
    return (
      <div className="text-[12px] text-red-400" role="status">
        {slugMessage(problem)}
      </div>
    );
  }

  if (slug === savedSlug) {
    return <div className="text-[12px]">&nbsp;</div>;
  }

  if (isLoading || !data) {
    return (
      <div className="text-[12px] text-textItemBlur" role="status">
        {t('bio_slug_checking', 'Checking...')}
      </div>
    );
  }

  return (
    <div
      role="status"
      className={clsx(
        'text-[12px]',
        data.available ? 'text-green-500' : 'text-red-400'
      )}
    >
      {data.available
        ? t('bio_slug_available', 'This address is available')
        : slugMessage(data.reason)}
    </div>
  );
};

const BioPageFormComponent: FC<{
  page: Partial<BioPageData>;
  reload: () => void;
}> = ({ page, reload }) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const user = useUser();
  const { frontEndUrl } = useVariables();
  const slugMessage = useSlugMessage();
  const readOnly = user?.role === 'USER';
  const savedSlug = page.slug || '';
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const { data: channelOptions } = useBioPageChannels();

  const form = useForm<BioPageForm>({
    defaultValues: toFormValues(page),
  });
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'links',
    keyName: 'key',
  });

  const values = form.watch();
  const publicUrl = `${frontEndUrl}/bio/${savedSlug}`;

  const themeLabels: Record<BioPageTheme, string> = {
    light: t('bio_theme_light', 'Light'),
    dark: t('bio_theme_dark', 'Dark'),
    cherry: t('bio_theme_cherry', 'Cherry'),
    blush: t('bio_theme_blush', 'Blush'),
  };

  const previewChannels = useMemo(
    () =>
      values.showChannels
        ? values.channelIds.flatMap((id) => {
            const channel = (channelOptions || []).find((p) => p.id === id);
            return channel ? [channel] : [];
          })
        : [],
    [values.showChannels, values.channelIds, channelOptions]
  );

  const chooseAvatar = useCallback(() => {
    showMediaBox((media) => {
      if (!media?.path) {
        return;
      }

      if (hasExtension(media.path, 'mp4')) {
        toaster.show(
          t(
            'bio_avatar_image_only',
            'The picture must be an image, not a video'
          ),
          'warning'
        );
        return;
      }

      form.setValue(
        'avatar',
        { id: media.id, path: media.path },
        { shouldDirty: true }
      );
    }, 'image');
  }, [form]);

  const addLink = useCallback(() => {
    if (fields.length >= bioPageLimits.links) {
      toaster.show(
        t('bio_links_too_many', 'You can add up to {{max}} links', {
          max: bioPageLimits.links,
        }),
        'warning'
      );
      return;
    }
    append({ id: makeId(10), title: '', url: '' });
  }, [fields.length, append]);

  const toggleChannel = useCallback(
    (channel: BioPageChannelOption, checked: boolean) => {
      const current = form.getValues('channelIds');
      form.setValue(
        'channelIds',
        checked
          ? [...current.filter((id) => id !== channel.id), channel.id]
          : current.filter((id) => id !== channel.id),
        { shouldDirty: true }
      );
    },
    [form]
  );

  const copyLink = useCallback(() => {
    copy(publicUrl);
    toaster.show(t('link_copied', 'Link copied to clipboard'), 'success');
  }, [publicUrl]);

  const save = useCallback(
    async (value: BioPageForm) => {
      const slug = value.slug.trim().toLowerCase();
      const links = value.links.map((link) => ({
        id: link.id,
        title: link.title.trim(),
        url: toUrl(link.url),
      }));

      // the same checks as the server, so the field that is wrong is marked
      form.clearErrors();
      let invalid = false;
      const slugProblem = bioSlugProblem(slug);
      if (slugProblem) {
        invalid = true;
        form.setError('slug', { message: slugMessage(slugProblem) });
      }
      links.forEach((link, index) => {
        if (!link.title) {
          invalid = true;
          form.setError(`links.${index}.title`, {
            message: t('bio_link_title_required', 'Please enter a title'),
          });
        }
        if (!isLinkUrl(link.url)) {
          invalid = true;
          form.setError(`links.${index}.url`, {
            message: t(
              'bio_link_url_invalid',
              'Please enter a valid link, like https://example.com'
            ),
          });
        }
      });

      if (invalid) {
        toaster.show(
          t('bio_page_fix_fields', 'Please fix the fields marked in red'),
          'warning'
        );
        return;
      }

      setSaving(true);
      try {
        const response = await fetch('/bio-page', {
          method: 'PUT',
          body: JSON.stringify({
            slug,
            title: value.title || null,
            description: value.description || null,
            avatarMediaId: value.avatar?.id || null,
            theme: value.theme,
            links,
            showChannels: value.showChannels,
            channelIds: value.channelIds,
            published: value.published,
          }),
        });

        if (!response.ok) {
          const { reason } = await response.json().catch(() => ({} as any));
          if (reason) {
            form.setError('slug', { message: slugMessage(reason) });
          }
          toaster.show(
            reason
              ? slugMessage(reason)
              : t(
                  'bio_page_save_failed',
                  'Could not save the page, please check the fields and try again'
                ),
            'warning'
          );
          return;
        }

        toaster.show(t('bio_page_saved', 'Link in bio page saved'), 'success');
        reload();
      } catch (err) {
        toaster.show(
          t('bio_page_save_error', 'Could not save the page, please try again'),
          'warning'
        );
      } finally {
        setSaving(false);
      }
    },
    [reload, form]
  );

  const linkErrors = form.formState.errors.links;

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
      <h3 className="text-[20px]">{t('link_in_bio', 'Link in bio')}</h3>
      <div className="text-textItemBlur mt-[4px]">
        {t(
          'bio_page_description',
          'One page with all your links, to put in the bio of your profiles.'
        )}
      </div>
      {readOnly && (
        <div className="mt-[8px] text-[14px] text-textItemBlur">
          {t(
            'bio_page_admin_only',
            'Only workspace admins can change the link in bio page'
          )}
        </div>
      )}
      {!!savedSlug && (
        <div className="mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[16px] flex items-center gap-[12px] flex-wrap">
          <div className="flex flex-col min-w-0 flex-1">
            <div className="text-[12px] text-textItemBlur">
              {page.published
                ? t('bio_page_live', 'Your page is live at')
                : t(
                    'bio_page_not_published',
                    'Your page is not published yet, it will be at'
                  )}
            </div>
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[14px] underline break-all"
            >
              {publicUrl}
            </a>
          </div>
          <Button onClick={copyLink} className="mobile:w-full">
            {t('copy_link', 'Copy link')}
          </Button>
        </div>
      )}
      <div className="flex gap-[16px] mt-[16px] tablet:flex-col">
        <FormProvider {...form}>
          <fieldset
            disabled={readOnly}
            className={clsx(
              'flex flex-col min-w-0 flex-1 gap-[16px]',
              readOnly && 'pointer-events-none'
            )}
          >
            <div className="bg-sixth border-fifth border rounded-[4px] p-[24px] mobile:p-[12px] flex flex-col gap-[8px]">
              <div className="text-[18px]">
                {t('bio_page_profile', 'Profile')}
              </div>
              <div className="flex flex-col gap-[6px]">
                <label htmlFor="bio-slug" className="text-[14px]">
                  {t('bio_page_address', 'Page address')}
                </label>
                <div className="flex items-center bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] min-w-0">
                  <span className="ps-[16px] text-[14px] text-textItemBlur whitespace-nowrap">
                    /bio/
                  </span>
                  <input
                    id="bio-slug"
                    aria-describedby="bio-slug-status"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={bioPageLimits.slugMax}
                    placeholder="your-name"
                    className="h-full bg-transparent outline-none flex-1 min-w-0 text-[14px] text-textColor pe-[16px]"
                    {...form.register('slug', {
                      // only the characters an address can have, and the
                      // live check replaces the error of the last save
                      onChange: (e) => {
                        form.clearErrors('slug');
                        form.setValue(
                          'slug',
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, '')
                        );
                      },
                    })}
                  />
                </div>
                <div id="bio-slug-status">
                  {form.formState.errors.slug?.message ? (
                    <div className="text-[12px] text-red-400" role="status">
                      {form.formState.errors.slug.message}
                    </div>
                  ) : (
                    <SlugStatus slug={values.slug} savedSlug={savedSlug} />
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-[6px]">
                <div className="text-[14px]">{t('bio_avatar', 'Picture')}</div>
                <div className="flex items-center gap-[16px] flex-wrap">
                  <div className="w-[64px] h-[64px] rounded-full border border-newTableBorder bg-newBgColorInner flex items-center justify-center overflow-hidden">
                    {!!values.avatar?.path && (
                      <img
                        src={values.avatar.path}
                        alt={t('bio_avatar', 'Picture')}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <Button onClick={chooseAvatar}>
                    {t('bio_choose_avatar', 'Choose picture')}
                  </Button>
                  {!!values.avatar && (
                    <Button
                      secondary={true}
                      onClick={() =>
                        form.setValue('avatar', null, { shouldDirty: true })
                      }
                    >
                      {t('remove', 'Remove')}
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-[8px]">
                <Input
                  label={t('bio_title', 'Title')}
                  translationKey="bio_title"
                  name="title"
                  maxLength={bioPageLimits.title}
                  placeholder={t('bio_title_placeholder', 'Your name or brand')}
                />
              </div>
              <Textarea
                label={t('bio_short_bio', 'Short bio')}
                translationKey="bio_short_bio"
                name="description"
                maxLength={bioPageLimits.description}
                className="!min-h-[80px] resize-none"
                placeholder={t(
                  'bio_short_bio_placeholder',
                  'A few words about you'
                )}
              />
              <fieldset className="flex flex-col gap-[8px]">
                <legend className="text-[14px] mb-[6px]">
                  {t('bio_theme', 'Theme')}
                </legend>
                <div className="grid grid-cols-4 mobile:grid-cols-2 gap-[8px]">
                  {bioPageThemes.map((theme) => (
                    <label
                      key={theme}
                      className={clsx(
                        'flex flex-col items-center gap-[6px] p-[8px] rounded-[8px] border-2 cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-btnPrimary',
                        values.theme === theme
                          ? 'border-btnPrimary'
                          : 'border-newTableBorder'
                      )}
                    >
                      <input
                        type="radio"
                        value={theme}
                        className="sr-only"
                        {...form.register('theme')}
                      />
                      <div
                        aria-hidden="true"
                        className={clsx(
                          'w-full h-[40px] rounded-[6px] flex items-center justify-center',
                          bioPageThemeStyles[theme].page
                        )}
                      >
                        <div
                          className={clsx(
                            'w-[60%] h-[12px] rounded-full border',
                            bioPageThemeStyles[theme].link
                          )}
                        />
                      </div>
                      <span className="text-[13px]">{themeLabels[theme]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="bg-sixth border-fifth border rounded-[4px] p-[24px] mobile:p-[12px] flex flex-col gap-[12px]">
              <div className="flex items-center justify-between gap-[12px] flex-wrap">
                <div className="flex flex-col">
                  <div className="text-[18px]">{t('bio_links', 'Links')}</div>
                  <div className="text-[12px] text-textItemBlur">
                    {t(
                      'bio_links_hint',
                      'Up to {{max}} links, drag them or use the arrows to change the order.',
                      { max: bioPageLimits.links }
                    )}
                  </div>
                </div>
                <Button onClick={addLink} className="mobile:w-full">
                  {t('bio_add_link', 'Add link')}
                </Button>
              </div>
              {!fields.length && (
                <div className="text-[14px] text-textItemBlur">
                  {t('bio_no_links_yet', 'No links yet, add your first one.')}
                </div>
              )}
              <ol className="flex flex-col gap-[8px]">
                {fields.map((field, index) => (
                  <li
                    key={field.key}
                    draggable={!readOnly}
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIndex !== null && dragIndex !== index) {
                        move(dragIndex, index);
                      }
                      setDragIndex(null);
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    className={clsx(
                      'flex gap-[8px] items-start rounded-[8px] border border-newTableBorder bg-newBgColorInner p-[8px]',
                      dragIndex === index && 'opacity-50'
                    )}
                  >
                    <div
                      aria-hidden="true"
                      className="cursor-grab text-textItemBlur pt-[10px] px-[4px] select-none"
                    >
                      ⋮⋮
                    </div>
                    <div className="flex-1 min-w-0 grid grid-cols-2 mobile:grid-cols-1 gap-[8px]">
                      {(['title', 'url'] as const).map((key) => (
                        <div
                          key={key}
                          className="flex flex-col gap-[4px] min-w-0"
                        >
                          <input
                            aria-label={
                              key === 'title'
                                ? t('bio_link_title', 'Link {{index}} title', {
                                    index: index + 1,
                                  })
                                : t('bio_link_url', 'Link {{index}} address', {
                                    index: index + 1,
                                  })
                            }
                            maxLength={
                              key === 'title'
                                ? bioPageLimits.linkTitle
                                : bioPageLimits.linkUrl
                            }
                            placeholder={
                              key === 'title'
                                ? t('bio_link_title_placeholder', 'My website')
                                : 'https://example.com'
                            }
                            className="bg-newBgColor h-[38px] border-newTableBorder border rounded-[8px] px-[12px] text-[14px] text-textColor outline-none min-w-0"
                            {...form.register(`links.${index}.${key}`)}
                          />
                          {!!linkErrors?.[index]?.[key]?.message && (
                            <div className="text-red-400 text-[12px]">
                              {linkErrors[index]?.[key]?.message}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-[4px] pt-[4px]">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => move(index, index - 1)}
                        aria-label={t('bio_move_up', 'Move up')}
                        className="w-[30px] h-[30px] rounded-[6px] bg-btnSimple disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === fields.length - 1}
                        onClick={() => move(index, index + 1)}
                        aria-label={t('bio_move_down', 'Move down')}
                        className="w-[30px] h-[30px] rounded-[6px] bg-btnSimple disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        aria-label={t('bio_remove_link', 'Remove link')}
                        className="w-[30px] h-[30px] rounded-[6px] bg-btnSimple text-red-400"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="bg-sixth border-fifth border rounded-[4px] p-[24px] mobile:p-[12px] flex flex-col gap-[12px]">
              <label className="flex items-center gap-[10px] cursor-pointer self-start">
                <input
                  type="checkbox"
                  className="w-[18px] h-[18px] accent-forth cursor-pointer shrink-0"
                  {...form.register('showChannels')}
                />
                <span className="text-[16px]">
                  {t('bio_show_channels', 'Show icons of my channels')}
                </span>
              </label>
              {values.showChannels &&
                (channelOptions?.length ? (
                  <div className="grid grid-cols-2 mobile:grid-cols-1 gap-[8px] ps-[28px]">
                    {channelOptions.map((channel) => (
                      <label
                        key={channel.id}
                        className="flex items-center gap-[10px] min-w-0 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          className="w-[18px] h-[18px] accent-forth cursor-pointer shrink-0"
                          checked={values.channelIds.includes(channel.id)}
                          onChange={(e) =>
                            toggleChannel(channel, e.target.checked)
                          }
                        />
                        <img
                          src={`/icons/platforms/${channel.identifier}.png`}
                          alt=""
                          className="w-[20px] h-[20px] rounded-[4px] shrink-0"
                        />
                        <span className="text-[14px] truncate">
                          {channel.name}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="text-[14px] text-textItemBlur ps-[28px]">
                    {t(
                      'bio_no_channels',
                      'None of your connected channels has a public profile we can link to yet.'
                    )}
                  </div>
                ))}
              <label className="flex items-center gap-[10px] cursor-pointer self-start">
                <input
                  type="checkbox"
                  className="w-[18px] h-[18px] accent-forth cursor-pointer shrink-0"
                  {...form.register('published')}
                />
                <span className="text-[16px]">
                  {t(
                    'bio_publish',
                    'Publish the page, anyone with the link can see it'
                  )}
                </span>
              </label>
            </div>
          </fieldset>
        </FormProvider>

        <div className="w-[360px] tablet:w-full shrink-0">
          <div className="sticky top-0 flex flex-col gap-[8px]">
            <div className="text-[14px] text-textItemBlur">
              {t('preview', 'Preview')}
            </div>
            <div
              aria-label={t('preview', 'Preview')}
              className="rounded-[24px] border-[6px] border-newTableBorder overflow-hidden h-[600px] overflow-y-auto"
            >
              <BioPageView
                preview={true}
                websiteUrl={websiteUrl}
                className="min-h-full"
                labels={{
                  madeWith: t('bio_made_with', 'Made with PostCherry'),
                  noLinks: t('bio_preview_no_links', 'Your links show here'),
                }}
                page={{
                  title: values.title.trim() || null,
                  description: values.description.trim() || null,
                  avatar: values.avatar?.path || null,
                  theme: values.theme,
                  links: values.links
                    .filter((link) => !!link.title.trim())
                    .map((link) => ({
                      title: link.title.trim(),
                      url: toUrl(link.url),
                    })),
                  channels: previewChannels,
                }}
              />
            </div>
          </div>
        </div>
      </div>
      {!readOnly && (
        <div className="mt-[16px]">
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
