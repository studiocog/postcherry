'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { KitDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/kit.dto';
import { Input } from '@gitroom/react/form/input';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';

const SettingsComponent = () => {
  const form = useSettings();

  return (
    <>
      <Input label="Subject" {...form.register('subject')} />
      <Input label="Preview text" {...form.register('preview')} />
    </>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: SettingsComponent,
  CustomPreviewComponent: undefined,
  dto: KitDto,
  maximumCharacters: 100000,
  inlineImages: true,
});
