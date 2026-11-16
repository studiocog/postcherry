export const dynamic = 'force-dynamic';
import '../global.scss';
import { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';

const jakartaSans = Plus_Jakarta_Sans({
  weight: ['600', '500'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.FRONTEND_URL || 'https://app.postcherry.com'
  ),
  icons: {
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// The public link in bio pages have their own root layout: they are opened by
// the visitors of a profile, so none of the app shell, analytics, pixels or
// client providers load here and the page stays small and fast.
export default function BioLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className={jakartaSans.className}>{children}</body>
    </html>
  );
}
