'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { BrevoDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/brevo.dto';
import { Input } from '@gitroom/react/form/input';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { ProviderFunctionSelect } from '@gitroom/frontend/components/new-launch/providers/provider.function.select';

const SettingsComponent = () => {
  const form = useSettings();

  return (
    <>
      <Input label="Subject" {...form.register('subject')} />
      <ProviderFunctionSelect
        label="Select List"
        func="list"
        {...form.register('list')}
      />
      <ProviderFunctionSelect
        label="Select Sender"
        func="senders"
        {...form.register('sender')}
      />
    </>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: SettingsComponent,
  CustomPreviewComponent: undefined,
  dto: BrevoDto,
  maximumCharacters: 100000,
  inlineImages: true,
});
