export const dynamic = 'force-dynamic';
import { Suspense } from 'react';
import { Metadata } from 'next';
import { AdminCustomersComponent } from '@gitroom/frontend/components/admin/admin.customers.component';

export const metadata: Metadata = {
  title: 'Customers',
};

export default async function Page() {
  return (
    <Suspense>
      <AdminCustomersComponent />
    </Suspense>
  );
}
