'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { BeehiivDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/beehiiv.dto';
import { Input } from '@gitroom/react/form/input';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';

const SettingsComponent = () => {
  const form = useSettings();

  return (
    <>
      <Input label="Title" {...form.register('title')} />
      <Input label="Subtitle" {...form.register('subtitle')} />
    </>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: SettingsComponent,
  CustomPreviewComponent: undefined,
  dto: BeehiivDto,
  maximumCharacters: 100000,
  inlineImages: true,
});
