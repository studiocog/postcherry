export const dynamic = 'force-dynamic';
import { AdminErrorsComponent } from '@gitroom/frontend/components/admin/admin-errors.component';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: `Admin Errors`,
  description: '',
};

export default async function Page() {
  return (
    <div className="flex-1 min-w-0 flex-col flex gap-[12px]">
      <AdminErrorsComponent />
    </div>
  );
}
