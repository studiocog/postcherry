export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { AdminTasksComponent } from '@gitroom/frontend/components/admin/admin.tasks.component';

export const metadata: Metadata = {
  title: 'Tasks',
};

export default async function Page() {
  return <AdminTasksComponent />;
}
