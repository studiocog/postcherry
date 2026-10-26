'use client';

import { FC } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

// The marketing website, where the legal pages live. Server components read
// WEBSITE_URL instead; importing these from one would get a client reference.
export const websiteUrl = 'https://postcherry.com';
export const termsUrl = `${websiteUrl}/terms/`;
export const privacyUrl = `${websiteUrl}/privacy/`;
export const dataDeletionUrl = `${websiteUrl}/data-deletion/`;
export const supportEmail = 'hello@postcherry.com';

export const TermsLinks: FC = () => {
  const t = useT();
  return (
    <>
      <a
        href={termsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:font-bold"
      >
        {t('terms_of_service', 'Terms of Service')}
      </a>
      &nbsp;{t('and', 'and')}&nbsp;
      <a
        href={privacyUrl}
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
