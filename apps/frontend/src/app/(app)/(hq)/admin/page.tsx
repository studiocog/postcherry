export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { AdminOverviewComponent } from '@gitroom/frontend/components/admin/admin.overview.component';

export const metadata: Metadata = {
  title: 'Overview',
};

export default async function Page() {
  return <AdminOverviewComponent />;
}
