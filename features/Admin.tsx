// features/Admin.tsx
"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { FileDown, User, Timer, type LucideIcon } from "lucide-react";

import DataIOPage from "./data-io";
import ShortTermAdmin from "./short-term-admin";
import UserAccountManager from "./UserAccountManager";

import { useLanguage } from "@/src/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

type Section = "DataIOPage" | "ShortTermAdmin" | "UserAccountManager";

export default function Admin() {
  const { language } = useLanguage();

  // 語系對應（含常見簡寫容錯）
  const translations = useMemo(() => {
    const map: Record<string, any> = {
      "zh-TW": zhTW,
      "en-US": enUS,
      "hi-IN": hiIN,
      "de-DE": deDE,
      zh: zhTW,
      en: enUS,
      hi: hiIN,
      de: deDE,
    };
    return map[language] || zhTW;
  }, [language]);

  // Admin 主選單多語（含 fallback）
  const tAdminMain = {
    menu_data_io: translations?.Admin?.Main?.menu_data_io ?? "Data I/O",
    menu_all_loan_records:
      translations?.Admin?.Main?.menu_all_loan_records ?? "All Short-term Loans",
    menu_user_accounts:
      translations?.Admin?.Main?.menu_user_accounts ?? "User Accounts",
    sidebar_toggle: translations?.Admin?.Main?.sidebar_toggle ?? "Toggle sidebar",
  };

  const [activeSection, setActiveSection] = useState<Section>("DataIOPage");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // 側欄寬度拖曳
  useEffect(() => {
    if (!sidebarOpen) return;

    const onMouseMove = (e: MouseEvent) => {
      const w = e.clientX;
      if (w >= 64 && w <= 400) setSidebarWidth(w);
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    const resizer = sidebarRef.current?.querySelector(".resizer");
    resizer?.addEventListener("mousedown", onMouseDown as any);
    return () => resizer?.removeEventListener("mousedown", onMouseDown as any);
  }, [sidebarOpen]);

  // 側邊選單（用 Lucide icon）
  const menuItems = useMemo(
    () =>
      [
        {
          key: "DataIOPage" as const,
          label: tAdminMain.menu_data_io,
          Icon: FileDown, // ✅ FileDown
        },
        {
          key: "ShortTermAdmin" as const,
          label: tAdminMain.menu_all_loan_records,
          Icon: Timer, // ✅ Timer
        },
        {
          key: "UserAccountManager" as const,
          label: tAdminMain.menu_user_accounts,
          Icon: User, // ✅ User
        },
      ] satisfies { key: Section; label: string; Icon: LucideIcon }[],
    [tAdminMain.menu_data_io, tAdminMain.menu_all_loan_records, tAdminMain.menu_user_accounts]
  );

  return (
    <div>
      {/* 側邊欄 */}
      <div
        className="fixed top-14 left-0 bottom-0 z-50 flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transition-[width] duration-150"
        style={{ width: sidebarOpen ? sidebarWidth : 64 }}
        ref={sidebarRef}
      >
        {/* 漢堡鈕 */}
        <div className="p-2 flex top-0 left-full ml-2">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="flex flex-col justify-between w-6 h-5 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            aria-label={tAdminMain.sidebar_toggle}
            title={tAdminMain.sidebar_toggle}
          >
            <span className="block h-0.5 bg-current rounded" />
            <span className="block h-0.5 bg-current rounded" />
            <span className="block h-0.5 bg-current rounded" />
          </button>
        </div>

        {/* 拖曳條 */}
        {sidebarOpen && (
          <div className="resizer w-1 h-full cursor-col-resize absolute right-0 top-0" />
        )}

        {/* 選單 */}
        {sidebarOpen && (
          <nav className="flex-1 overflow-auto py-2">
            {menuItems.map(({ key, label, Icon }) => {
              const active = activeSection === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveSection(key)}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "w-full flex items-center px-4 py-3 gap-3 transition-colors",
                    "hover:bg-gray-100 dark:hover:bg-gray-700",
                    active
                      ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                      : "text-gray-800 dark:text-gray-200",
                  ].join(" ")}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="font-medium truncate">{label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {/* 主要內容 */}
      <div style={{ marginLeft: sidebarOpen ? sidebarWidth : 64 }}>
        <main className="p-6 overflow-auto px-4">
          {activeSection === "DataIOPage" && <DataIOPage />}
          {activeSection === "ShortTermAdmin" && <ShortTermAdmin />}
          {activeSection === "UserAccountManager" && <UserAccountManager />}
        </main>
      </div>
    </div>
  );
}
