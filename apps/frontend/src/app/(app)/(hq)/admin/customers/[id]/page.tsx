export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { AdminCustomerComponent } from '@gitroom/frontend/components/admin/admin.customer.component';

export const metadata: Metadata = {
  title: 'Customer',
};

export default async function Page(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  return <AdminCustomerComponent id={id} />;
}
