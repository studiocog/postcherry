export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { ReportsComponent } from '@gitroom/frontend/components/reports/reports.component';
export const metadata: Metadata = {
  title: `Reports`,
  description: '',
};
export default async function Index() {
  return <ReportsComponent />;
}
