import { internalFetch } from '@gitroom/helpers/utils/internal.fetch';
import { sanitizePostContent } from '@gitroom/helpers/utils/sanitize.post.content';
export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { CommentsComponents } from '@gitroom/frontend/components/preview/comments.components';
import { PreviewCommentsProvider } from '@gitroom/frontend/components/preview/preview.comments.context';
import { PostContentClient } from '@gitroom/frontend/components/preview/post.content.client';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { CopyClient } from '@gitroom/frontend/components/preview/copy.client';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';
import { RenderPreviewDateClient } from '@gitroom/frontend/components/preview/render.preview.date.client';
import { CreationMethodBadge } from '@gitroom/frontend/components/launches/creation.method.badge';
import { PreviewLogo } from '@gitroom/frontend/components/preview/preview.logo';
import { PreviewPostCard } from '@gitroom/frontend/components/preview/preview.post.card';

dayjs.extend(utc);
export const metadata: Metadata = {
  title: `PostCherry Preview`,
  description: '',
};
export default async function Auth(
  props: {
    params: Promise<{
      id: string;
    }>;
    searchParams?: Promise<{
      share?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    id
  } = params;

  const post = await (await internalFetch(`/public/posts/${id}`)).json();
  const t = await getT();
  if (!post.length) {
    return (
      <div className="text-newTextColor fixed start-0 top-0 w-full h-full flex justify-center items-center text-[20px]">
        {t('post_not_found', 'Post not found')}
      </div>
    );
  }
  return (
    <PreviewCommentsProvider
      previewId={id}
      postIds={post.map((p: any) => p.id)}
      organizationId={post[0].organizationId}
    >
      <div className="mx-auto w-full max-w-[1346px] p-[12px] flex flex-col gap-[8px] text-newTextColor">
        <div className="flex bg-newBgColorInner rounded-[12px] min-h-[80px] px-[20px] py-[12px] items-center gap-[20px] flex-wrap">
          <PreviewLogo />
          <div className="flex-1" />
          <div className="flex items-center gap-[20px] text-[14px] text-textItemBlur">
            <div>
              {t('publication_date', 'Publication Date:')}{' '}
              <span className="text-newTextColor">
                <RenderPreviewDateClient date={post[0].publishDate} />
              </span>
            </div>
            {!!searchParams?.share && (
              <>
                <div className="w-[1px] h-[20px] bg-blockSeparator" />
                <CopyClient />
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-[8px]">
          <div className="flex-1 flex flex-col gap-[8px]">
            {post.map((p: any, index: number) => (
              <PreviewPostCard
                key={String(p.id)}
                integration={post[0].integration}
                media={JSON.parse(p?.image || '[]')}
                badge={
                  index === 0 && (
                    <CreationMethodBadge
                      creationMethod={p.creationMethod}
                      size="md"
                    />
                  )
                }
              >
                <PostContentClient
                  postId={p.id}
                  html={sanitizePostContent(p.content)}
                />
              </PreviewPostCard>
            ))}
          </div>
          <div className="w-full lg:w-[380px] lg:flex-shrink-0">
            <div className="bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[20px] lg:sticky lg:top-[12px]">
              <CommentsComponents previewId={id} />
            </div>
          </div>
        </div>
      </div>
    </PreviewCommentsProvider>
  );
}
