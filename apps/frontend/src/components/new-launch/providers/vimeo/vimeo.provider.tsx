'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { VimeoDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/vimeo.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';

const VimeoSettings: FC = () => {
  const { register } = useSettings();
  return (
    <div className="flex flex-col">
      <Input label="Title" {...register('title')} maxLength={128} />
    </div>
  );
};

export default withProvider({
  postComment: PostComment.COMMENT,
  comments: false,
  minimumCharacters: [],
  SettingsComponent: VimeoSettings,
  CustomPreviewComponent: undefined,
  dto: VimeoDto,
  maximumCharacters: 5000,
});
