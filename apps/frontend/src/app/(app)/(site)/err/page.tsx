import { Metadata } from 'next';
import Link from 'next/link';
import { getT } from '@gitroom/react/translation/get.translation.service.backend';
export const metadata: Metadata = {
  title: 'Error',
  description: '',
};
export default async function Page() {
  const t = await getT();
  return (
    <div className="flex flex-col gap-[12px]">
      <div>
        {t(
          'we_are_experiencing_some_difficulty_try_to_refresh_the_page',
          'We are experiencing some difficulty, try to refresh the page'
        )}
      </div>
      <Link href="/launches" className="underline hover:font-bold">
        {t('back_to_dashboard', 'Back to dashboard')}
      </Link>
    </div>
  );
}
