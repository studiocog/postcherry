import { Metadata } from 'next';
import { AdminLayoutComponent } from '@gitroom/frontend/components/admin/admin.layout.component';

// the admin area (hq) is never listed by search engines
export const metadata: Metadata = {
  title: { default: 'HQ', template: '%s | PostCherry HQ' },
  robots: { index: false, follow: false },
};

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminLayoutComponent>{children}</AdminLayoutComponent>;
}
