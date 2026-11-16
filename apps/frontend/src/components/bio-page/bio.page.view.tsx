import { FC } from 'react';
import clsx from 'clsx';
import {
  BioPageTheme,
  PublicBioPage,
} from '@gitroom/nestjs-libraries/dtos/bio-page/bio-page.dto';

// The presets of the page, in the PostCherry colors (see colors.scss). Every
// text is readable on its background (WCAG AA). The focus is a ring, global.scss
// removes every outline
export const bioPageThemeStyles: Record<
  BioPageTheme,
  {
    page: string;
    muted: string;
    link: string;
    avatar: string;
    channel: string;
  }
> = {
  light: {
    page: 'bg-[#f0f2f4] text-[#0e0e0e]',
    muted: 'text-[#5f6367]',
    link: 'bg-white text-[#0e0e0e] border-[#e7e9eb] hover:border-[#D21F3C] focus-visible:ring-[#D21F3C] focus-visible:ring-offset-[#f0f2f4]',
    avatar: 'bg-[#D21F3C] text-white',
    channel:
      'bg-white border-[#e7e9eb] hover:border-[#D21F3C] focus-visible:ring-[#D21F3C] focus-visible:ring-offset-[#f0f2f4]',
  },
  dark: {
    page: 'bg-[#0e0e0e] text-white',
    muted: 'text-[#a8a8a8]',
    link: 'bg-[#1a1919] text-white border-[#2b2b2b] hover:border-[#D21F3C] focus-visible:ring-white focus-visible:ring-offset-[#0e0e0e]',
    avatar: 'bg-[#D21F3C] text-white',
    channel:
      'bg-[#1a1919] border-[#2b2b2b] hover:border-[#D21F3C] focus-visible:ring-white focus-visible:ring-offset-[#0e0e0e]',
  },
  cherry: {
    page: 'bg-[#D21F3C] text-white',
    muted: 'text-[#ffe8ec]',
    link: 'bg-white text-[#b5172f] border-white hover:bg-[#ffe8ec] focus-visible:ring-white focus-visible:ring-offset-[#D21F3C]',
    avatar: 'bg-white text-[#b5172f]',
    channel:
      'bg-white border-white hover:bg-[#ffe8ec] focus-visible:ring-white focus-visible:ring-offset-[#D21F3C]',
  },
  blush: {
    page: 'bg-[#ffe8ec] text-[#2a0e14]',
    muted: 'text-[#8a1a2c]',
    link: 'bg-[#D21F3C] text-white border-[#D21F3C] hover:bg-[#b5172f] focus-visible:ring-[#2a0e14] focus-visible:ring-offset-[#ffe8ec]',
    avatar: 'bg-[#D21F3C] text-white',
    channel:
      'bg-white border-[#ffd0d8] hover:border-[#D21F3C] focus-visible:ring-[#2a0e14] focus-visible:ring-offset-[#ffe8ec]',
  },
};

// the page only links to web addresses, whatever is stored
const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

const initials = (value: string) =>
  value
    .split(/\s+/)
    .filter((word) => !!word)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');

// The public link in bio page. It has no hooks, so the public route renders it
// on the server and the settings show the same component as a live preview
export const BioPageView: FC<{
  page: Omit<PublicBioPage, 'slug'>;
  labels: { madeWith: string; noLinks: string };
  // the marketing website, server pages pass WEBSITE_URL
  websiteUrl: string;
  // the settings preview opens links in a new tab instead of leaving the editor
  preview?: boolean;
  className?: string;
}> = ({ page, labels, websiteUrl, preview, className }) => {
  const theme = bioPageThemeStyles[page.theme] || bioPageThemeStyles.light;
  const linkTarget = preview
    ? { target: '_blank', rel: 'noopener noreferrer' }
    : { rel: 'noopener ugc' };

  return (
    <div
      className={clsx(
        'w-full flex flex-col items-center px-[16px] py-[40px]',
        theme.page,
        className
      )}
    >
      <main className="w-full max-w-[560px] flex flex-col items-center gap-[16px] flex-1">
        {page.avatar ? (
          <img
            src={page.avatar}
            alt={page.title || ''}
            width={96}
            height={96}
            className="w-[96px] h-[96px] rounded-full object-cover"
          />
        ) : (
          !!page.title && (
            <div
              aria-hidden="true"
              className={clsx(
                'w-[96px] h-[96px] rounded-full flex items-center justify-center text-[32px] font-[600]',
                theme.avatar
              )}
            >
              {initials(page.title)}
            </div>
          )
        )}
        {!!page.title && (
          <h1 className="text-[22px] font-[600] text-center break-words max-w-full">
            {page.title}
          </h1>
        )}
        {!!page.description && (
          <p
            className={clsx(
              'text-[15px] text-center whitespace-pre-line break-words max-w-full -mt-[8px]',
              theme.muted
            )}
          >
            {page.description}
          </p>
        )}
        {!!page.channels.length && (
          <ul className="flex flex-wrap justify-center gap-[10px]">
            {page.channels.map((channel, index) => (
              <li key={index}>
                <a
                  href={isWebUrl(channel.url) ? channel.url : undefined}
                  {...linkTarget}
                  aria-label={channel.name}
                  title={channel.name}
                  className={clsx(
                    'w-[44px] h-[44px] rounded-full border flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-offset-2',
                    theme.channel
                  )}
                >
                  <img
                    src={`/icons/platforms/${channel.identifier}.png`}
                    alt=""
                    width={24}
                    height={24}
                    className="w-[24px] h-[24px] rounded-[4px]"
                  />
                </a>
              </li>
            ))}
          </ul>
        )}
        {page.links.length ? (
          <ul className="w-full flex flex-col gap-[12px] mt-[8px]">
            {page.links.map((link, index) => (
              <li key={index}>
                <a
                  href={isWebUrl(link.url) ? link.url : undefined}
                  {...linkTarget}
                  className={clsx(
                    'w-full min-h-[56px] px-[20px] py-[14px] rounded-[14px] border-2 flex items-center justify-center text-center text-[16px] font-[600] break-words transition-colors focus-visible:ring-2 focus-visible:ring-offset-2',
                    theme.link
                  )}
                >
                  {link.title}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          preview && (
            <div className={clsx('text-[14px] text-center', theme.muted)}>
              {labels.noLinks}
            </div>
          )
        )}
      </main>
      <footer className="mt-[40px]">
        <a
          href={websiteUrl}
          {...(preview ? { target: '_blank' } : {})}
          rel="noopener"
          className={clsx(
            'text-[13px] underline-offset-4 hover:underline',
            theme.muted
          )}
        >
          {labels.madeWith}
        </a>
      </footer>
    </div>
  );
};
