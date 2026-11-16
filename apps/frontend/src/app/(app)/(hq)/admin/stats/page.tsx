export const dynamic = 'force-dynamic';
import { AdminStatsComponent } from '@gitroom/frontend/components/admin/admin-stats.component';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: `Admin Stats`,
  description: '',
};

export default async function Page() {
  return (
    <div className="flex-1 min-w-0 flex-col flex gap-[12px]">
      <AdminStatsComponent />
    </div>
  );
}
