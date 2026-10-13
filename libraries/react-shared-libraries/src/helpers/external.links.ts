import { useMemo } from 'react';
import { useVariables } from '@gitroom/react/helpers/variable.context';

// Links to services outside of this instance (docs, browser extension,
// one-click AI connectors, CLI, n8n node). Each one comes from a runtime env
// variable passed through the VariableContext, so an operator decides what
// exists, and nothing points to a service the instance does not control.

export const DEFAULT_DOCS_URL = 'https://docs.postcherry.com';

export type McpConnectorClient = 'Claude' | 'ChatGPT' | 'Cursor' | 'Grok Bot';
export type McpConnectorUrls = Record<McpConnectorClient, string>;

export interface CliLinks {
  package: string;
  command: string;
  skill: string;
}

export interface ExternalLinks {
  // '' = docs hidden
  docsUrl: string;
  // '' when the docs are hidden
  docsLink: (path: string) => string;
  // '' = not configured
  extensionStoreUrl: string;
  // '' per client = not configured
  mcpConnectorUrls: McpConnectorUrls;
  hasMcpConnectors: boolean;
  // null = no CLI configured
  cli: CliLinks | null;
  n8nNodeUrl: string;
}

export interface ExternalLinksVariables {
  docsUrl?: string;
  extensionStoreUrl?: string;
  mcpConnectorClaudeUrl?: string;
  mcpConnectorChatgptUrl?: string;
  mcpConnectorCursorUrl?: string;
  mcpConnectorGrokUrl?: string;
  cliPackage?: string;
  cliCommand?: string;
  cliSkill?: string;
  n8nNodeUrl?: string;
}

// Only http(s) links, so a typo can never become a javascript: href
export const safeExternalUrl = (value?: string) => {
  const trimmed = (value || '').trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : '';
};

// npm package / binary / repo slug characters only, the values end up in
// commands people copy into their terminal
const safeCliToken = (value?: string) => {
  const trimmed = (value || '').trim();
  return /^[@a-z0-9._/-]+$/i.test(trimmed) ? trimmed : '';
};

export const buildExternalLinks = (
  vars: ExternalLinksVariables
): ExternalLinks => {
  // undefined: the layout did not pass it, use the default
  // '': explicitly turned off by the operator
  const docsUrl =
    vars.docsUrl === undefined
      ? DEFAULT_DOCS_URL
      : safeExternalUrl(vars.docsUrl).replace(/\/+$/, '');

  const mcpConnectorUrls: McpConnectorUrls = {
    Claude: safeExternalUrl(vars.mcpConnectorClaudeUrl),
    ChatGPT: safeExternalUrl(vars.mcpConnectorChatgptUrl),
    Cursor: safeExternalUrl(vars.mcpConnectorCursorUrl),
    'Grok Bot': safeExternalUrl(vars.mcpConnectorGrokUrl),
  };

  const cliPackage = safeCliToken(vars.cliPackage);
  const cli: CliLinks | null = cliPackage
    ? {
        package: cliPackage,
        command:
          safeCliToken(vars.cliCommand) ||
          cliPackage.split('/').pop() ||
          cliPackage,
        skill: safeCliToken(vars.cliSkill),
      }
    : null;

  return {
    docsUrl,
    docsLink: (path: string) => (docsUrl ? `${docsUrl}${path}` : ''),
    extensionStoreUrl: safeExternalUrl(vars.extensionStoreUrl),
    mcpConnectorUrls,
    hasMcpConnectors: Object.values(mcpConnectorUrls).some(Boolean),
    cli,
    n8nNodeUrl: safeExternalUrl(vars.n8nNodeUrl),
  };
};

export const useExternalLinks = (): ExternalLinks => {
  const variables = useVariables();
  return useMemo(() => buildExternalLinks(variables), [variables]);
};
