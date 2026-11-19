'use client';

import React, { FC, FormEvent, useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

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

const fieldClass =
  'h-[42px] w-full bg-newBgColorInner border border-newTableBorder rounded-[8px] px-[12px] text-[14px] text-textColor outline-none focus:border-forth';

// Settings > Password: set one (accounts made with Google or single sign-on,
// so they can also sign in with email and password) or change it
export const PasswordComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data, mutate } = usePasswordStatus();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError('');
      if (password.length < 8) {
        setError(t('password_min', 'Use at least 8 characters.'));
        return;
      }
      if (password !== repeat) {
        setError(t('password_mismatch', 'The two new passwords are different.'));
        return;
      }
      setSaving(true);
      const response = await fetch('/user/password', {
        method: 'POST',
        body: JSON.stringify({
          password,
          ...(data?.hasPassword ? { currentPassword: current } : {}),
        }),
      });
      setSaving(false);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(
          (Array.isArray(body?.message)
            ? body.message.join(', ')
            : body?.message) || t('password_failed', 'Could not save the password.')
        );
        return;
      }
      toaster.show(
        data?.hasPassword
          ? t('password_changed', 'Password changed')
          : t('password_set', 'Password set: you can now also sign in with your email and password'),
        'success'
      );
      setCurrent('');
      setPassword('');
      setRepeat('');
      mutate();
    },
    [current, password, repeat, data?.hasPassword]
  );

  if (!data) {
    return null;
  }

  return (
    <form
      onSubmit={save}
      className="my-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[16px]"
    >
      <div className="flex flex-col gap-[4px]">
        <div>
          {data.hasPassword
            ? t('change_password', 'Change password')
            : t('set_password', 'Set a password')}
        </div>
        <div className="text-[13px] text-textItemBlur">
          {data.hasPassword
            ? t(
                'change_password_hint',
                'Type your current password, then the new one twice.'
              )
            : t(
                'set_password_hint',
                'You sign in with Google or single sign-on. Set a password to also sign in with your email and password.'
              )}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[12px] max-w-[900px]">
        {data.hasPassword && (
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder={t('current_password', 'Current password')}
            className={fieldClass}
          />
        )}
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('new_password', 'New password (8+ characters)')}
          className={fieldClass}
        />
        <input
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          placeholder={t('repeat_new_password', 'New password again')}
          className={fieldClass}
        />
      </div>
      {!!error && <div className="text-[13px] text-red-400">{error}</div>}
      <div>
        <Button
          type="submit"
          loading={saving}
          disabled={!password || !repeat || (data.hasPassword && !current)}
        >
          {data.hasPassword
            ? t('change_password', 'Change password')
            : t('set_password', 'Set a password')}
        </Button>
      </div>
    </form>
  );
};
