// app/_components/system/MaintenanceOverlay.tsx
"use client";

import React from "react";

// i18n
import { useLanguage } from "@/src/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

// 後端回傳狀態
type State = {
  on: boolean;
  message: string;
  version: number;
  updatedAt: string;
};

export default function MaintenanceOverlay() {
  const { language } = useLanguage();
  const tmap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    "de-DE": deDE,
    de: deDE,
  };
  const t = (tmap[language] || zhTW)?.system?.maintenance ?? {};

  const [state, setState] = React.useState<State | null>(null);
  const prevRef = React.useRef<State | null>(null);
  const needReloadRef = React.useRef(false); // 維護期間若版本變動，結束時強制重整

  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let mounted = true;

    const tick = async () => {
      try {
        const r = await fetch("/api/sys/maintenance", { cache: "no-store" });
        if (!r.ok) throw new Error("status fetch failed");
        const json: State = await r.json();

        const prev = prevRef.current;

        // 維護中偵測版本變化：先記標記，等 on=false 再重整，避免維護中無限重整
        if (prev && json.on && prev.version !== json.version) {
          needReloadRef.current = true;
        }

        // 維護結束：若剛從 on=true -> on=false，或有 version 變更標記，就重整
        if (prev && prev.on && !json.on) {
          setState(json);
          prevRef.current = json;
          if (needReloadRef.current || prev.version !== json.version) {
            // 給一小段時間讓 overlay 渲染出「維護結束」
            setTimeout(() => {
              const url = new URL(window.location.href);
              url.searchParams.set("_t", Date.now().toString());
              window.location.replace(url.toString());
            }, 250);
            needReloadRef.current = false;
            return;
          }
        }

        if (!mounted) return;
        setState(json);
        prevRef.current = json;
      } catch {
        // 忽略暫時性錯誤（離線/網路波動）
      }
    };

    // 立即拉一次，之後每 2 秒輪詢
    tick();
    timer = setInterval(tick, 2000);

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  // 顯示期間鎖定滾動
  React.useEffect(() => {
    const lock = !!state?.on;
    const el = document.documentElement;
    if (lock) {
      const prevOverflow = el.style.overflow;
      el.style.overflow = "hidden";
      return () => {
        el.style.overflow = prevOverflow;
      };
    }
  }, [state?.on]);

  if (!state?.on) return null;

  const updatedText = (() => {
    try {
      return new Date(state.updatedAt).toLocaleString(language || undefined);
    } catch {
      return state.updatedAt || "";
    }
  })();

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="maintenance-title"
      aria-describedby="maintenance-desc"
    >
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl px-6 py-5 max-w-md w-[90%] text-center">
        {/* spinner：尊重使用者的降低動態偏好 */}
        <div
          className="mx-auto mb-3 h-8 w-8 rounded-full border-4 border-gray-300 border-t-transparent animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        <div
          id="maintenance-title"
          className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          aria-live="assertive"
        >
          {t.title || "Updating data…"}
        </div>
        <div
          id="maintenance-desc"
          className="text-sm text-gray-600 dark:text-gray-300 mt-1"
        >
          {/* 後端若有自訂訊息就顯示；否則顯示語系預設文字 */}
          {state.message ||
            t.desc_fallback ||
            "The system is importing data. Please wait."}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          {(t.version_label || "version") + " "}
          {state.version} · {(t.updated_label || "updated") + " "}
          {updatedText}
        </div>
      </div>
    </div>
  );
}
