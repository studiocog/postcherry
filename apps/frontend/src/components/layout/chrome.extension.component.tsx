import { useExternalLinks } from '@gitroom/react/helpers/external.links';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
export const ChromeExtensionComponent = () => {
  const { extensionStoreUrl } = useExternalLinks();
  const t = useT();
  if (!extensionStoreUrl) {
    return null;
  }
  return (
    <a
      href={extensionStoreUrl}
      target="_blank"
      className="hover:text-newTextColor"
      aria-label={t('browser_extension', 'Browser extension')}
      data-tooltip-id="tooltip"
      data-tooltip-content={t('browser_extension', 'Browser extension')}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0.75 0.25 21.5 21.5"
        width="22"
        height="22"
      >
        <path
          d="M11.5 7C9.29086 7 7.5 8.79086 7.5 11C7.5 13.2091 9.29086 15 11.5 15C13.7091 15 15.5 13.2091 15.5 11C15.5 8.79086 13.7091 7 11.5 7ZM11.5 7H20.67M3.45 5.06L8.04 13M10.38 20.94L14.96 13M21.5 11C21.5 16.5228 17.0228 21 11.5 21C5.97715 21 1.5 16.5228 1.5 11C1.5 5.47715 5.97715 1 11.5 1C17.0228 1 21.5 5.47715 21.5 11Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
};
