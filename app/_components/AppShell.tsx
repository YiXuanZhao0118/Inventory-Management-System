"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useLanguage } from "@/src/components/LanguageSwitcher";
import LanguageSwitcher from "@/src/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";
import NavLink from "@/src/components/NavLink";

// Icons
import {
  Boxes,
  PackagePlus,
  Clock,
  Timer,
  QrCode,
  FileText,
  Tags,
  MapPin,
} from "lucide-react";

/** 公開路徑（前綴比對） */
const PUBLIC_PREFIXES = [
  "/", // 首頁
  "/inventory",
  "/inventory/add",
  "/long-term",
  "/long_term_rented",
  "/short-term",
  "/device-registration",
  "/short-term/qrcodes",
  "/products-overview",
  "/products",
  "/locations",
  "/FAQs",
  "/qrcode/print",
  "/account", // 登入頁必須是公開的
] as const;

function needsAuth(path: string) {
  return !PUBLIC_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`)
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const translationMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    "de-DE": deDE,
    zh: zhTW,
    en: enUS,
    hi: hiIN,
    de: deDE,
  };
  const translations = translationMap[language] || zhTW;
  const tLayout = translations.layout ?? {};

  const pathname = usePathname() ?? "";
  const router = useRouter();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me", {
        cache: "no-store",
        credentials: "include",
      });
      setIsLoggedIn(r.ok);
    } catch {
      setIsLoggedIn(false);
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  // 初次掛載查一次
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // 路由變更時再查（例如 /account -> /admin）
  useEffect(() => {
    // 避免首次掛載與上面重疊造成兩次 Loading 閃爍，不動 checkingAuth
    checkAuth();
  }, [pathname, checkAuth]);

  // 視窗回到焦點、或收到自訂事件時再查
  useEffect(() => {
    const onFocus = () => checkAuth();
    const onAuthChanged = () => checkAuth();
    window.addEventListener("focus", onFocus);
    window.addEventListener("lab330-auth-changed", onAuthChanged as EventListener);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("lab330-auth-changed", onAuthChanged as EventListener);
    };
  }, [checkAuth]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    setIsLoggedIn(false);
    if (needsAuth(pathname)) router.replace("/");
  };

  const requireAuth = needsAuth(pathname);

  const nav = [
    { href: "/inventory", label: tLayout.inventory_list ?? "Inventory", Icon: Boxes },
    { href: "/inventory/add", label: tLayout.add_inventory ?? "Add", Icon: PackagePlus },
    { href: "/long-term", label: tLayout.long_term_loan ?? "Long-term", Icon: Clock },
    { href: "/short-term", label: tLayout.short_term_loan ?? "Short-term", Icon: Timer },
    { href: "/short-term/qrcodes", label: tLayout.short_term_qrcodes ?? "QR Codes", Icon: QrCode },
    { href: "/products-overview", label: tLayout.products_overview ?? "Products Overview", Icon: FileText },
    { href: "/products", label: tLayout.products ?? "Products", Icon: Tags },
    { href: "/locations", label: tLayout.locations ?? "Locations", Icon: MapPin },
  ] as const;

  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-800/80 backdrop-blur shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center h-14">
          <div className="flex items-center gap-4">
            <Link href="/" className="font-semibold tracking-tight">
              <span className="hidden sm:inline">🔭 Lab330 Inventory</span>
              <span className="sm:hidden">🔭 Lab330</span>
            </Link>
            <LanguageSwitcher />
          </div>

          {/* Icon-only nav with hover tooltip */}
          <nav className="ml-auto flex items-center gap-1 text-sm font-medium">
            {nav.map(({ href, label, Icon }) => (
              <NavLink key={href} href={href}>
                <span
                  className="group relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700"
                  title={label}
                  aria-label={label}
                >
                  <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                  <span className="sr-only">{label}</span>
                  <span className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition z-10">
                    {label}
                  </span>
                </span>
              </NavLink>
            ))}
          </nav>

          {!checkingAuth && isLoggedIn && requireAuth && (
            <div className="ml-2">
              <button
                className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow text-sm"
                onClick={handleLogout}
              >
                {tLayout.logout ?? "Logout"}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main（不在這裡顯示 LoginPage；真正的保護交給 middleware + /admin/layout.tsx） */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">{children}</main>
    </>
  );
}
