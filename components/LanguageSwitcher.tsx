"use client";

import React, { useState, createContext, useContext } from 'react';
import languageList from "@/app/data/language/Language.json";

const LanguageContext = createContext({
  language: 'zh-TW',
  setLanguage: (lang: string) => {},
});

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguage] = useState('zh-TW');

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);

const LanguageSwitcher = () => {
  const { language, setLanguage } = useLanguage();

  // 解析 json: [[code, label], ...]
  const languages: string[] = languageList.map(([code]) => code);
  const labels: Record<string, string> = Object.fromEntries(languageList);

  const nextLanguage = () => {
    const idx = languages.indexOf(language);
    setLanguage(languages[(idx + 1) % languages.length]);
  };

  return (
    <button className="language-switcher" onClick={nextLanguage}>
      {labels[language] || languages[0]}
    </button>
  );
};

export default LanguageSwitcher;
