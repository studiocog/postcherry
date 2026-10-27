import { useMemo } from 'react';
import { useVariables } from '@gitroom/react/helpers/variable.context';

// Links to services outside of this instance (docs, browser extension, n8n
// node). Each one comes from a runtime env variable passed through the
// VariableContext, so an operator decides what exists, and nothing points to
// a service the instance does not control.

// Without DOCS_URL every Docs button opens the source code repository
const DEFAULT_DOCS_URL = 'https://github.com/studiocog/postcherry';

export interface ExternalLinks {
  // DOCS_URL + path, or the repository when DOCS_URL is not set
  docsLink: (path: string) => string;
  // '' = not configured
  extensionStoreUrl: string;
  // '' = not configured
  n8nNodeUrl: string;
}

interface ExternalLinksVariables {
  docsUrl?: string;
  extensionStoreUrl?: string;
  n8nNodeUrl?: string;
}

// Only http(s) links, so a typo can never become a javascript: href
const safeExternalUrl = (value?: string) => {
  const trimmed = (value || '').trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
};

const buildExternalLinks = (
  vars: ExternalLinksVariables
): ExternalLinks => {
  const docsUrl = safeExternalUrl(vars.docsUrl).replace(/\/+$/, '');

  return {
    docsLink: (path: string) =>
      docsUrl ? `${docsUrl}${path}` : DEFAULT_DOCS_URL,
    extensionStoreUrl: safeExternalUrl(vars.extensionStoreUrl),
    n8nNodeUrl: safeExternalUrl(vars.n8nNodeUrl),
  };
};

export const useExternalLinks = (): ExternalLinks => {
  const variables = useVariables();
  return useMemo(() => buildExternalLinks(variables), [variables]);
};
