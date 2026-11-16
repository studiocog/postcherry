'use client';

import React, { FC, FormEvent, useCallback, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { Button } from '@gitroom/react/form/button';
import {
  AdminSessionState,
  AdminSetupResponse,
} from '@gitroom/nestjs-libraries/dtos/admin/admin.dto';

// The second login step of hq: set up an authenticator app once, then a
// 6 digit code after every 30 minutes without using the admin area
export const AdminSessionGate: FC<{
  state: AdminSessionState;
  onVerified: () => void;
}> = ({ state, onVerified }) => {
  const fetch = useFetch();
  const [setup, setSetup] = useState<AdminSetupResponse | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const startSetup = useCallback(async () => {
    setLoading(true);
    setError('');
    const response = await fetch('/admin/session/setup', {
      method: 'POST',
      body: JSON.stringify({ setupCode }),
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(data?.message || 'Could not start the setup');
      return;
    }
    setSetup(data);
  }, [setupCode]);

  const verify = useCallback(
    async (value: string) => {
      setLoading(true);
      setError('');
      const response = await fetch('/admin/session/verify', {
        method: 'POST',
        body: JSON.stringify({ code: value }),
      });
      const data = await response.json().catch(() => ({}));
      setLoading(false);
      if (!response.ok) {
        setCode('');
        setError(
          Array.isArray(data?.message)
            ? data.message.join(', ')
            : data?.message || 'Wrong code'
        );
        return;
      }
      onVerified();
    },
    [onVerified]
  );

  const submit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (code.length === 6) {
        verify(code);
      }
    },
    [code, verify]
  );

  const needsSetup = !state.setup;
  const locked =
    state.lockedUntil && new Date(state.lockedUntil) > new Date()
      ? new Date(state.lockedUntil)
      : null;

  return (
    <div className="flex-1 flex items-center justify-center p-[20px]">
      <div className="w-full max-w-[420px] bg-newBgColorInner border border-newTableBorder rounded-[12px] p-[24px] flex flex-col gap-[16px]">
        <div className="flex flex-col gap-[4px]">
          <div className="text-[20px] font-[600]">
            {needsSetup ? 'Set up two-step login' : 'Enter your code'}
          </div>
          <div className="text-[14px] opacity-70">
            {needsSetup
              ? 'HQ needs a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password or Authy) on your phone.'
              : 'Open your authenticator app and type the 6 digits shown for PostCherry HQ.'}
          </div>
        </div>

        {locked && (
          <div className="text-[14px] text-red-400">
            Too many wrong codes. Try again after{' '}
            {locked.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
            .
          </div>
        )}

        {needsSetup && !setup && (
          <form
            className="flex flex-col gap-[12px]"
            onSubmit={(e) => {
              e.preventDefault();
              if (setupCode.trim()) {
                startSetup();
              }
            }}
          >
            <div className="text-[14px]">
              Type the setup code that <b>set-admin-hq.ps1</b> showed on your
              computer:
            </div>
            <input
              autoFocus
              value={setupCode}
              onChange={(e) => setSetupCode(e.target.value)}
              placeholder="XXXX-XXXX-XX"
              autoComplete="off"
              className="h-[44px] text-center tracking-[2px] text-[16px] uppercase bg-newBgColor border border-newTableBorder rounded-[8px] text-textColor outline-none focus:border-forth"
            />
            <Button type="submit" loading={loading} disabled={!setupCode.trim()}>
              Show the QR code
            </Button>
          </form>
        )}

        {needsSetup && setup && (
          <div className="flex flex-col items-center gap-[10px]">
            <div className="text-[14px] self-start">
              1. In the app, tap <b>+</b> and scan this code:
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={setup.qr}
              alt="QR code for the authenticator app"
              width={220}
              height={220}
              className="rounded-[8px] bg-white"
            />
            <div className="text-[12px] opacity-70 text-center">
              Can&apos;t scan? Enter this key in the app:
              <div className="font-mono text-[13px] opacity-100 break-all select-all mt-[4px]">
                {setup.secret.match(/.{1,4}/g)?.join(' ')}
              </div>
            </div>
            <div className="text-[14px] self-start">
              2. Type the 6 digits the app shows:
            </div>
          </div>
        )}

        {(!needsSetup || setup) && (
          <form onSubmit={submit} className="flex flex-col gap-[12px]">
            <input
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              disabled={!!locked}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(value);
                if (value.length === 6) {
                  verify(value);
                }
              }}
              placeholder="123456"
              className="h-[48px] text-center tracking-[8px] text-[22px] bg-newBgColor border border-newTableBorder rounded-[8px] text-textColor outline-none focus:border-forth"
            />
            <Button
              type="submit"
              loading={loading}
              disabled={code.length !== 6 || !!locked}
            >
              {needsSetup ? 'Turn on two-step login' : 'Continue'}
            </Button>
          </form>
        )}

        {!!error && <div className="text-[14px] text-red-400">{error}</div>}
      </div>
    </div>
  );
};
