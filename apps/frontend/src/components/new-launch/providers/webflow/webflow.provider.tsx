'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { WebflowDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/webflow.dto';
import { Input } from '@gitroom/react/form/input';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { ProviderFunctionSelect } from '@gitroom/frontend/components/new-launch/providers/provider.function.select';

const SettingsComponent = () => {
  const form = useSettings();

  return (
    <>
      <Input label="Title" {...form.register('title')} />
      <ProviderFunctionSelect
        label="Select Collection"
        func="collections"
        {...form.register('collection')}
      />
    </>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: SettingsComponent,
  CustomPreviewComponent: undefined,
  dto: WebflowDto,
  maximumCharacters: 100000,
  inlineImages: true,
});
