export const dynamic = 'force-dynamic';
import { Forgot } from '@gitroom/frontend/components/auth/forgot';
import { Metadata } from 'next';
export const metadata: Metadata = {
  title: `PostCherry Forgot Password`,
  description: '',
};
export default async function Auth() {
  return <Forgot />;
}
