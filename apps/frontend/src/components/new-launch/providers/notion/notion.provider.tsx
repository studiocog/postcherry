'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { NotionDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/notion.dto';
import { Input } from '@gitroom/react/form/input';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { ProviderFunctionSelect } from '@gitroom/frontend/components/new-launch/providers/provider.function.select';

const SettingsComponent = () => {
  const form = useSettings();

  return (
    <>
      <Input label="Title" {...form.register('title')} />
      <ProviderFunctionSelect
        label="Select Database"
        func="databases"
        {...form.register('database')}
      />
    </>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: SettingsComponent,
  CustomPreviewComponent: undefined,
  dto: NotionDto,
  maximumCharacters: 100000,
});
