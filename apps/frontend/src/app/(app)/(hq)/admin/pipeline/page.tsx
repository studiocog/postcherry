export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { AdminPipelineComponent } from '@gitroom/frontend/components/admin/admin.pipeline.component';

export const metadata: Metadata = {
  title: 'Pipeline',
};

export default async function Page() {
  return <AdminPipelineComponent />;
}
