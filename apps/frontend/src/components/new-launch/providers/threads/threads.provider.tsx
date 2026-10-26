'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';

// threads_manage_replies is not requested from Meta, so there are no thread
// replies (and no thread finisher, which is a reply): only the first value is
// published
export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: null,
  CustomPreviewComponent: undefined,
  dto: undefined,
  maximumCharacters: 500,
  comments: false,
});
