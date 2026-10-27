// The app has several root layouts ((app), (approval), (extension), (provider)), so an
// unmatched URL can't use a plain not-found.tsx: this page replaces them all
// and brings its own <html>, styles and font (experimental.globalNotFound).
import './global.scss';
import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import clsx from 'clsx';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';

const jakartaSans = Plus_Jakarta_Sans({
  weight: ['600', '500'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Page not found | PostCherry',
  description: '',
};

export default async function GlobalNotFound() {
  const t = await getT();
  const websiteUrl = process.env.WEBSITE_URL || 'https://postcherry.com';

  return (
    <html>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body
        className={clsx(jakartaSans.className, 'dark text-primary !bg-primary')}
      >
        <div className="min-h-screen w-full flex justify-center items-center p-[20px] text-textColor">
          <div className="bg-newBgColorInner rounded-[12px] border border-newBorder w-full max-w-[480px] p-[32px] flex flex-col items-center gap-[20px] text-center">
            <a href={websiteUrl} aria-label="PostCherry home">
              <LogoTextComponent />
            </a>
            <div className="text-[48px] font-[600] leading-none">404</div>
            <div className="flex flex-col gap-[6px]">
              <div className="text-[20px] font-[600]">
                {t('page_not_found', 'Page not found')}
              </div>
              <div className="text-[14px] text-textItemBlur">
                {t(
                  'page_not_found_description',
                  'The page you are looking for does not exist or has been moved.'
                )}
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-[8px]">
              <a
                href="/launches"
                className="cursor-pointer px-[24px] h-[44px] bg-[#D21F3C] hover:bg-[#A9172F] text-white transition-colors rounded-[8px] text-[14px] font-[600] flex items-center"
              >
                {t('go_to_dashboard', 'Go to dashboard')}
              </a>
              <a
                href={websiteUrl}
                className="cursor-pointer px-[24px] h-[44px] bg-btnSimple hover:bg-boxHover transition-colors rounded-[8px] text-[14px] font-[600] flex items-center"
              >
                {t('go_to_website', 'Go to website')}
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
