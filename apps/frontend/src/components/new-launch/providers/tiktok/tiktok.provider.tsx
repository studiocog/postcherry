'use client';

import { FC, ReactNode, useEffect, useMemo } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { TikTokDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/tiktok.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Select } from '@gitroom/react/form/select';
import { Checkbox } from '@gitroom/react/form/checkbox';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { Input } from '@gitroom/react/form/input';
import { TiktokPreview } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.preview';
import { TikTokMusicSelector } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.music';
import { TikTokLocationSelector } from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.location';
import {
  useTikTokCreatorInfo,
  useTikTokVideoDuration,
} from '@gitroom/frontend/components/new-launch/providers/tiktok/tiktok.creator.info';
import { useLaunchStore } from '@gitroom/frontend/components/new-launch/store';

const TikTokNotice: FC<{
  children: ReactNode;
  className?: string;
}> = ({ children, className }) => {
  return (
    <div
      className={clsx(
        'bg-tableBorder p-[10px] rounded-[10px] flex gap-[10px] items-start text-[13px] text-balance',
        className
      )}
    >
      <div className="shrink-0 mt-[2px]">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M22.201 17.6335L14.0026 3.39569C13.7977 3.04687 13.5052 2.75764 13.1541 2.55668C12.803 2.35572 12.4055 2.25 12.001 2.25C11.5965 2.25 11.199 2.35572 10.8479 2.55668C10.4968 2.75764 10.2043 3.04687 9.99944 3.39569L1.80101 17.6335C1.60388 17.9709 1.5 18.3546 1.5 18.7454C1.5 19.1361 1.60388 19.5199 1.80101 19.8572C2.00325 20.2082 2.29523 20.499 2.64697 20.6998C2.99871 20.9006 3.39755 21.0043 3.80257 21.0001H20.1994C20.6041 21.0039 21.0026 20.9001 21.354 20.6993C21.7054 20.4985 21.997 20.2079 22.1991 19.8572C22.3965 19.52 22.5007 19.1364 22.5011 18.7456C22.5014 18.3549 22.3978 17.9711 22.201 17.6335ZM11.251 9.75006C11.251 9.55115 11.33 9.36038 11.4707 9.21973C11.6113 9.07908 11.8021 9.00006 12.001 9.00006C12.1999 9.00006 12.3907 9.07908 12.5313 9.21973C12.672 9.36038 12.751 9.55115 12.751 9.75006V13.5001C12.751 13.699 12.672 13.8897 12.5313 14.0304C12.3907 14.171 12.1999 14.2501 12.001 14.2501C11.8021 14.2501 11.6113 14.171 11.4707 14.0304C11.33 13.8897 11.251 13.699 11.251 13.5001V9.75006ZM12.001 18.0001C11.7785 18.0001 11.561 17.9341 11.376 17.8105C11.191 17.6868 11.0468 17.5111 10.9616 17.3056C10.8765 17.1 10.8542 16.8738 10.8976 16.6556C10.941 16.4374 11.0482 16.2369 11.2055 16.0796C11.3628 15.9222 11.5633 15.8151 11.7815 15.7717C11.9998 15.7283 12.226 15.7505 12.4315 15.8357C12.6371 15.9208 12.8128 16.065 12.9364 16.25C13.06 16.4351 13.126 16.6526 13.126 16.8751C13.126 17.1734 13.0075 17.4596 12.7965 17.6706C12.5855 17.8815 12.2994 18.0001 12.001 18.0001Z"
            fill="currentColor"
          />
        </svg>
      </div>
      <div>{children}</div>
    </div>
  );
};

// The composer follows TikTok's Content Sharing Guidelines: the creator's
// live settings come from creator_info, nothing is chosen for the creator
// (privacy, interactions, disclosure), and the consent text is always shown.
const TikTokSettings: FC<{
  values?: any;
}> = (props) => {
  const { watch, register, setValue } = useSettings();
  const { value, integration } = useIntegration();
  const t = useT();
  const setBlocker = useLaunchStore((state) => state.setBlocker);

  // Music and location come from the Business API (v1.3) - the legacy Content
  // Posting API used by the "tiktok" identifier has no such fields. The
  // Business API has no creator_info either.
  const isBusiness = integration?.identifier === 'tiktok-business';

  const isTitle = useMemo(() => {
    return value?.[0]?.image?.some((p) => (p?.path?.indexOf?.('mp4') ?? -1) === -1);
  }, [value]);

  const hasMedia = (value?.[0]?.image?.length ?? 0) > 0;
  const isVideo = hasMedia && !isTitle;

  const disclose = watch('disclose');
  const autoAddMusic = watch('autoAddMusic');
  const brand_organic_toggle = watch('brand_organic_toggle');
  const brand_content_toggle = watch('brand_content_toggle');
  const privacy_level = watch('privacy_level');
  const comment = watch('comment');
  const duet = watch('duet');
  const stitch = watch('stitch');
  const content_posting_method = watch('content_posting_method');
  const isUploadMode = content_posting_method === 'UPLOAD';

  const { data: creator } = useTikTokCreatorInfo();
  const creatorInfo = creator || undefined;
  const { data: videoDuration } = useTikTokVideoDuration(
    isVideo && !isBusiness ? value?.[0]?.image?.[0]?.path : undefined
  );

  // TikTok ignores every setting except the title / content when the posting
  // method is UPLOAD, so we hide them rather than pretend they apply. The fields
  // stay mounted and registered: their values must survive the switch, and
  // TikTokDto still requires most of them at save time.
  const directPostOnly = clsx(isUploadMode && 'invisible h-0 overflow-hidden');

  const tiktokRestrictionNotice = useMemo(() => {
    if (!hasMedia || !isVideo) return null;
    if (!isUploadMode) {
      return t(
        'tiktok_restriction_direct_video',
        'TikTok restriction: For direct post with video, your post content is used as the title. A separate title field is not available.'
      );
    }
    return t(
      'tiktok_restriction_upload_video_caption',
      'TikTok restriction: For upload-only video, TikTok does not accept a title or caption. You can add your caption inside the TikTok app before publishing.'
    );
  }, [hasMedia, isUploadMode, isVideo, t]);

  const privacyLabels: Record<string, string> = {
    PUBLIC_TO_EVERYONE: t('tiktok_privacy_everyone', 'Everyone'),
    MUTUAL_FOLLOW_FRIENDS: t('tiktok_privacy_friends', 'Friends'),
    FOLLOWER_OF_CREATOR: t('tiktok_privacy_followers', 'Followers'),
    SELF_ONLY: t('tiktok_privacy_only_me', 'Only me'),
  };

  // Built from the creator's privacy_level_options. TikTok Business has no
  // creator_info, it keeps the full list.
  const privacyOptions = isBusiness
    ? Object.keys(privacyLabels)
    : creatorInfo?.privacyLevelOptions || [];

  // A privacy level the creator can no longer use must be chosen again
  useEffect(() => {
    if (
      !creatorInfo?.canPost ||
      !creatorInfo.privacyLevelOptions.length ||
      !privacy_level ||
      creatorInfo.privacyLevelOptions.includes(privacy_level)
    ) {
      return;
    }
    setValue('privacy_level', '', { shouldValidate: true });
  }, [creatorInfo, privacy_level]);

  // Interactions the creator turned off in the TikTok app can't be allowed
  useEffect(() => {
    if (creatorInfo?.commentDisabled && comment) {
      setValue('comment', false);
    }
    if (creatorInfo?.duetDisabled && duet) {
      setValue('duet', false);
    }
    if (creatorInfo?.stitchDisabled && stitch) {
      setValue('stitch', false);
    }
  }, [creatorInfo, comment, duet, stitch]);

  // Turning the disclosure off withdraws its answers, so a hidden "Branded
  // content" is never sent to TikTok. Posts made through the API have no
  // `disclose` field: their brand toggles are the disclosure.
  useEffect(() => {
    if (disclose === undefined) {
      if (brand_organic_toggle || brand_content_toggle) {
        setValue('disclose', true);
      }
      return;
    }
    if (disclose === false) {
      if (brand_organic_toggle) {
        setValue('brand_organic_toggle', false);
      }
      if (brand_content_toggle) {
        setValue('brand_content_toggle', false);
      }
    }
  }, [disclose]);

  // What stops this channel from being published right now (the composer
  // refuses to publish while it's set, drafts are still allowed)
  const blocker = useMemo(() => {
    if (isBusiness || isUploadMode || creator === undefined) {
      return '';
    }
    if (creator === false) {
      return t(
        'tiktok_creator_info_failed',
        'We could not load your TikTok account settings, please close the post and open it again'
      );
    }
    if (!creator.canPost) {
      return (
        creator.error ||
        t(
          'tiktok_creator_cannot_post',
          'TikTok does not allow this account to post right now, please try again later'
        )
      );
    }
    if (
      isVideo &&
      videoDuration &&
      creator.maxVideoPostDurationSec &&
      videoDuration > creator.maxVideoPostDurationSec
    ) {
      return t(
        'tiktok_video_too_long',
        'This video is {{duration}} seconds long, your TikTok account can post videos of up to {{max}} seconds',
        {
          duration: Math.ceil(videoDuration),
          max: creator.maxVideoPostDurationSec,
        }
      );
    }
    return '';
  }, [isBusiness, isUploadMode, creator, isVideo, videoDuration, t]);

  useEffect(() => {
    if (!integration?.id) {
      return;
    }
    setBlocker(integration.id, blocker);
  }, [integration?.id, blocker]);

  useEffect(() => {
    const id = integration?.id;
    return () => {
      if (id) {
        setBlocker(id, undefined);
      }
    };
  }, [integration?.id]);

  const disclosureLabel = useMemo(() => {
    if (brand_content_toggle) {
      return isTitle
        ? t(
            'tiktok_labeled_paid_partnership_photo',
            "Your photo will be labeled as 'Paid partnership'."
          )
        : t(
            'tiktok_labeled_paid_partnership_video',
            "Your video will be labeled as 'Paid partnership'."
          );
    }
    if (brand_organic_toggle) {
      return isTitle
        ? t(
            'tiktok_labeled_promotional_photo',
            "Your photo will be labeled as 'Promotional content'."
          )
        : t(
            'tiktok_labeled_promotional_video',
            "Your video will be labeled as 'Promotional content'."
          );
    }
    return '';
  }, [brand_content_toggle, brand_organic_toggle, isTitle, t]);

  const contentPostingMethod = [
    {
      value: 'DIRECT_POST',
      label: t(
        'post_content_directly_to_tiktok',
        'Post content directly to TikTok'
      ),
    },
    {
      value: 'UPLOAD',
      label: t(
        'upload_content_to_tiktok_without_posting',
        'Upload content to TikTok without posting it'
      ),
    },
  ];
  const yesNo = [
    {
      value: 'yes',
      label: t('yes', 'Yes'),
    },
    {
      value: 'no',
      label: t('no', 'No'),
    },
  ];

  const brandedContentPrivate = t(
    'tiktok_branded_content_cannot_be_private',
    'Branded content visibility cannot be set to private.'
  );

  return (
    <div className="flex flex-col">
      {!isBusiness && (
        <div className="flex items-center gap-[10px] mb-[18px] text-[14px]">
          {creatorInfo ? (
            <>
              <img
                src={
                  creatorInfo.avatar ||
                  integration?.picture ||
                  '/no-picture.jpg'
                }
                alt={creatorInfo.nickname}
                className="w-[24px] h-[24px] rounded-full"
              />
              <div>
                {t('tiktok_posting_to', 'Posting to')}{' '}
                <span className="font-[600]">{creatorInfo.nickname}</span>
              </div>
            </>
          ) : creator === undefined ? (
            <div>
              {t('tiktok_loading_creator', 'Loading your TikTok account...')}
            </div>
          ) : null}
        </div>
      )}
      {!!blocker && (
        <TikTokNotice className="mb-[18px] text-red-400">{blocker}</TikTokNotice>
      )}
      {tiktokRestrictionNotice && (
        <TikTokNotice className="mb-[18px]">
          {tiktokRestrictionNotice}
        </TikTokNotice>
      )}
      {isTitle && <Input label="Title" {...register('title')} maxLength={89} />}
      <div className={directPostOnly}>
        {/* No default: the creator always picks who can see the post */}
        <Select
          label={t('label_who_can_see_this_video', 'Who can see this video?')}
          disabled={isUploadMode}
          {...register('privacy_level')}
        >
          <option value="">{t('select', 'Select')}</option>
          {privacyOptions.map((item) => (
            <option
              key={item}
              value={item}
              disabled={item === 'SELF_ONLY' && !!brand_content_toggle}
            >
              {privacyLabels[item] || item}
            </option>
          ))}
        </Select>
        {!!brand_content_toggle && (
          <div className="text-[14px] -mt-[10px] mb-[10px] text-balance">
            {brandedContentPrivate}
          </div>
        )}
      </div>
      <div className="text-[14px] mt-[10px] mb-[18px] text-balance">
        {t(
          'choose_upload_without_posting_description',
          `Choose upload without posting if you want to review and edit your content within TikTok's app before publishing.
        This gives you access to TikTok's built-in editing tools and lets you make final adjustments before posting. The additional settings are only available when posting directly to TikTok.`
        )}
      </div>
      <Select
        label={t('label_content_posting_method', 'Content posting method')}
        {...register('content_posting_method', {
          value: 'DIRECT_POST',
        })}
      >
        <option value="">{t('select', 'Select')}</option>
        {contentPostingMethod.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </Select>
      {isUploadMode && <div className="-mt-[23px] mb-[23px] text-red-600">After posting you fill find a notification inside your Inbox about your post (not content studio)</div>}
      <div className={clsx('flex flex-col', directPostOnly)}>
        <Select
          label={
            isBusiness
              ? t('label_add_random_music', 'Add random music')
              : t('label_auto_add_music', 'Auto add music')
          }
          disabled={isUploadMode}
          {...register('autoAddMusic', {
            value: 'no',
          })}
        >
          <option value="">{t('select', 'Select')}</option>
          {yesNo.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
        <div className="text-[14px] mt-[10px] mb-[24px] text-balance">
          {isBusiness
            ? t(
                'tiktok_random_music_only_for_photos',
                'This feature is available only for photos, it adds a random trending track from TikTok\'s commercial music library.'
              )
            : t(
                'this_feature_available_only_for_photos',
                'This feature available only for photos, it will add a default music that\n        you can change later.'
              )}
        </div>
        {isBusiness && (
          <div className="flex flex-col gap-[18px] mb-[24px]">
            {/* Random music replaces a manual choice for photos, so the
                selector is hidden (but stays registered) while it's on. */}
            <div
              className={clsx(
                !isVideo &&
                  autoAddMusic === 'yes' &&
                  'invisible h-0 overflow-hidden'
              )}
            >
              <TikTokMusicSelector
                label={t('tiktok_music_label', 'Music')}
                showVolumes={isVideo}
                {...register('music')}
              />
            </div>
            <TikTokLocationSelector
              label={t('tiktok_location_label', 'Location')}
              {...register('location')}
            />
          </div>
        )}
        <hr className="mb-[15px] border-tableBorder" />
        {/* Interactions are off until the creator turns them on. Photos only
            have comments: TikTok has no duet / stitch for them. */}
        <div className="text-[14px] mb-[10px]">
          {t('tiktok_allow_users_to', 'Allow users to')}
        </div>
        <div className="flex gap-[40px]">
          <Checkbox
            label={t('tiktok_allow_comment', 'Comment')}
            variant="hollow"
            disabled={isUploadMode || !!creatorInfo?.commentDisabled}
            {...register('comment', {
              value: false,
            })}
          />
          <div className={clsx(isTitle && 'hidden')}>
            <Checkbox
              variant="hollow"
              label={t('tiktok_allow_duet', 'Duet')}
              disabled={isUploadMode || !!creatorInfo?.duetDisabled}
              {...register('duet', {
                value: false,
              })}
            />
          </div>
          <div className={clsx(isTitle && 'hidden')}>
            <Checkbox
              label={t('tiktok_allow_stitch', 'Stitch')}
              variant="hollow"
              disabled={isUploadMode || !!creatorInfo?.stitchDisabled}
              {...register('stitch', {
                value: false,
              })}
            />
          </div>
        </div>
        {(creatorInfo?.commentDisabled ||
          (!isTitle &&
            (creatorInfo?.duetDisabled || creatorInfo?.stitchDisabled))) && (
          <div className="text-[14px] mt-[10px] text-balance">
            {t(
              'tiktok_interactions_disabled_in_app',
              'Greyed out interactions are turned off in your TikTok app settings.'
            )}
          </div>
        )}
        <div className={clsx('mt-[20px]', isTitle && 'hidden')}>
          <Checkbox
            label={t('video_made_with_ai', 'Video made with AI')}
            variant="hollow"
            disabled={isUploadMode}
            {...register('video_made_with_ai', {
              value: false,
            })}
          />
        </div>
        <hr className="my-[15px] mb-[25px] border-tableBorder" />
        <div className="flex flex-col gap-[20px]">
          <Checkbox
            variant="hollow"
            label={t('label_disclose_video_content', 'Disclose Video Content')}
            disabled={isUploadMode}
            {...register('disclose', {
              value: false,
            })}
          />
          {disclose && (
            <TikTokNotice className="mt-[10px] text-[14px]">
              {disclosureLabel ? (
                <>
                  {disclosureLabel}
                  <br />
                  {t(
                    'this_cannot_be_changed_once_posted',
                    'This cannot be changed once your video is posted.'
                  )}
                </>
              ) : (
                <span className="text-red-400">
                  {t(
                    'tiktok_disclosure_choose_one',
                    'You need to indicate if your content promotes yourself, a third party, or both.'
                  )}
                </span>
              )}
            </TikTokNotice>
          )}
          <div className="text-[14px] my-[10px] text-balance">
            {t(
              'turn_on_to_disclose_video_promotes',
              'Turn on to disclose that this video promotes goods or services in\n          exchange for something of value. You video could promote yourself, a\n          third party, or both.'
            )}
          </div>
        </div>
        <div className={clsx(!disclose && 'invisible h-0 overflow-hidden', 'mt-[20px]')}>
          <Checkbox
            variant="hollow"
            label={t('label_your_brand', 'Your brand')}
            disabled={isUploadMode}
            {...register('brand_organic_toggle', {
              value: false,
            })}
          />
          <div className="text-balance my-[10px] text-[14px]">
            {t(
              'you_are_promoting_yourself',
              'You are promoting yourself or your own brand.'
            )}
            <br />
            {t(
              'this_video_will_be_classified_brand_organic',
              'This video will be classified as Brand Organic.'
            )}
          </div>
          <Checkbox
            variant="hollow"
            label={t('label_branded_content', 'Branded content')}
            disabled={isUploadMode || privacy_level === 'SELF_ONLY'}
            {...register('brand_content_toggle', {
              value: false,
            })}
          />
          <div className="text-balance my-[10px] text-[14px]">
            {t(
              'you_are_promoting_another_brand',
              'You are promoting another brand or a third party.'
            )}
            <br />
            {t(
              'this_video_will_be_classified_branded_content',
              'This video will be classified as Branded Content.'
            )}
            {privacy_level === 'SELF_ONLY' && (
              <>
                <br />
                {brandedContentPrivate}
              </>
            )}
          </div>
        </div>
      </div>
      {/* Shown before every post, whatever the disclosure says */}
      <div className="mt-[10px] text-[14px] text-balance">
        {t('by_posting_you_agree_to_tiktoks', "By posting, you agree to TikTok's")}{' '}
        {!!brand_content_toggle && (
          <>
            <a
              target="_blank"
              rel="noreferrer"
              className="text-[#B69DEC] hover:underline"
              href="https://www.tiktok.com/legal/page/global/bc-policy/en"
            >
              {t('branded_content_policy', 'Branded Content Policy')}
            </a>{' '}
            {t('and', 'and')}{' '}
          </>
        )}
        <a
          target="_blank"
          rel="noreferrer"
          className="text-[#B69DEC] hover:underline"
          href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
        >
          {t('music_usage_confirmation', 'Music Usage Confirmation')}
        </a>
        .
      </div>
      {!isUploadMode && (
        <div className="mt-[10px] text-[14px] text-balance">
          {t(
            'tiktok_processing_notice',
            'After you publish, it may take a few minutes for your content to process and appear on your TikTok profile.'
          )}
        </div>
      )}
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: TikTokSettings,
  comments: false,
  CustomPreviewComponent: TiktokPreview,
  dto: TikTokDto,
  maximumCharacters: 2000,
});
