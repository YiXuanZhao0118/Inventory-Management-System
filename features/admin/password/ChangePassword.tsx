// pages/admin/password/ChangePassword.tsx
'use client';
import React, { useState } from 'react';
import { useLanguage } from '@/components/LanguageSwitcher';
import zhTW from '@/app/data/language/zh-TW.json';
import enUS from '@/app/data/language/en-US.json';
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

const ChangePasswordPage: React.FC = () => {
  const { language } = useLanguage();
  const translationMap: Record<string, any> = {
    "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, "de": deDE,
  };
  const t = (translationMap[language] || zhTW).Admin.Account.ChangePassword;

  const [step, setStep] = useState<'verify' | 'reset'>('verify');
  const [username, setUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const MIN_LEN = 6;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, currentPassword, newPassword: '', confirmPassword: '' })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.verify) {
        setStep('reset');
      } else {
        setMsg(data.error || t.verify_failed || '驗證失敗');
      }
    } catch (err: any) {
      setMsg(err.message || t.verify_failed || '驗證失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (newPassword.length < MIN_LEN) {
      setMsg((t.too_short ?? '新密碼長度不足') + `（${MIN_LEN}+）`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg(t.not_match ?? '兩次密碼輸入不一致');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/account/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, currentPassword, newPassword, confirmPassword })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setMsg(t.change_success ?? '變更成功');
        // 清場回到第一步
        setStep('verify');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setMsg(data.error || (t.change_failed ?? '變更失敗'));
      }
    } catch (err: any) {
      setMsg(err.message || t.change_failed || '變更失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6 space-y-4">
      {msg && (
        <div className="px-4 py-2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          {msg}
        </div>
      )}

      {step === 'verify' ? (
        <form onSubmit={handleVerify} className="space-y-4">
          <h2 className="text-xl font-semibold">{t.title_verify ?? '身分驗證'}</h2>

          <div>
            <label className="block">{t.username ?? '帳號'}</label>
            <input
              className="w-full border p-2 rounded"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block">{t.current_password ?? '目前密碼'}</label>
            <input
              type="password"
              className="w-full border p-2 rounded"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-60"
            disabled={loading}
          >
            {loading ? (t.loading ?? '處理中…') : (t.verify ?? '驗證')}
          </button>
        </form>
      ) : (
        <form onSubmit={handleReset} className="space-y-4">
          <h2 className="text-xl font-semibold">{t.title_reset ?? '重設密碼'}</h2>

          <div>
            <label className="block">{t.new_password ?? '新密碼'}</label>
            <input
              type="password"
              className="w-full border p-2 rounded"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
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
            <label className="block">{t.confirm_new_password ?? '確認新密碼'}</label>
            <input
              type="password"
              className="w-full border p-2 rounded"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              disabled={loading}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-60"
              disabled={loading}
            >
              {loading ? (t.loading ?? '處理中…') : (t.change ?? '變更')}
            </button>
            <button
              type="button"
              className="px-4 py-2 bg-gray-200 dark:bg-gray-800 rounded"
              onClick={() => setStep('verify')}
              disabled={loading}
            >
              {t.back ?? '返回'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default ChangePasswordPage;
