import { cache } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { internalFetch } from '@gitroom/helpers/utils/internal.fetch';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';
import { PublicBioPage } from '@gitroom/nestjs-libraries/dtos/bio-page/bio-page.dto';
import { BioPageView } from '@gitroom/frontend/components/bio-page/bio.page.view';

export const dynamic = 'force-dynamic';

// generateMetadata and the page read the same page once per request
const loadBioPage = cache(async (slug: string) => {
  const response = await internalFetch(
    `/public/bio/${encodeURIComponent(slug)}`
  );
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as PublicBioPage;
});

type Props = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params;
  const page = await loadBioPage(slug);
  if (!page) {
    return { title: 'Page not found | PostCherry' };
  }

  const name = page.title || page.slug;
  const title = /postcherry/i.test(name) ? name : `${name} | PostCherry`;
  const description = page.description || '';
  return {
    title,
    description,
    alternates: {
      canonical: `/bio/${page.slug}`,
    },
    openGraph: {
      type: 'profile',
      title,
      description,
      url: `/bio/${page.slug}`,
      ...(page.avatar ? { images: [{ url: page.avatar }] } : {}),
    },
    twitter: {
      card: 'summary',
      title,
      description,
      ...(page.avatar ? { images: [page.avatar] } : {}),
    },
  };
}

export default async function Page(props: Props) {
  const { slug } = await props.params;
  const page = await loadBioPage(slug);
  if (!page) {
    notFound();
  }

  const t = await getT();
  return (
    <BioPageView
      className="min-h-screen"
      page={page}
      websiteUrl={process.env.WEBSITE_URL || 'https://postcherry.com'}
      labels={{
        madeWith: t('bio_made_with', 'Made with PostCherry'),
        noLinks: '',
      }}
    />
  );
}
