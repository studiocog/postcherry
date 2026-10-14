import { Metadata } from 'next';
import { ApprovalPage } from '@gitroom/frontend/components/post-approvals/approval.page';

export const dynamic = 'force-dynamic';

// the token in the address is the credential: keep the page out of search
// engines and out of the Referer of the links inside the post
export const metadata: Metadata = {
  title: `PostCherry Approval`,
  description: '',
  robots: {
    index: false,
    follow: false,
  },
  referrer: 'no-referrer',
};

export default async function Page(props: {
  params: Promise<{
    token: string;
  }>;
}) {
  const { token } = await props.params;
  return <ApprovalPage token={token} />;
}
