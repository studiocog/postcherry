'use client';

import React, {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import useSWR from 'swr';
import { usePathname } from 'next/navigation';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { ContextWrapper } from '@gitroom/frontend/components/layout/user.context';
import { Toaster } from '@gitroom/react/toaster/toaster';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import {
  AdminSessionContext,
  useAdminSession,
} from '@gitroom/frontend/components/admin/admin.hooks';
import { AdminSessionGate } from '@gitroom/frontend/components/admin/admin.session.component';

const jakartaSans = Plus_Jakarta_Sans({
  weight: ['500', '600', '700'],
  subsets: ['latin'],
});

// 30 minutes without a click, a key or a scroll: check the session again
const IDLE_MS = 30 * 60 * 1000;
// the overview refreshes only while hq was used in the last 5 minutes
const ACTIVE_MS = 5 * 60 * 1000;

const menu = [
  { href: '/admin', label: 'Overview', exact: true },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/activity', label: 'Activity log' },
  { href: '/admin/stats', label: 'Posting stats' },
  { href: '/admin/errors', label: 'Errors' },
];

const NotFound = () => (
  <div className="min-h-screen flex items-center justify-center text-newTextColor bg-newBgColor">
    This page could not be found.
  </div>
);

export const AdminLayoutComponent: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const fetch = useFetch();
  const pathname = usePathname();
  const { frontEndUrl } = useVariables();

  const loadUser = useCallback(async (path: string) => {
    return (await fetch(path)).json();
  }, []);
  const { data: user } = useSWR('/user/self', loadUser, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  });
  const { data: session, mutate: mutateSession, error } = useAdminSession();

  const expired = useCallback(() => {
    mutateSession();
  }, []);

  const lock = useCallback(async () => {
    await fetch('/admin/session/logout', { method: 'POST' });
    mutateSession();
  }, []);

  const stopViewing = useCallback(async () => {
    await fetch('/user/impersonate', {
      method: 'POST',
      body: JSON.stringify({ id: '' }),
    });
    window.location.reload();
  }, []);

  // The server ends the HQ session after 30 minutes without admin requests.
  // An idle hq tab stops refreshing (so it doesn't keep the session alive)
  // and checks the session again after 30 minutes. Using the app as a
  // customer in another tab keeps the session going, so that is not cut off.
  const lastUse = useRef(Date.now());
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!session?.verified) {
      return;
    }
    // the code was just entered: that counts as using hq
    lastUse.current = Date.now();
    setActive(true);
    const used = () => {
      lastUse.current = Date.now();
      setActive(true);
    };
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((name) =>
      window.addEventListener(name, used, { passive: true })
    );
    const timer = setInterval(() => {
      const idle = Date.now() - lastUse.current;
      setActive(idle < ACTIVE_MS);
      if (idle > IDLE_MS) {
        mutateSession();
      }
    }, 30000);
    return () => {
      events.forEach((name) => window.removeEventListener(name, used));
      clearInterval(timer);
    };
  }, [session?.verified]);

  const sessionContext = useMemo(
    () => ({ expired, active }),
    [expired, active]
  );

  if (!user) {
    return null;
  }
  if (!user.admin || error) {
    return <NotFound />;
  }

  return (
    <ContextWrapper user={user}>
      <MantineWrapper>
        <Toaster />
        <AdminSessionContext.Provider value={sessionContext}>
          <div
            className={clsx(
              'min-h-screen flex flex-col text-newTextColor bg-newBgColor',
              jakartaSans.className
            )}
          >
            {user.impersonate && (
              <div className="flex flex-wrap items-center justify-center gap-[12px] px-[16px] py-[8px] bg-yellow-500 text-black text-[14px]">
                <span>
                  You are viewing the app as <b>{user.email}</b>.
                </span>
                <button
                  type="button"
                  onClick={stopViewing}
                  className="underline font-[600]"
                >
                  Stop
                </button>
              </div>
            )}
            <header className="flex flex-wrap items-center gap-x-[20px] gap-y-[8px] px-[20px] py-[12px] bg-[#2A0E14] text-white">
              <Link href="/admin" className="flex items-center gap-[8px]">
                <LogoTextComponent />
                <span className="text-[12px] font-[700] px-[8px] py-[2px] rounded-[6px] bg-white/15 tracking-[1px]">
                  HQ
                </span>
              </Link>
              {session?.verified && (
                <nav className="flex flex-wrap gap-[4px] flex-1">
                  {menu.map((item) => {
                    const active = item.exact
                      ? pathname === item.href
                      : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={clsx(
                          'px-[12px] h-[36px] flex items-center rounded-[8px] text-[14px] font-[600] transition-colors',
                          active
                            ? 'bg-white text-[#B5172F]'
                            : 'text-white/80 hover:bg-white/10'
                        )}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
              )}
              <div className="flex items-center gap-[12px] ms-auto text-[13px]">
                <a
                  href={frontEndUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-white/80 hover:text-white"
                >
                  Open app
                </a>
                {session?.verified && (
                  <button
                    type="button"
                    onClick={lock}
                    className="h-[32px] px-[12px] rounded-[8px] bg-white/10 hover:bg-white/20"
                  >
                    Lock
                  </button>
                )}
              </div>
            </header>
            {!session ? null : session.verified ? (
              <main className="flex-1 flex flex-col p-[20px] mobile:p-[12px] gap-[16px] w-full max-w-[1400px] mx-auto">
                {children}
              </main>
            ) : (
              <AdminSessionGate
                state={session}
                onVerified={() => mutateSession()}
              />
            )}
          </div>
        </AdminSessionContext.Provider>
      </MantineWrapper>
    </ContextWrapper>
  );
};
