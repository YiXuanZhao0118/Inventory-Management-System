// pages/LoginPage.tsx
import React, { useState } from 'react';
import { useLanguage } from '@/components/LanguageSwitcher';
import zhTW from '@/app/data/language/zh-TW.json';
import enUS from '@/app/data/language/en-US.json';
import hiIN from '@/app/data/language/hi.json';
import deDE from '@/app/data/language/de.json';

interface LoginPageProps {
  onLogin: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const { language } = useLanguage();
  const tMap: Record<string, any> = { 'zh-TW': zhTW, 'en-US': enUS, 'hi-IN': hiIN, de: deDE };
  const t = (tMap[language] || zhTW).Login;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        onLogin();
      } else {
        const data = await res.json();
        setErrorMsg(data.error || t.Wrong);
      }
    } catch (err: any) {
      setErrorMsg(t.ServerError);
    }
  };

  return (
    <div className="max-w-full mx-auto bg-white dark:bg-gray-900 p-8 rounded-lg shadow space-y-6">
      <div className="w-full max-w-md mx-auto mt-16 p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">{t.title}</h2>
        {errorMsg && <p className="mb-4 text-center text-red-600">{errorMsg}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block mb-1 text-gray-700 dark:text-gray-300">
              {t.username}
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="block mb-1 text-gray-700 dark:text-gray-300">
              {t.password}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {t.login}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
