export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { AdminActivityComponent } from '@gitroom/frontend/components/admin/admin.activity.component';

export const metadata: Metadata = {
  title: 'Activity log',
};

export default async function Page() {
  return <AdminActivityComponent />;
}
