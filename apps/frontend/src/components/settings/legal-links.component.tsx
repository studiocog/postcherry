'use client';

import React from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  dataDeletionUrl,
  privacyUrl,
  supportEmail,
  termsUrl,
} from '@gitroom/frontend/components/auth/terms.notice';

const LegalLinksComponent = () => {
  const t = useT();
  const links = [
    { href: termsUrl, label: t('terms_of_service', 'Terms of Service') },
    { href: privacyUrl, label: t('privacy_policy', 'Privacy Policy') },
    { href: dataDeletionUrl, label: t('data_deletion', 'Data deletion') },
  ];

  return (
    <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[16px]">
      <div className="mt-[4px]">{t('legal', 'Legal')}</div>
      <div className="flex flex-wrap gap-x-[24px] gap-y-[8px] text-[14px]">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:font-bold"
          >
            {link.label}
          </a>
        ))}
        <a href={`mailto:${supportEmail}`} className="underline hover:font-bold">
          {t('contact_support', 'Contact support')}
        </a>
      </div>
    </div>
  );
};

export default LegalLinksComponent;
