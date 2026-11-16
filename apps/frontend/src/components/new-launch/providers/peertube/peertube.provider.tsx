'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { PeertubeDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/peertube.dto';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { Input } from '@gitroom/react/form/input';
import { PeertubeChannelSelect } from '@gitroom/frontend/components/new-launch/providers/peertube/peertube.channel.select';

const PeertubeSettings: FC = () => {
  const { register } = useSettings();
  return (
    <div className="flex flex-col">
      <Input label="Title" {...register('title')} maxLength={120} />
      <PeertubeChannelSelect {...register('channel')} />
    </div>
  );
};

export default withProvider({
  postComment: PostComment.COMMENT,
  comments: false,
  minimumCharacters: [],
  SettingsComponent: PeertubeSettings,
  CustomPreviewComponent: undefined,
  dto: PeertubeDto,
  maximumCharacters: 10000,
});
