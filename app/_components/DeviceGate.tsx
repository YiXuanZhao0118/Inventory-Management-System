"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** 簡單 UUID 檢查 */
function isUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/** 哪些頁面不需要檢查（註冊頁本身、之後若有登入頁等也可加進來） */
const PUBLIC_PATHS = new Set<string>(["/device-registration"]);

export default function DeviceGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    // 註冊頁本身：不攔，直接顯示 children
    if (PUBLIC_PATHS.has(pathname || "")) {
      setReady(true);
      return;
    }

    // 1) 取得/建立 deviceId
    let id: string | null = null;
    try {
      id = localStorage.getItem("deviceId");
      if (!id || !isUUID(id)) {
        id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
                const r = (Math.random() * 16) | 0;
                const v = c === "x" ? r : (r & 0x3) | 0x8;
                return v.toString(16);
              });
        localStorage.setItem("deviceId", id);
      }
    } catch {
      // localStorage 不可用就直接要求註冊
      const next = encodeURIComponent(buildNext(pathname, sp));
      router.replace(`/device-registration?next=${next}`);
      return;
    }

    // 2) 後端驗證是否已註冊
    (async () => {
      try {
        const res = await fetch(`/api/devices?id=${encodeURIComponent(id!)}`, { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (res.ok && j?.exists) {
          setReady(true);
        } else {
          const next = encodeURIComponent(buildNext(pathname, sp));
          router.replace(`/device-registration?next=${next}`);
        }
      } catch {
        // 發生錯誤時保守做法：要求註冊
        const next = encodeURIComponent(buildNext(pathname, sp));
        router.replace(`/device-registration?next=${next}`);
      }
    })();
  }, [pathname, router, sp]);

  if (!ready) {
    // 檢查中：給個簡單的 loading 狀態，避免內容閃現
    return (
      <div className="container-xl py-10">
        <div className="max-w-lg mx-auto space-y-3">
          <div className="skeleton h-10" />
          <div className="skeleton h-10" />
          <div className="skeleton h-10" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function buildNext(pathname: string | null, sp: ReturnType<typeof useSearchParams>) {
  const base = pathname || "/";
  const qs = sp?.toString();
  return qs ? `${base}?${qs}` : base;
}
