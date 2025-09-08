// pages/ShortTermPage.tsx
"use client";

import React, { useState, useEffect } from "react";
import useSWR from "swr";
import QRScanner from "@/components/QRScanner";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";
import { getOrCreateDeviceId } from "@/lib/device";
import devices from "@/app/data/device.json";
import { fetcher } from "@/services/apiClient";
import { ShortTermRetrievalView } from "@/lib/types";

type BorrowableItem = {
  stockId: string;
  product: { id: string; name: string; model: string; brand: string };
  locationId: string;
  locationPath: string[];
};

export default function ShortTermPage() {
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, de: deDE };
  const t = (tMap[language] || zhTW).ShortTermLoan;

  const deviceId = getOrCreateDeviceId();

  // 可借清單（只列財產管理 + in_stock + 未報廢 + 未被租）
  const {
    data: availData,
    isLoading: availLoading,
    error: availError,
    mutate: mutateAvailable,
  } = useSWR<{ items: BorrowableItem[] }>("/api/rentals/short-term/available", fetcher);
  const availList = availData?.items ?? [];

  // 目前短租中的所有紀錄（未歸還）
  const {
    data: retrData,
    isLoading: retrLoading,
    error: retrError,
    mutate: mutateRetrievals,
  } = useSWR<{ items: ShortTermRetrievalView[] }>("/api/rentals/short-term/active", fetcher);
  const retrList = retrData?.items ?? [];

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanLock, setScanLock] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getDeviceName = (id: string) => {
    const rec = (devices as any[]).find((d) => d.deviceId === id);
    return rec ? rec.name : id;
  };

  const handleScan = async (scanned: string) => {
    if (!scannerOpen || scanLock) return;
    setScanLock(true);
    setScannerOpen(false);
    setTimeout(() => setScanLock(false), 1500);

    if (!deviceId) {
      alert(t.loadDeviceError);
      return;
    }

    // 容錯：允許 "stock:xxx" 或純 uuid
    const code = scanned.trim().replace(/^stock:/i, "");
    const found = availList.find((r) => r.stockId === code);
    if (!found) {
      alert(t.invalidStockId);
      return;
    }

    // 預設 6 小時
    const dueDate = new Date(Date.now() + 6 * 3600e3).toISOString();
    const renterId = "Lab330Admin"; // ★ 固定出借人

    try {
      const res = await fetch("/api/rentals/rental", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockId: found.stockId,
          renter: renterId,
          borrower: deviceId, // 後端 logs.borrower 存 deviceId
          loanType: "short_term",
          loanDate: new Date().toISOString(),
          dueDate,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      const finalDue = (Array.isArray(json) ? json[0] : json)?.dueDate || dueDate;

      const formatted = new Intl.DateTimeFormat(language, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: false,
      }).format(new Date(finalDue));

      alert(t.borrowSuccess.replace("{dueDate}", formatted));
      mutateAvailable();
      mutateRetrievals();
    } catch (e: any) {
      alert(t.borrowFailed.replace("{errorMessage}", e.message || ""));
    }
  };

  const handleReturn = async (rec: ShortTermRetrievalView) => {
    if (rec.borrowerId !== deviceId) {
      alert(t.notMyLoan);
      return;
    }
    try {
      const res = await fetch("/api/rentals/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rentedItemId: rec.id,
          returnDate: new Date().toISOString(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      alert(t.returnSuccess);
      mutateRetrievals();
      mutateAvailable();
    } catch (e: any) {
      alert(t.returnFailed.replace("{errorMessage}", e.message || ""));
    }
  };

  const handleExtend = async (rec: ShortTermRetrievalView) => {
    try {
      const res = await fetch("/api/rentals/short-term/extend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rentedItemId: rec.id,
          addHours: 3,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Unknown error");

      const formatted = new Intl.DateTimeFormat(language, {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      }).format(new Date(json.data.dueDate));

      alert(t.extendSuccess.replace("{dueDate}", formatted));
      mutateRetrievals();
    } catch (e: any) {
      alert(t.extendFailed.replace("{errorMessage}", e.message || ""));
    }
  };

  useEffect(() => {
    if (!scanError) return;
    // 任何語系缺 key 時，回退到 zh-TW；再不行就用英文預設
    const tpl = tt("scanFailed", "Scan failed: {errorMessage}");
    alert(fmt(tpl, { errorMessage: scanError }));
    setScanError(null);
  }, [scanError, t]);

  if (availLoading || retrLoading || !deviceId) {
    return <div className="p-8 text-center text-gray-600 dark:text-gray-400">{t.loading}</div>;
  }
  if (availError) {
    return <div className="p-8 text-red-600 dark:text-red-400">
      {t.loadAvailError.replace("{errorMessage}", (availError as Error).message)}
    </div>;
  }
  if (retrError) {
    return <div className="p-8 text-red-600 dark:text-red-400">
      {t.loadRetrError.replace("{errorMessage}", (retrError as Error).message)}
    </div>;
  }

  // safe i18n getter with zh-TW fallback (no strict key union)
  const tt = (key: string, fallback = ""): string => {
    const base = (zhTW as any).ShortTermLoan ?? {};
    const curr = (t as any) ?? {};
    const v = curr[key] ?? base[key] ?? fallback;
    return typeof v === "string" ? v : fallback;
  };

  // simple templating: replaces {var} with values
  const fmt = (tpl: string, vars: Record<string, string | number>) =>
    tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between">
        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white mb-4 md:mb-0">
          ⏱️ {t.title}
        </h1>
        <button
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow"
          onClick={() => setScannerOpen(true)}
        >
          {t.scanButton}
        </button>
      </div>

      {/* Scanner Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl w-full max-w-md md:max-w-lg">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">
              {t.scanModalTitle}
            </h3>
            <div className="h-64 rounded-lg bg-black overflow-hidden mb-4">
              <QRScanner
                onScan={handleScan}
                onError={(err) => {
                  setScanError(String(err?.message || err || ""));
                  setScannerOpen(false);
                }}
                active={scannerOpen}
              />
            </div>
            <button
              className="mt-2 inline-block text-red-500 hover:underline"
              onClick={() => { setScanError(null); setScannerOpen(false); }}
            >
              {t.closeScanner}
            </button>
          </div>
        </div>
      )}

      {/* Content Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* My Loans */}
        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">{t.myLoansTitle}</h2>
          <div className="space-y-4">
            {retrList
              .filter((r) => r.borrowerId === deviceId)
              .map((rec) => {
                const due = new Date(rec.dueDate);
                const diff = due.getTime() - currentTime.getTime();
                const isOverdue = diff < 0;
                const absDiff = Math.abs(diff);
                const hours = Math.floor(absDiff / 3_600_000);
                const minutes = Math.floor((absDiff % 3_600_000) / 60_000);
                const remaining = isOverdue ? `${t.overdue} ${hours}h ${minutes}m` : `${t.remaining} ${hours}h ${minutes}m`;

                return (
                  <div
                    key={rec.id}
                    className={`p-4 rounded-lg border-2 ${
                      diff < 0
                        ? "border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-900"
                        : "border-green-400 bg-green-50 dark:border-green-700 dark:bg-green-900"
                    }`}
                  >
                    <p>{t.productName}: {rec.product.name}</p>
                    <p>{t.model}: {rec.product.model}</p>
                    <p>{t.brand}: {rec.product.brand}</p>
                    <p>{t.location}: {rec.locationPath.join(" → ")}</p>
                    <p>{t.dueDate}: {due.toLocaleString()}</p>
                    <p>{t.status}: {remaining}</p>
                    <div className="mt-3 flex space-x-2">
                      <button
                        className="px-4 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md"
                        onClick={() => handleReturn(rec)}
                      >
                        {t.returnButton}
                      </button>
                      <button
                        className="px-4 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md"
                        onClick={() => handleExtend(rec)}
                      >
                        {t.extendButton}
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>

        {/* All Records */}
        <section>
          <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">{t.allRecordsTitle}</h2>
          <div className="space-y-4">
            {retrList.map((rec) => {
              const due = new Date(rec.dueDate);
              return (
                <div key={rec.id} className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <p>{t.productName}: {rec.product.name}</p>
                  <p>{t.model}: {rec.product.model}</p>
                  <p>{t.brand}: {rec.product.brand}</p>
                  <p>{t.location}: {rec.locationPath.join(" → ")}</p>
                  <p>{t.borrowerLabel}: {getDeviceName(rec.borrowerId)}</p>
                  <p>{t.dueDate}: {due.toLocaleString()}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
