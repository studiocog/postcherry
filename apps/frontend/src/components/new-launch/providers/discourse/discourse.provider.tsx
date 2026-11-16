'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { DiscourseDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/discourse.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { DiscourseCategorySelect } from '@gitroom/frontend/components/new-launch/providers/discourse/discourse.category.select';

const DiscourseSettings: FC = () => {
  const { register } = useSettings();
  return (
    <div className="flex flex-col">
      <Input label="Title" {...register('title')} />
      <DiscourseCategorySelect {...register('category')} />
    </div>
  );
};

export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: DiscourseSettings,
  CustomPreviewComponent: undefined,
  dto: DiscourseDto,
  maximumCharacters: 32000,
});
