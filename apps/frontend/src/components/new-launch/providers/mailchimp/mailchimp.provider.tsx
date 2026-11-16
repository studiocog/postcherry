'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { MailchimpDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/mailchimp.dto';
import { Input } from '@gitroom/react/form/input';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { ProviderFunctionSelect } from '@gitroom/frontend/components/new-launch/providers/provider.function.select';

const SettingsComponent = () => {
  const form = useSettings();

  return (
    <>
      <Input label="Subject" {...form.register('subject')} />
      <Input label="Preview text" {...form.register('preview')} />
      <ProviderFunctionSelect
        label="Select Audience"
        func="list"
        {...form.register('list')}
      />
    </>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: SettingsComponent,
  CustomPreviewComponent: undefined,
  dto: MailchimpDto,
  maximumCharacters: 100000,
  inlineImages: true,
});
