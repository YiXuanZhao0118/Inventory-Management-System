"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** 檢查字串是否為 UUID（v4/泛用皆可） */
function isUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export default function DeviceRegistrationPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/";

  const [deviceId, setDeviceId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // 初次載入：準備 localStorage 的 deviceId，然後問後端是否已存在；存在就直接導回 next。
  React.useEffect(() => {
    let id = null;
    try {
      id = localStorage.getItem("deviceId");
      if (!id || !isUUID(id)) {
        id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : // 簡易 fallback（較弱但夠用）
              "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
                const r = (Math.random() * 16) | 0;
                const v = c === "x" ? r : (r & 0x3) | 0x8;
                return v.toString(16);
              });
        localStorage.setItem("deviceId", id);
      }
    } catch {
      // localStorage 不可用的極端情況
    }

    setDeviceId(id);

    // 問後端是否已註冊；是的話直接離開頁面
    (async () => {
      try {
        if (!id) return setLoading(false);
        const res = await fetch(`/api/devices?id=${encodeURIComponent(id)}`);
        const j = await res.json().catch(() => ({}));
        if (res.ok && j?.exists) {
          router.replace(next);
          return;
        }
      } catch (e) {
        // 靜默失敗 → 留在註冊頁
      } finally {
        setLoading(false);
      }
    })();
  }, [router, next]);

  async function submit() {
    setErr(null);
    if (!deviceId) {
      setErr("無法取得本機 deviceId（請確認瀏覽器允許 localStorage）。");
      return;
    }
    if (!name.trim()) {
      setErr("請輸入裝置名稱。");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deviceId, name }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || res.statusText);
      // 註冊成功
      router.replace(next);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-8 max-w-md mx-auto">
      <h1 className="text-xl mb-4">User Registration</h1>

      <div className="mb-4">
        <label className="block mb-1">User ID:</label>
        <div className="font-mono text-sm break-all">{deviceId ?? ""}</div>
      </div>

      <div className="mb-4">
        <label className="block mb-1" htmlFor="user-name">
          User Name:
        </label>
        <input
          id="user-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border p-2 rounded"
          placeholder="Enter your name"
          disabled={submitting}
        />
      </div>

      {err && (
        <div className="text-red-600 mb-4 break-all" role="alert">
          {err}
        </div>
      )}

      <button
        onClick={submit}
        disabled={!name.trim() || submitting}
        className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
      >
        {submitting ? "Registering..." : "Complete Registration"}
      </button>
    </div>
  );
}
