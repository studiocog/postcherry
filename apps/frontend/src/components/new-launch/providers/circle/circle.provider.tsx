'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { CircleDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/circle.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { CircleSpaceSelect } from '@gitroom/frontend/components/new-launch/providers/circle/circle.space.select';

const CircleSettings: FC = () => {
  const { register } = useSettings();
  return (
    <div className="flex flex-col">
      <Input label="Title" {...register('title')} />
      <CircleSpaceSelect {...register('space')} />
    </div>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  comments: false,
  minimumCharacters: [],
  SettingsComponent: CircleSettings,
  CustomPreviewComponent: undefined,
  dto: CircleDto,
  maximumCharacters: 50000,
});
