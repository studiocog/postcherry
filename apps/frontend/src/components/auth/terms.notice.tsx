'use client';

import { FC } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const TermsLinks: FC = () => {
  const t = useT();
  return (
    <>
      <a
        href="https://postcherry.com/terms"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:font-bold"
      >
        {t('terms_of_service', 'Terms of Service')}
      </a>
      &nbsp;{t('and', 'and')}&nbsp;
      <a
        href="https://postcherry.com/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:font-bold"
      >
        {t('privacy_policy', 'Privacy Policy')}
      </a>
    </>
  );
};

// Shown next to the social sign in buttons: they can create an account
// without going through the registration form and its checkbox
export const TermsNotice: FC = () => {
  const t = useT();
  return (
    <div className="text-[12px] mt-[12px]">
      {t('by_continuing_you_agree_to_the', 'By continuing you agree to the')}
      &nbsp;
      <TermsLinks />
    </div>
  );
};
