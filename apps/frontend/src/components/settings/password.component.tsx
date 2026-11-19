'use client';

import React, { FC, KeyboardEvent, useCallback, useState } from 'react';
import useSWR from 'swr';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';

const MIN_LENGTH = 8;

const usePasswordStatus = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/user/password')).json();
  }, []);
  return useSWR<{ hasPassword: boolean; provider: string | null }>(
    'user-password',
    load,
    { revalidateOnFocus: false }
  );
};

const PasswordField: FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  visible: boolean;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}> = ({ value, onChange, placeholder, autoComplete, visible, onKeyDown }) => (
  <input
    type={visible ? 'text' : 'password'}
    autoComplete={autoComplete}
    value={value}
    maxLength={64}
    onChange={(e) => onChange(e.target.value)}
    onKeyDown={onKeyDown}
    placeholder={placeholder}
    className="h-[44px] w-full bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] text-[14px] text-textColor outline-none focus:border-forth"
  />
);

const Check: FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  <span
    className={clsx(
      'flex items-center gap-[6px] text-[13px]',
      ok ? 'text-green-500' : 'text-textItemBlur'
    )}
  >
    <span className="w-[16px] text-center">{ok ? '✓' : '•'}</span>
    {label}
  </span>
);

// Settings > Password: set one (accounts made with Google or single sign-on,
// so they can also sign in with email and password) or change it.
// Not a <form>: the Settings page is one form already, a nested form would
// submit the profile instead of saving the password.
export const PasswordComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const user = useUser();
  const { data, mutate } = usePasswordStatus();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);

  const longEnough = password.length >= MIN_LENGTH;
  const matches = !!password && password === repeat;
  const ready =
    longEnough && matches && (!data?.hasPassword || !!current) && !saving;

  const save = useCallback(async () => {
    setError('');
    setSaved('');
    if (!longEnough) {
      setError(t('password_min', 'Use at least 8 characters.'));
      return;
    }
    if (!matches) {
      setError(t('password_mismatch', 'The two new passwords are different.'));
      return;
    }
    if (data?.hasPassword && !current) {
      setError(t('password_current_needed', 'Type your current password.'));
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/user/password', {
        method: 'POST',
        body: JSON.stringify({
          password,
          ...(data?.hasPassword ? { currentPassword: current } : {}),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(
          (Array.isArray(body?.message)
            ? body.message.join(', ')
            : body?.message) ||
            t('password_failed', 'Could not save the password. Please try again.')
        );
        return;
      }
      const message = data?.hasPassword
        ? t('password_changed_long', 'Password changed. Use the new one next time you sign in.')
        : t(
            'password_set_long',
            'Password saved. You can now sign in with {{email}} and this password, or keep using Google.',
            { email: user?.email || '' }
          );
      setSaved(message);
      toaster.show(
        data?.hasPassword
          ? t('password_changed', 'Password changed')
          : t('password_set', 'Password saved'),
        'success'
      );
      setCurrent('');
      setPassword('');
      setRepeat('');
      setVisible(false);
      mutate();
    } catch (err) {
      setError(
        t('password_network', 'Could not reach PostCherry. Check your connection and try again.')
      );
    } finally {
      setSaving(false);
    }
  }, [current, password, repeat, data?.hasPassword, longEnough, matches]);

  // Enter saves, and never submits the profile form around this box
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (ready) {
          save();
        }
      }
    },
    [ready, save]
  );

  if (!data) {
    return null;
  }

  return (
    <div className="my-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[16px]">
      <div className="flex flex-wrap items-start justify-between gap-[12px]">
        <div className="flex flex-col gap-[4px]">
          <div>{t('password', 'Password')}</div>
          <div className="text-[13px] text-textItemBlur max-w-[620px]">
            {data.hasPassword
              ? t(
                  'change_password_hint',
                  'To change it, type your current password, then the new one twice.'
                )
              : t(
                  'set_password_hint',
                  'You sign in with Google or single sign-on. Set a password to also sign in with your email and password. Google keeps working.'
                )}
          </div>
        </div>
        <span
          className={clsx(
            'inline-flex items-center h-[26px] px-[10px] rounded-full text-[12px] font-[600] whitespace-nowrap',
            data.hasPassword
              ? 'bg-green-600/15 text-green-500'
              : 'bg-gray-500/15 text-textItemBlur'
          )}
        >
          {data.hasPassword
            ? `✓ ${t('password_is_set', 'Password set')}`
            : t('no_password_yet', 'No password yet')}
        </span>
      </div>

      {!!saved && (
        <div
          role="status"
          className="flex items-start gap-[10px] rounded-[8px] border border-green-600/40 bg-green-600/10 px-[14px] py-[12px] text-[14px] text-green-500"
        >
          <span aria-hidden="true">✓</span>
          <span>{saved}</span>
        </div>
      )}

      <div className="flex flex-col gap-[10px] max-w-[420px]">
        {data.hasPassword && (
          <PasswordField
            value={current}
            onChange={setCurrent}
            onKeyDown={onKeyDown}
            visible={visible}
            autoComplete="current-password"
            placeholder={t('current_password', 'Current password')}
          />
        )}
        <PasswordField
          value={password}
          onChange={setPassword}
          onKeyDown={onKeyDown}
          visible={visible}
          autoComplete="new-password"
          placeholder={t('new_password', 'New password')}
        />
        <PasswordField
          value={repeat}
          onChange={setRepeat}
          onKeyDown={onKeyDown}
          visible={visible}
          autoComplete="new-password"
          placeholder={t('repeat_new_password', 'New password again')}
        />
        <div className="flex flex-wrap items-center justify-between gap-[8px]">
          <div className="flex flex-col gap-[2px]">
            <Check
              ok={longEnough}
              label={t('password_rule_length', 'At least 8 characters')}
            />
            <Check
              ok={matches}
              label={t('password_rule_match', 'Both new passwords match')}
            />
          </div>
          <button
            type="button"
            onClick={() => setVisible(!visible)}
            className="text-[13px] text-textItemBlur hover:text-newTextColor"
          >
            {visible
              ? t('hide_passwords', 'Hide passwords')
              : t('show_passwords', 'Show passwords')}
          </button>
        </div>
      </div>

      {!!error && (
        <div
          role="alert"
          className="rounded-[8px] border border-red-500/40 bg-red-500/10 px-[14px] py-[12px] text-[14px] text-red-400 max-w-[620px]"
        >
          {error}
        </div>
      )}

      <div>
        <Button type="button" onClick={save} loading={saving} disabled={!ready}>
          {data.hasPassword
            ? t('change_password', 'Change password')
            : t('set_password', 'Set a password')}
        </Button>
      </div>
    </div>
  );
};
