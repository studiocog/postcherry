import { FC } from 'react';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';

// the logo at the top of the public preview pages, linking to the website.
// Server pages pass WEBSITE_URL, client pages the websiteUrl constant
export const PreviewLogo: FC<{ href: string }> = ({ href }) => {
  return (
    <a
      href={href}
      aria-label="PostCherry home"
      className="flex items-center text-textColor"
    >
      <LogoTextComponent />
    </a>
  );
};
