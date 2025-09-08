// app/layout.tsx
"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import "@/styles/globals.css";
import NavLink from "@/components/NavLink";
import LoginPage from "@/features/LoginPage";
import Head from "@/app/head";
import Link from "next/link";

import { LanguageProvider, useLanguage } from "@/components/LanguageSwitcher";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";
import { getOrCreateDeviceId } from "@/lib/device";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant" className="scroll-smooth">
      <Head />
      <body className="bg-gray-100 dark:bg-zinc-900 text-gray-800 dark:text-gray-100 min-h-screen">
        <LanguageProvider>
          <AppContent>{children}</AppContent>
        </LanguageProvider>
      </body>
    </html>
  );
}

function AppContent({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  // 動態語言對應
  const translationMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    "de-DE": deDE,       // make sure your key matches the locale your app sets
  };
  const translations = translationMap[language] || zhTW;
  const t = translations.layout;

  // coerce pathname to a string
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 自動登出與倒數計時參數
  const TIMEOUT_MS = 60 * 1000; // 60 秒
  const [remaining, setRemaining] = useState(TIMEOUT_MS);
  const lastActiveRef = useRef<number>(Date.now());
  const intervalRef = useRef<number | null>(null);

  // 判斷路由是否需要驗證
  const publicPaths = [
    "/",
    "/short_term_rented",
    "/add_inventory",
    "/products_overview",
    "/long_term_rented",
    "/generate_QRcode",
    "/device-registration",
    "/stocks",
    "/admin"
  ];
  const needsAuth = !publicPaths.includes(pathname);

  // 重置閒置計時器
  const resetTimer = useCallback(() => {
    lastActiveRef.current = Date.now();
    setRemaining(TIMEOUT_MS);
  }, []);

  // 啟用閒置檢測與倒數更新
  useEffect(() => {
    if (!isLoggedIn || !needsAuth) return;

    intervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - lastActiveRef.current;
      const rem = Math.max(TIMEOUT_MS - elapsed, 0);
      setRemaining(rem);
      if (rem === 0 && intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        setIsLoggedIn(false);
        alert(t.AutoLogout);
      }
    }, 1000);

    resetTimer();
    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keydown", resetTimer);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
    };
  }, [isLoggedIn, needsAuth, resetTimer, t.AutoLogout]);

  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  // 換算剩餘秒數
  const secondsLeft = Math.ceil(remaining / 1000);

  // 檢查裝置註冊狀態
  useEffect(() => {
    const checkDevice = async () => {
      const deviceId = getOrCreateDeviceId();
      try {
        const res = await fetch(`/api/device?deviceId=${deviceId}`);
        const data = await res.json();
        if (!data.isRegistered && pathname !== "/device-registration") {
          router.push("/device-registration");
        } else if (data.isRegistered && pathname === "/device-registration") {
          router.push("/");
        }
      } catch (err) {
        console.error("Error checking device registration:", err);
      }
    };
    checkDevice();
  }, [pathname, router]);

  return (
    <>
      {/* Topbar */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-800/80 backdrop-blur shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center h-14">
          <div className="flex items-center">
            <Link
              href="/"
              className="flex items-center space-x-3 rtl:space-x-reverse"
            >
              <span className="hidden sm:inline">🔭 Lab330 Optical Inventory</span>
              <span className="sm:hidden">🔭 OI</span>
            </Link>
            <span className="ml-4 text-sm">
              <LanguageSwitcher />
            </span>
          </div>
          <nav className="flex-1 flex justify-end gap-1 text-sm font-medium">
            <NavLink href="/short_term_rented">{t.short_term_loan}</NavLink>
            <NavLink href="/stocks">{t.stocks}</NavLink>
            <NavLink href="/add_inventory">{t.add_inventory}</NavLink>
            <NavLink href="/long_term_rented">{t.loan_and_return}</NavLink>
            <NavLink href="/products_overview">{t.products_overview}</NavLink>
            <NavLink href="/generate_QRcode">QRcode</NavLink>
            <NavLink href="/admin">{t.admin}</NavLink>
          </nav>
          {isLoggedIn && needsAuth && (
            <div className="flex items-center space-x-8 ml-8">
              {/* 倒數顯示 */}
              <span>
                {t.AutoLogout} {secondsLeft} {t.timebase}
              </span>
              <button
                className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow"
                onClick={() => setIsLoggedIn(false)}
              >
                {t.Logout}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {needsAuth ? (
          isLoggedIn ? (
            children
          ) : (
            <LoginPage onLogin={handleLogin} />
          )
        ) : (
          children
        )}
      </main>
    </>
  );
}
