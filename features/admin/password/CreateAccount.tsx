// pages/admin/password/CreateAccount.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/components/LanguageSwitcher';
import zhTW from '@/app/data/language/zh-TW.json';
import enUS from '@/app/data/language/en-US.json';
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

const MIN_LEN = 6;

const CreateAccount: React.FC = () => {
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, "de": deDE };
  const t = (tMap[language] || zhTW).Admin.Account.CreateAccount;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 1500);
    return () => clearTimeout(timer);
  }, [message]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (password.length < MIN_LEN) {
      setMessage((t.too_short ?? '密碼長度不足') + `（${MIN_LEN}+）`);
      return;
    }
    if (password !== confirmPassword) {
      setMessage(t.not_match ?? '兩次密碼輸入不一致');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/account/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage(t.success ?? '✅ 建立成功');
        setUsername('');
        setPassword('');
        setConfirmPassword('');
      } else {
        setMessage(`${t.fail ?? '建立失敗'}${data.error ? '：' + data.error : ''}`);
      }
    } catch (err: any) {
      setMessage(`${t.fail ?? '建立失敗'}：${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 space-y-4">
      <h2 className="text-xl font-semibold">{t.title ?? '新增帳號'}</h2>

      {message && (
        <div className="px-4 py-2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          {message}
        </div>
      )}

      <form onSubmit={handleCreate} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">{t.username ?? '帳號'}</label>
          <input
            type="text"
            className="w-full border p-2 rounded-md"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            required
            disabled={loading}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">{t.password ?? '密碼'}</label>
          <input
            type="password"
            className="w-full border p-2 rounded-md"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_LEN}
            required
            disabled={loading}
          />
          <p className="text-xs text-gray-500 mt-1">
            {(t.hint_min ?? '至少長度')}: {MIN_LEN}
          </p>
        </div>
        <div>
          <label className="block text-sm mb-1">{t.confirm_password ?? '確認密碼'}</label>
          <input
            type="password"
            className="w-full border p-2 rounded-md"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            disabled={loading}
          />
        </div>
        <button
          type="submit"
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-60"
          disabled={loading}
        >
          {loading ? (t.loading ?? '處理中…') : (t.create ?? '建立')}
        </button>
      </form>
    </div>
  );
};

export default CreateAccount;
