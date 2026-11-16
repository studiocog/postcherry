import { parse } from 'tldts';

export function getCookieUrlFromDomain(domain: string) {
  const url = parse(domain);
  return url.domain! ? '.' + url.domain! : url.hostname!;
}

// Set by the frontend proxy on requests to the admin address (ADMIN_URL),
// read by pages that look different there (the login page)
export const ADMIN_HOST_HEADER = 'x-postcherry-admin-host';
