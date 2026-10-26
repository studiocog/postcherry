export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import Link from 'next/link';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';
export const metadata: Metadata = {
  title: 'Sign in required',
  description: '',
};
export default async function LoginRequiredPage() {
  const t = await getT();
  return (
    <div className="flex flex-1 flex-col gap-[16px]">
      <h1 className="text-3xl font-bold text-start">
        {t('please_sign_in_to_continue', 'Please sign in to continue')}
      </h1>
      <div className="text-[14px] opacity-70">
        {t(
          'login_required_description',
          'You need to be signed in to PostCherry to use this page.'
        )}
      </div>
      <Link
        href="/auth/login"
        className="w-full h-[52px] rounded-[10px] bg-[#D21F3C] hover:bg-[#A9172F] text-white transition-colors text-[16px] font-[600] flex items-center justify-center"
      >
        {t('sign_in_1', 'Sign in')}
      </Link>
    </div>
  );
}
