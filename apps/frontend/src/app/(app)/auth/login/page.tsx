export const dynamic = 'force-dynamic';
import { Login } from '@gitroom/frontend/components/auth/login';
import { Metadata } from 'next';
import { headers } from 'next/headers';
import { ADMIN_HOST_HEADER } from '@gitroom/helpers/subdomain/subdomain.management';
export const metadata: Metadata = {
  title: `Login`,
  description: '',
};
export default async function Auth() {
  // on the admin address (hq) only email and password
  const adminHost = (await headers()).get(ADMIN_HOST_HEADER) === '1';
  return <Login adminHost={adminHost} />;
}
