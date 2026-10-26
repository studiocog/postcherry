'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { YoutubeSettingsDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { MediumTags } from '@gitroom/frontend/components/new-launch/providers/medium/medium.tags';
import { MediaComponent } from '@gitroom/frontend/components/media/media.component';
import { Select } from '@gitroom/react/form/select';
import { YoutubePreview } from '@gitroom/frontend/components/new-launch/providers/youtube/youtube.preview';
import { Checkbox } from '@gitroom/react/form/checkbox';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
const type = [
  {
    label: 'Public',
    value: 'public',
  },
  {
    label: 'Private',
    value: 'private',
  },
  {
    label: 'Unlisted',
    value: 'unlisted',
  },
];

const madeForKids = [
  {
    label: 'No',
    value: 'no',
  },
  {
    label: 'Yes',
    value: 'yes',
  },
];
// YouTube API policy: privacy and "made for kids" are always an explicit
// choice of the user, so both selects start empty.
const YoutubeSettings: FC = () => {
  const t = useT();
  const { register, formState } = useSettings();
  const communityGuidelinesError = formState?.errors?.communityGuidelines
    ?.message as string | undefined;

  return (
    <div className="flex flex-col">
      <Input label="Title" {...register('title')} maxLength={100} />
      <Select
        label={t('youtube_privacy', 'Privacy')}
        {...register('type')}
      >
        <option value="">
          {t('youtube_select_privacy', '-- Select privacy --')}
        </option>
        {type.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <Select
        label={t('youtube_made_for_kids', 'Made for kids')}
        {...register('selfDeclaredMadeForKids')}
      >
        <option value="">
          {t('youtube_select_made_for_kids', '-- Select an option --')}
        </option>
        {madeForKids.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>
      <MediumTags label="Tags" {...register('tags')} />
      <div className="mt-[20px]">
        <MediaComponent
          type="image"
          width={1280}
          height={720}
          label="Thumbnail"
          description="Thumbnail picture (optional)"
          {...register('thumbnail')}
        />
      </div>
      <div className="mt-[20px] flex flex-col gap-[6px]">
        <div className="flex gap-[10px] items-center">
          <Checkbox variant="hollow" {...register('communityGuidelines')} />
          <div className="text-[14px]">
            {t(
              'youtube_community_guidelines_confirm',
              'I confirm this video follows the'
            )}{' '}
            <a
              href="https://www.youtube.com/howyoutubeworks/policies/community-guidelines/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:font-bold"
            >
              {t(
                'youtube_community_guidelines',
                'YouTube Community Guidelines'
              )}
            </a>
          </div>
        </div>
        <div className="text-red-400 text-[12px]">
          {communityGuidelinesError || <>&nbsp;</>}
        </div>
        <div className="text-[12px] text-textItemBlur">
          {t(
            'youtube_terms_notice',
            'By uploading to YouTube you agree to the'
          )}{' '}
          <a
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:font-bold"
          >
            {t('youtube_terms_of_service', 'YouTube Terms of Service')}
          </a>{' '}
          {t('and', 'and')}{' '}
          <a
            href="http://www.google.com/policies/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:font-bold"
          >
            {t('google_privacy_policy', 'Google Privacy Policy')}
          </a>
        </div>
      </div>
    </div>
  );
};
export default withProvider({
  postComment: PostComment.COMMENT,
  comments: false,
  minimumCharacters: [],
  SettingsComponent: YoutubeSettings,
  CustomPreviewComponent: YoutubePreview,
  dto: YoutubeSettingsDto,
  maximumCharacters: 5000,
});
