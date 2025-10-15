// features\LoginPage.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// i18n
import { useLanguage } from "@/src/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

export type LoginUser = { id: string; username: string };

// ---- helpers ----
function humanize(payload: any, fallback = "Operation failed. Please try again.") {
  try {
    if (Array.isArray(payload) && payload[0]?.message) return String(payload[0].message);
    if (payload && typeof payload === "object" && payload.message) return String(payload.message);
    if (typeof payload === "string" && payload.trim()) return payload;
  } catch {}
  return fallback;
}

async function readJson(r: Response, fallbackErr: string) {
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    let j: any = null;
    try {
      j = await r.json();
    } catch {
      throw new Error(fallbackErr);
    }
    if (!r.ok) throw new Error(humanize(j, fallbackErr));
    return j;
  }
  const txt = await r.text().catch(() => "");
  if (!r.ok) throw new Error(humanize(txt, fallbackErr));
  return {};
}

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/admin";

  // i18n dict
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    "de-DE": deDE,
    zh: zhTW,
    en: enUS,
    hi: hiIN,
    de: deDE,
  };
  const dict = tMap[language] || zhTW;
  const t = (dict?.Auth && dict.Auth.Login) || {};

  // state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  // 若已登入，直接導到 next（避免停在 /account）
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        if (mounted && r.ok) router.replace(next);
      } catch {}
    })();
    return () => { mounted = false; };
  }, [next, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const uname = username.trim();
    const pwd = password;
    if (!uname || !pwd) {
      setErr(t.error_required || "Please fill in both fields.");
      return;
    }

    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: uname, password: pwd }),
      });
      const j = await readJson(r, t.error_invalid || "Invalid credentials.");
      if (!j?.ok) {
        setErr(j?.message || (t.error_invalid || "Invalid credentials."));
        return;
      }

      // ✅ 通知外層「登入狀態變了」，AppShell 會收到事件後重查 /api/auth/me
      window.dispatchEvent(new Event("lab330-auth-changed"));

      // ✅ 導向 next
      router.replace(next);
    } catch (e: any) {
      setErr(e?.message || t.error_network || "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-6 shadow-lg space-y-4"
      >
        <h1 className="text-lg font-semibold">
          {t.title || "Sign in"}
        </h1>

        <label className="block space-y-1">
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {t.username_or_email || "Username / Email"}
          </span>
          <input
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 outline-none focus:ring focus:ring-blue-300"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={submitting}
            aria-label={t.username_or_email || "Username / Email"}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {t.password || "Password"}
          </span>
          <div className="relative">
            <input
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 outline-none focus:ring focus:ring-blue-300 pr-10"
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              aria-label={t.password || "Password"}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              aria-label={showPwd ? (t.hide || "Hide") : (t.show || "Show")}
              tabIndex={-1}
            >
              {showPwd ? (t.hide || "Hide") : (t.show || "Show")}
            </button>
          </div>
        </label>

        {err && (
          <div className="text-sm text-red-600 dark:text-red-400 bg-red-50/60 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            {err}
          </div>
        )}

        <button
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-2 disabled:opacity-60"
          disabled={submitting}
          type="submit"
        >
          {submitting ? (t.signing_in || "Signing in…") : (t.sign_in || "Sign in")}
        </button>
      </form>
    </div>
  );
}
