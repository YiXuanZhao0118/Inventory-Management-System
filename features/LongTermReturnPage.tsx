// pages/LongTermReturnPage.tsx
"use client";

import React, { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Archive, Package } from "lucide-react";
import { fetcher } from "@/services/apiClient";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

type IAMSMap = { stockid: string; IAMSID: string };

// 抽出數字，讓 4031-4040-30020267、IAMS4031404030020267 都能比對
const digits = (s?: string) => (s ? s.replace(/\D+/g, "") : "");

// Shapes that match GET /api/rentals/return
type PMRow = {
  id: string; // rental record id
  stockId: string;
  product: { id: string; name: string; model: string; brand: string; spec: string };
  locationId: string;
  locationPath: string[];
  renter: string;
  borrower: string;
  loanDate: string;
  dueDate: string;
  isPropertyManaged: true;
  loanType: "short_term" | "long_term";
};

type NonPMRow = {
  stockId: string; // unused for non-PM
  product: { id: string; name: string; model: string; brand: string; spec: string };
  locationId: string;
  locationPath: string[];
  renter: string;
  borrower: string;
  loanDate: string;
  dueDate: string;
  qty: number; // outstanding count
  isPropertyManaged: false;
  loanType: "short_term" | "long_term";
};

type ApiResponse = {
  propertyManaged: PMRow[];
  nonPropertyManaged: NonPMRow[];
};

const keyOfNon = (g: NonPMRow) =>
  `${g.product.id}::${g.locationId}::${g.renter}::${g.borrower}::${g.loanType}`;

export default function LongTermReturnPage() {
  const { mutate: mutateCache } = useSWRConfig();

  // i18n
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, de: deDE };
  const t = (tMap[language] || zhTW).LongTermReturnPage;

  const { data: iamsData } = useSWR<IAMSMap[]>("/api/iams", fetcher);
  const iamsByStock = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of iamsData ?? []) {
      if (r?.stockid && r?.IAMSID) m.set(r.stockid, r.IAMSID);
    }
    return m;
  }, [iamsData]);


  const { data, error, mutate } = useSWR<ApiResponse>("/api/rentals/return", fetcher);

  // search
  const [q, setQ] = useState("");

  // selections
  const [selectedPM, setSelectedPM] = useState<Set<string>>(new Set()); // rental record ids
  const [selectedNon, setSelectedNon] = useState<Map<string, number>>(new Map()); // key -> qty

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  const pmRows = useMemo(() => {
    const list = data?.propertyManaged ?? [];
    const lower = q.trim().toLowerCase();
    if (!lower) return list;

    const qDigits = digits(lower);

    return list.filter((r) => {
      // 既有欄位比對
      const baseHit = [
        r.product.name,
        r.product.model,
        r.product.brand,
        r.renter,
        r.borrower,
        r.locationPath.join(" "),
        r.stockId,
      ]
        .join(" ")
        .toLowerCase()
        .includes(lower);

      // IAMS 比對（字串與純數字）
      const iamssid = iamsByStock.get(r.stockId) || "";
      const iamsHit =
        (iamssid && iamssid.toLowerCase().includes(lower)) ||
        (!!qDigits && digits(iamssid).includes(qDigits));

      // 額外：允許用純數字比對 stockId（若你的 stockId 含數字/QR）
      const idDigitsHit = !!qDigits && digits(r.stockId).includes(qDigits);

      return baseHit || iamsHit || idDigitsHit;
    });
  }, [data?.propertyManaged, q, iamsByStock]);


  const nonRows = useMemo(() => {
    const list = data?.nonPropertyManaged ?? [];
    const lower = q.trim().toLowerCase();
    if (!lower) return list;
    return list.filter((r) =>
      [r.product.name, r.product.model, r.renter, r.borrower, r.locationPath.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(lower)
    );
  }, [data, q]);

  const togglePM = (id: string) => {
    setSelectedPM((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleNon = (key: string, max: number) => {
    setSelectedNon((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, Math.max(1, Math.min(max, next.get(key) ?? max)));
      return next;
    });
  };

  const setNonQty = (key: string, val: number, max: number) => {
    setSelectedNon((prev) => {
      const next = new Map(prev);
      if (!next.has(key)) return prev;
      next.set(key, Math.max(1, Math.min(max, isNaN(val) ? 1 : val)));
      return next;
    });
  };

  const anySelected = selectedPM.size > 0 || selectedNon.size > 0;

  const openConfirm = () => {
    if (!anySelected) {
      alert(t.selectItemsFirst);
      return;
    }
    setConfirmOpen(true);
  };

  const doBatchReturn = async () => {
    // Build mixed payload
    const nowISO = new Date().toISOString();
    const payload: any[] = [];

    // PM items
    for (const id of selectedPM) {
      payload.push({ rentedItemId: id, returnDate: nowISO });
    }
    // Non-PM items
    for (const [key, qty] of selectedNon) {
      const [productId, locationId, renter, borrower, loanType] = key.split("::");
      payload.push({
        productId,
        locationId,
        quantity: qty,
        renter,
        borrower,
        loanType,
        returnDate: nowISO,
      });
    }

    setPosting(true);
    try {
      const res = await fetch("/api/rentals/long-term/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }

      // refresh lists
      await mutate(); // reload outstanding for return page
      await mutateCache("/api/rentals/rental"); // also refresh the rental page
      setSelectedPM(new Set());
      setSelectedNon(new Map());
      setConfirmOpen(false);
      alert(t.returnSuccess);
    } catch (e: any) {
      const msg = e?.message || "Unknown";
      alert(t.returnFailed.replace("{errorMessage}", msg));
    } finally {
      setPosting(false);
    }
  };

  const isOverdue = (iso: string) => {
    const d = new Date(iso).getTime();
    return !isNaN(d) && d < Date.now();
  };
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

  if (error) {
    const msg = (error as Error)?.message || "Unknown";
    return (
      <div className="max-w-screen-lg mx-auto p-6 bg-red-100 text-red-800 rounded-lg">
        {t.loadFailed.replace("{errorMessage}", msg)}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-screen-lg mx-auto p-6 text-gray-600 dark:text-gray-300">
        {t.loading}...
      </div>
    );
  }

  return (
    <div className="max-w-screen mx-auto p-6 md:p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-6">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white">🔄 {t.title}</h1>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <input
            type="text"
            className="w-full md:w-80 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder={t.searchPlaceholder}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            disabled={!anySelected}
            onClick={openConfirm}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium disabled:opacity-40"
          >
            {t.batchReturn}
          </button>
        </div>
      </div>

      {/* 兩欄：財產 / 非財產 */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 財產管理（逐筆） */}
        <div className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center gap-2 mb-2">
            <Archive className="w-4 h-4 text-indigo-600" />
            <h3 className="text-lg font-semibold">{t.pmListTitle}</h3>
          </div>
          <div className="space-y-2 max-h-[460px] overflow-auto pr-1">
            {pmRows.length === 0 && (
              <div className="text-sm text-gray-500">{t.noRecords}</div>
            )}
            {pmRows.map((r) => {
              const overdue = isOverdue(r.dueDate);
              return (
                <label
                  key={r.id}
                  className={`p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 flex items-start gap-3 cursor-pointer
                    ${
                      overdue
                        ? "border-red-300 bg-red-50 dark:border-red-500/60 dark:bg-red-900/20"
                        : "border-gray-700 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                    }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 accent-indigo-600 shrink-0"
                    checked={selectedPM.has(r.id)}
                    onChange={() => togglePM(r.id)}
                  />
                  <div className="min-w-0 space-y-0.5">
                    {/* 1) stockId */}
                    <div className="text-sm text-gray-900 dark:text-gray-300 truncate">
                      {t.idLabel}: <span className="text-blue-600 dark:text-red-200"> {r.stockId} </span>
                    </div>
                    {/* ✅ 新增：IAMS（僅在有對應時顯示） */}
                    {iamsByStock.get(r.stockId) && (
                      <div className="text-sm text-gray-900 dark:text-gray-300">
                        IAMS:{" "}
                        <span className="font-semibold text-purple-700 dark:text-purple-300">
                          {iamsByStock.get(r.stockId)}
                        </span>
                      </div>
                    )}
                    {/* 2) 名稱 型號 廠牌 */}
                    <div className="text-sm text-gray-900 dark:text-gray-300">
                      {r.product.name}・<span className="font-semibold text-red-600 dark:text-red-200"> {r.product.model} </span>・{r.product.brand}
                    </div>
                    {/* 3) 位置 */}
                    <div className="text-xs text-gray-600 dark:text-gray-300 truncate">
                      {r.locationPath.join(" → ")}
                    </div>
                    {/* 4) 借出者、借用者 */}
                    <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      {t.renter} {r.renter} ・ {t.borrower} {r.borrower}
                    </div>
                    {/* 5) 到期日（過期紅色） */}
                    <div
                      className={`text-xs truncate ${
                        overdue ? "text-red-600 dark:text-red-400 font-semibold" : "text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      {t.dueDate}：{fmtDate(r.dueDate)}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* 非財產管理（聚合） */}
        <div className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-indigo-600" />
            <h3 className="text-lg font-semibold">{t.nonPmListTitle}</h3>
          </div>
          <div className="space-y-2 max-h-[460px] overflow-auto pr-1">
            {nonRows.length === 0 && (
              <div className="text-sm text-gray-500">{t.noRecords}</div>
            )}
            {nonRows.map((g) => {
              const key = keyOfNon(g);
              const overdue = isOverdue(g.dueDate);
              const checked = selectedNon.has(key);
              const max = g.qty;
              const qty = checked ? (selectedNon.get(key) || 1) : 0;

              return (
                <div
                  key={key}
                  className={`p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 flex items-start justify-between gap-3
                    ${
                      overdue
                        ? "border-red-300 bg-red-50 dark:border-red-500/60 dark:bg-red-900/20"
                        : "border-gray-700 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                    }`}
                >
                  {/* 左側：資訊 */}
                  <label className="min-w-0 block cursor-pointer" onClick={() => toggleNon(key, max)}>
                    <div className="text-sm">
                      {g.product.name}・<span className="font-semibold text-red-600 dark:text-red-200"> {g.product.model} </span>・{g.product.brand}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      {g.locationPath.join(" → ")}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {t.qty}：<span className="font-semibold text-red-600 dark:text-red-200"> {g.qty} </span>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      {t.renter} {g.renter} ・ {t.borrower} {g.borrower}
                    </div>
                    <div
                      className={`text-xs truncate ${
                        overdue ? "text-red-900 dark:text-red-400 font-semibold" : "text-gray-600 dark:text-gray-400"
                      }`}
                    >
                      {t.dueDate}：{fmtDate(g.dueDate)}
                    </div>
                  </label>

                  {/* 右側：選取數量控制 */}
                  <div className="shrink-0 flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="accent-indigo-600"
                      checked={checked}
                      onChange={() => toggleNon(key, max)}
                    />
                    <span className={`text-xs ${checked ? "" : "opacity-80"}`}>{t.qty}</span>
                    <input
                      type="number"
                      min={1}
                      max={max}
                      value={checked ? qty : ""}
                      disabled={!checked}
                      onChange={(e) => setNonQty(key, parseInt(e.target.value || "1", 10), max)}
                      className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-sm text-center"
                    />
                    <span className="text-xs text-gray-900 dark:text-gray-300">/ {t.max} {max}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 確認彈窗 */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-xl">
            <h3 className="text-lg font-semibold mb-3">{t.confirmTitle}</h3>

            <div className="space-y-4 max-h-[60vh] overflow-auto pr-1 text-sm">
              <div className="p-3 rounded-lg border dark:border-gray-700">
                <div className="font-medium mb-2">{t.confirmPMTitle}</div>
                {selectedPM.size === 0 ? (
                  <div className="text-gray-500">{t.none}</div>
                ) : (
                  <ul className="list-disc pl-5 space-y-1">
                    {[...selectedPM].map((id) => {
                      const row = (data?.propertyManaged ?? []).find((r) => r.id === id);
                      return (
                        <li key={id}>
                          {row
                            ? `${row.product.name}/${row.product.model}/${row.product.brand} · ${row.locationPath.join(" → ")} · ${t.idLabel}:${row.stockId}`
                            : id}
                          {row && iamsByStock.get(row.stockId) && (
                            <> · IAMS:{' '}
                              <span className="font-mono">{iamsByStock.get(row.stockId)}</span>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="p-3 rounded-lg border dark:border-gray-700">
                <div className="font-medium mb-2">{t.confirmNonPMTitle}</div>
                {selectedNon.size === 0 ? (
                  <div className="text-gray-500">{t.none}</div>
                ) : (
                  <ul className="list-disc pl-5 space-y-1">
                    {[...selectedNon.entries()].map(([key, qty]) => {
                      const [productId, locationId, renter, borrower, loanType] = key.split("::");
                      const row = (data?.nonPropertyManaged ?? []).find(
                        (g) =>
                          g.product.id === productId &&
                          g.locationId === locationId &&
                          g.renter === renter &&
                          g.borrower === borrower &&
                          g.loanType === (loanType as any)
                      );
                      return (
                        <li key={key}>
                          {row
                            ? `${row.product.name}/${row.product.model}/${row.product.brand} · ${row.locationPath.join(" → ")} · ${loanType} · ${t.qty}：${qty}`
                            : `${productId}/${locationId}/${renter}/${borrower}/${loanType} · ${t.qty}：${qty}`}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-3 py-2 rounded bg-gray-300 dark:bg-gray-700"
                onClick={() => setConfirmOpen(false)}
                disabled={posting}
              >
                {t.cancel}
              </button>
              <button
                className="px-3 py-2 rounded bg-indigo-600 text-white disabled:opacity-60"
                onClick={doBatchReturn}
                disabled={posting}
              >
                {posting ? t.submitting : t.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
