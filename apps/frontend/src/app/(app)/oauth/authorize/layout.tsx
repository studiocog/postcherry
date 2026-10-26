import { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  // absolute: the name is already in it, skip the '%s | PostCherry' template
  title: { absolute: 'Authorize PostCherry access' },
};

export default async function OAuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="bg-[#0B0A0A] flex flex-1 min-h-screen w-screen">
      {children}
    </div>
  );
}
