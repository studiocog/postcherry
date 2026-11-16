'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { GhostDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/ghost.dto';
import { Input } from '@gitroom/react/form/input';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';

const SettingsComponent = () => {
  const form = useSettings();

  return (
    <>
      <Input label="Title" {...form.register('title')} />
      <Input label="Tags (comma separated)" {...form.register('tags')} />
    </>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: SettingsComponent,
  CustomPreviewComponent: undefined,
  dto: GhostDto,
  maximumCharacters: 100000,
  inlineImages: true,
});
