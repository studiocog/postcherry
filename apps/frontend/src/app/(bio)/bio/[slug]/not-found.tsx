import { getT } from '@gitroom/react/translation/get.translation.service.backend';

// an address nobody uses, or a page that is not published
export default async function BioPageNotFound() {
  const t = await getT();
  const websiteUrl = process.env.WEBSITE_URL || 'https://postcherry.com';

  return (
    <main className="min-h-screen bg-[#f0f2f4] text-[#0e0e0e] flex flex-col gap-[16px] justify-center items-center text-center px-[16px]">
      <h1 className="text-[20px] font-[600]">
        {t('bio_page_not_found', 'This page does not exist')}
      </h1>
      <a href={websiteUrl} className="text-[14px] underline hover:font-bold">
        {t('bio_page_create_yours', 'Create your own page with PostCherry')}
      </a>
    </main>
  );
}
