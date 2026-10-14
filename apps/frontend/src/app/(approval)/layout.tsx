export const dynamic = 'force-dynamic';
import '../global.scss';
import 'react-tooltip/dist/react-tooltip.css';
import { ReactNode } from 'react';
import { Plus_Jakarta_Sans } from 'next/font/google';
import clsx from 'clsx';
import { cookies } from 'next/headers';
import { VariableContextComponent } from '@gitroom/react/helpers/variable.context';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Toaster } from '@gitroom/react/toaster/toaster';
import {
  cookieName,
  fallbackLng,
} from '@gitroom/react/translation/i18n.config';
import LayoutContext from '@gitroom/frontend/components/layout/layout.context';
import { HtmlComponent } from '@gitroom/frontend/components/layout/html.component';
import { ToolTip } from '@gitroom/frontend/components/layout/top.tip';

const jakartaSans = Plus_Jakarta_Sans({
  weight: ['600', '500'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
});

// The client approval page has its own root layout: the token in the address
// is the credential, so none of the analytics, pixels or error reporting of
// the app layout load here and read the address.
export default async function ApprovalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const language = cookieStore.get(cookieName)?.value || fallbackLng;
  return (
    <html>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body
        className={clsx(jakartaSans.className, 'dark text-primary !bg-primary')}
      >
        <VariableContextComponent
          language={language}
          storageProvider={
            process.env.STORAGE_PROVIDER! as 'local' | 'cloudflare'
          }
          stripeClient=""
          environment={process.env.NODE_ENV!}
          backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL!}
          plontoKey=""
          billingEnabled={false}
          discordUrl=""
          frontEndUrl={process.env.FRONTEND_URL!}
          isGeneral={!!process.env.IS_GENERAL}
          genericOauth={false}
          oauthLogoUrl=""
          oauthDisplayName=""
          uploadDirectory={process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY!}
          cloudflareUrl={process.env.CLOUDFLARE_BUCKET_URL || ''}
          mainUrl={process.env.MAIN_URL || ''}
          dub={false}
          facebookPixel=""
          telegramBotName=""
          neynarClientId=""
          appleClientId=""
          isSecured={!process.env.NOT_SECURED}
          isChatBase={false}
          disableImageCompression={!!process.env.DISABLE_IMAGE_COMPRESSION}
          disableXAnalytics={!!process.env.DISABLE_X_ANALYTICS}
          sentryDsn=""
          extensionId=""
          mediaProcessing={false}
          transloadit={[]}
        >
          <HtmlComponent />
          <LayoutContext>
            <MantineWrapper>
              <div className="bg-newBgColor min-h-screen text-newTextColor">
                <Toaster />
                <ToolTip />
                {children}
              </div>
            </MantineWrapper>
          </LayoutContext>
        </VariableContextComponent>
      </body>
    </html>
  );
}
