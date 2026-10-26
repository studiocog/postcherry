import { getT } from '@gitroom/react/translation/get.translation.service.backend';

export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Toaster } from '@gitroom/react/toaster/toaster';
import { AuthShowcase } from '@gitroom/frontend/components/auth/auth.showcase';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));
export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getT();
  const websiteUrl = process.env.WEBSITE_URL || 'https://postcherry.com';

  return (
    <MantineWrapper>
      <Toaster />
      <div className="bg-[#0E0E0E] flex flex-1 p-[12px] gap-[12px] min-h-screen w-screen text-white">
        {/*<style>{`html, body {overflow-x: hidden;}`}</style>*/}
        <ReturnUrlComponent />
        <div className="flex flex-col py-[40px] px-[20px] flex-1 lg:w-[600px] lg:flex-none rounded-[12px] text-white p-[12px] bg-[#1A1919]">
          <div className="w-full max-w-[440px] mx-auto justify-center gap-[20px] h-full flex flex-col text-white">
            <div className="flex items-center justify-between gap-[12px]">
              <a href={websiteUrl} aria-label="PostCherry home">
                <LogoTextComponent />
              </a>
              <a
                href={websiteUrl}
                className="text-[14px] opacity-70 hover:opacity-100 transition-opacity flex items-center gap-[6px]"
              >
                <span aria-hidden="true">←</span>
                {t('back_to_website', 'Back to website')}
              </a>
            </div>
            <div className="flex">{children}</div>
          </div>
        </div>
        <div className="hidden lg:flex flex-1">
          <AuthShowcase />
        </div>
      </div>
    </MantineWrapper>
  );
}
