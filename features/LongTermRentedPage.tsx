// features/LongTermRentedPage.tsx
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

// ---------- Types from GET /api/rentals/rental ----------
type PropertyManagedItem = {
  stockId: string;
  name: string;
  brand: string;
  model: string;
  specifications: string;
  price: number;
  locationLabelLink: string;
  isPropertyManaged: true;
};

type NonPropertyManagedItem = {
  productId: string;
  name: string;
  brand: string;
  model: string;
  specifications: string;
  price: number;
  locationId: string;
  locationLabelLink: string;
  quantity: number; // available
  isPropertyManaged: false;
};

type LongTermGetResponse = {
  nonPropertyManaged: NonPropertyManagedItem[];
  propertyManaged: PropertyManagedItem[];
};

// ---------- Batch types ----------
type BatchItemPM = { kind: "pm"; stockId: string; display: string };
type BatchItemNonPM = {
  kind: "nonpm";
  productId: string;
  locationId: string;
  qty: number;
  display: string;
};
type BatchItem = BatchItemPM | BatchItemNonPM;

export default function LongTermRentedPage() {
  const { mutate } = useSWRConfig();

  // i18n
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const t = (tMap[language] || zhTW).LongTermRentedPage;

  const { data: iamsData } = useSWR<IAMSMap[]>("/api/iams", fetcher);
  const iamsByStock = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of iamsData ?? []) {
      if (r?.stockid && r?.IAMSID) m.set(r.stockid, r.IAMSID);
    }
    return m;
  }, [iamsData]);

  // load data
  const { data, error } = useSWR<LongTermGetResponse>(
    "/api/rentals/rental",
    fetcher
  );
  const propertyManaged = data?.propertyManaged ?? [];
  const nonPropertyManaged = data?.nonPropertyManaged ?? [];
  const isLoading = !data && !error;

  // searches
  const [searchPM, setSearchPM] = useState("");
  const [searchNon, setSearchNon] = useState("");

  // global fields
  const [renter, setRenter] = useState("");
  const [borrower, setBorrower] = useState("");
  const [dueDate, setDueDate] = useState(""); // YYYY-MM-DD

  // batch
  const [batch, setBatch] = useState<BatchItem[]>([]);

  // ---- Derived helpers ----
  const pmSelected = useMemo(
    () =>
      new Set(
        batch
          .filter((b) => b.kind === "pm")
          .map((b) => (b as BatchItemPM).stockId)
      ),
    [batch]
  );

  // how many nonpm already picked per (productId, locationId)
  const pickedNonCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of batch) {
      if (b.kind === "nonpm") {
        const k = `${(b as BatchItemNonPM).productId}::${
          (b as BatchItemNonPM).locationId
        }`;
        map.set(k, (map.get(k) ?? 0) + (b as BatchItemNonPM).qty);
      }
    }
    return map;
  }, [batch]);

  // filtered lists + remaining
  const pmList = useMemo(() => {
    const q = searchPM.trim().toLowerCase();
    const base = propertyManaged;

    if (!q) return base.filter((i) => !pmSelected.has(i.stockId));

    const qDigits = digits(q);

    const filtered = base.filter((i) => {
      // 既有文字欄位
      const textHit =
        `${i.stockId} ${i.brand} ${i.model} ${i.locationLabelLink}`
          .toLowerCase()
          .includes(q);

      // IAMS 比對（含純數字比對）
      const iamssid = iamsByStock.get(i.stockId) || "";
      const iamsHit =
        (iamssid && iamssid.toLowerCase().includes(q)) ||
        (!!qDigits && digits(iamssid).includes(qDigits));

      // 額外：也容許用純數字比對 stockId（若你的 stockId 內含數字或 QR 邏輯）
      const idDigitsHit = !!qDigits && digits(i.stockId).includes(qDigits);

      return textHit || iamsHit || idDigitsHit;
    });

    return filtered.filter((i) => !pmSelected.has(i.stockId));
  }, [propertyManaged, searchPM, pmSelected, iamsByStock]);

  const nonList = useMemo(() => {
    const q = searchNon.trim().toLowerCase();
    const base = q
      ? nonPropertyManaged.filter((g) =>
          `${g.productId} ${g.brand} ${g.model} ${g.locationLabelLink}`
            .toLowerCase()
            .includes(q)
        )
      : nonPropertyManaged;

    return base
      .map((g) => {
        const key = `${g.productId}::${g.locationId}`;
        const used = pickedNonCount.get(key) ?? 0;
        const remaining = Math.max(0, (g.quantity ?? 0) - used);
        return { ...g, remaining };
      })
      .filter((g) => g.remaining > 0);
  }, [nonPropertyManaged, searchNon, pickedNonCount]);

  const getCap = (productId: string, locationId: string) =>
    nonPropertyManaged.find(
      (g) => g.productId === productId && g.locationId === locationId
    )?.quantity ?? 0;

  // ---- add actions ----
  const addPM = (stockId: string) => {
    if (pmSelected.has(stockId)) return;
    const picked = propertyManaged.find((i) => i.stockId === stockId);
    const iams = iamsByStock.get(stockId);
    const display = picked
      ? `${picked.brand} ${picked.model}・${picked.locationLabelLink}\n${
          t.idLabel
        }: ${stockId}${iams ? `\nIAMS: ${iams}` : ""}`
      : `${t.idLabel}: ${stockId}${iams ? `\nIAMS: ${iams}` : ""}`;
    setBatch((b) => [...b, { kind: "pm", stockId, display }]);
  };

  const addNon = (productId: string, locationId: string) => {
    const cap = getCap(productId, locationId);
    const g = nonPropertyManaged.find(
      (x) => x.productId === productId && x.locationId === locationId
    );
    const display = g
      ? `${g.brand} ${g.model}・${g.locationLabelLink}`
      : `${productId}・${locationId}`;

    setBatch((prev) => {
      const idx = prev.findIndex(
        (x) =>
          x.kind === "nonpm" &&
          (x as BatchItemNonPM).productId === productId &&
          (x as BatchItemNonPM).locationId === locationId
      );
      if (idx === -1) {
        if (cap <= 0) return prev;
        return [
          ...prev,
          { kind: "nonpm", productId, locationId, qty: 1, display },
        ];
      }
      const cur = prev[idx] as BatchItemNonPM;
      if (cur.qty >= cap) return prev;
      const next = [...prev];
      next[idx] = { ...cur, qty: Math.min(cur.qty + 1, cap) };
      return next;
    });
  };

  const removeIdx = (idx: number) =>
    setBatch((prev) => prev.filter((_, i) => i !== idx));

  // ---- confirm modal flow ----
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  const openConfirm = () => {
    if (!renter || !borrower || !dueDate || batch.length === 0) {
      alert(t.fillAllFields);
      return;
    }
    setConfirmOpen(true);
  };

  const doSubmit = async () => {
    const loanType = "long_term";
    const loanDate = new Date().toISOString();
    const dueISO = new Date(`${dueDate}T00:00:00`).toISOString();

    const payload = batch.map((item) =>
      item.kind === "pm"
        ? {
            stockId: (item as BatchItemPM).stockId,
            renter,
            borrower,
            loanType,
            loanDate,
            dueDate: dueISO,
          }
        : {
            productId: (item as BatchItemNonPM).productId,
            locationId: (item as BatchItemNonPM).locationId,
            quantity: (item as BatchItemNonPM).qty,
            renter,
            borrower,
            loanType,
            loanDate,
            dueDate: dueISO,
          }
    );

    setPosting(true);
    try {
      const res = await fetch("/api/rentals/long-term/rental", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${res.status}`);
      }
      await mutate("/api/rentals/rental");
      alert(t.loanSuccess);
      setBatch([]);
      setRenter("");
      setBorrower("");
      setDueDate("");
      setConfirmOpen(false);
    } catch (e: any) {
      alert(t.loanFailed + (e?.message ? `: ${e.message}` : ""));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="max-w-screen mx-auto p-6 md:p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-6">
      <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white">
        🤝 {t.title}
      </h2>

      {isLoading && <div className="p-4 text-gray-600">{t.loading}…</div>}
      {error && <div className="p-4 text-red-600">{t.loadFailed}</div>}

      {/* 上半：兩欄清單 */}
      <section
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        aria-disabled={isLoading || !!error}
      >
        {/* 財產管理（逐筆） */}
        <div className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-indigo-600" />
              <h3 className="text-lg font-semibold">{t.pmTitle}</h3>
            </div>
            <input
              className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700"
              placeholder={t.searchPlaceholder}
              value={searchPM}
              onChange={(e) => setSearchPM(e.target.value)}
            />
          </div>
          <div className="grid gap-3 max-h-[420px] overflow-auto pr-1">
            {pmList.length === 0 && (
              <div className="text-sm text-gray-500">{t.noMatches}</div>
            )}
            {pmList.map((s) => (
              <div
                key={s.stockId}
                className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 truncate">
                    {t.idLabel}:{" "}
                    <span className="text-blue-600 dark:text-blue-200">
                      {" "}
                      {s.stockId}{" "}
                    </span>
                  </div>

                  {/* ✅ 新增：有 IAMS 才顯示 */}
                  {iamsByStock.get(s.stockId) && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      IAMS:{" "}
                      <span className="font-semibold text-purple-600 dark:text-purple-300">
                        {iamsByStock.get(s.stockId)}
                      </span>
                    </div>
                  )}
                  <div className="text-sm font-medium truncate">
                    <span className="font-semibold text-red-600 dark:text-red-200">
                      {" "}
                      {s.model}{" "}
                    </span>
                    ・{s.brand}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {s.locationLabelLink}
                  </div>
                </div>
                <button
                  className="px-2 py-1 text-xs rounded bg-indigo-600 text-white"
                  onClick={() => addPM(s.stockId)}
                  disabled={pmSelected.has(s.stockId)}
                >
                  {t.add}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 非財產管理（聚合） */}
        <div className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-600" />
              <h3 className="text-lg font-semibold">{t.nonPmTitle}</h3>
            </div>
            <input
              className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700"
              placeholder={t.searchPlaceholder}
              value={searchNon}
              onChange={(e) => setSearchNon(e.target.value)}
            />
          </div>
          <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
            {nonList.length === 0 && (
              <div className="text-sm text-gray-500">{t.noMatches}</div>
            )}
            {nonList.map((g) => (
              <div
                key={`${g.productId}::${g.locationId}`}
                className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    <span className="font-semibold text-red-600 dark:text-red-200">
                      {" "}
                      {g.model}{" "}
                    </span>
                    ・{g.brand}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {g.locationLabelLink}
                  </div>
                  <div className="text-[12px] text-gray-500">
                    {t.availableLabel}{" "}
                    <span className="font-semibold text-red-600 dark:text-red-200">
                      {" "}
                      {g.remaining ?? g.quantity}{" "}
                    </span>
                  </div>
                </div>
                <button
                  className="px-2 py-1 text-xs rounded bg-indigo-600 text-white"
                  onClick={() => addNon(g.productId, g.locationId)}
                  disabled={(g as any).remaining <= 0}
                >
                  {t.add}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 下半：選擇區 + 全域欄位 + 出借 */}
      <section className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-4">
        <h3 className="font-semibold text-lg">🧺 {t.selectedSectionTitle}</h3>

        <div className="min-h-[160px] p-4 rounded-lg border-2 border-dashed dark:border-gray-700 bg-white dark:bg-gray-800">
          {batch.length === 0 ? (
            <div className="text-center text-gray-500">
              {t.selectedEmptyHint}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/40">
                  <tr>
                    <th className="px-3 py-2 text-left">{t.thProduct}</th>
                    <th className="px-3 py-2 text-left">{t.thModelBrand}</th>
                    <th className="px-3 py-2 text-left">{t.thType}</th>
                    <th className="px-3 py-2 text-left">{t.thLocation}</th>
                    <th className="px-3 py-2 text-left">{t.thQuantity}</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {batch.map((b, idx) => {
                    if (b.kind === "pm") {
                      const pm = propertyManaged.find(
                        (x) => x.stockId === b.stockId
                      );
                      return (
                        <tr key={`pm-${idx}`}>
                          <td className="px-3 py-2">
                            <div className="font-medium">{pm?.name || "-"}</div>

                            {/* ID */}
                            <div className="text-xs">
                              {t.idLabel}:{" "}
                              <code className="font-mono">
                                {pm?.stockId ?? b.stockId}
                              </code>
                            </div>

                            {/* IAMS（有才顯示） */}
                            {iamsByStock.get(b.stockId) && (
                              <div className="text-xs text-purple-600 dark:text-purple-300">
                                IAMS:{" "}
                                <code className="font-mono">
                                  {iamsByStock.get(b.stockId)}
                                </code>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {pm?.model}・{pm?.brand}
                          </td>
                          <td className="px-3 py-2">{t.typeProperty}</td>
                          <td className="px-3 py-2 font-mono">
                            {pm?.locationLabelLink}
                          </td>
                          <td className="px-3 py-2">1</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              className="text-red-500 hover:underline"
                              onClick={() => removeIdx(idx)}
                            >
                              {t.remove}
                            </button>
                          </td>
                        </tr>
                      );
                    } else {
                      const n = b as BatchItemNonPM;
                      const cap = getCap(n.productId, n.locationId);
                      const g = nonPropertyManaged.find(
                        (x) =>
                          x.productId === n.productId &&
                          x.locationId === n.locationId
                      );
                      return (
                        <tr key={`non-${idx}`}>
                          <td className="px-3 py-2">{g?.name || "-"}</td>
                          <td className="px-3 py-2">
                            {g?.model}・{g?.brand}
                          </td>
                          <td className="px-3 py-2">{t.typeNonProperty}</td>
                          <td className="px-3 py-2 font-mono">
                            {g?.locationLabelLink}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <button
                                className="px-2 py-1 rounded border dark:border-gray-700"
                                onClick={() =>
                                  setBatch((prev) => {
                                    const next = [...prev];
                                    next[idx] = {
                                      ...n,
                                      qty: Math.max(1, n.qty - 1),
                                    };
                                    return next;
                                  })
                                }
                              >
                                −
                              </button>
                              <input
                                type="number"
                                className="w-20 px-2 py-1 border rounded text-center dark:bg-gray-900 dark:border-gray-700"
                                min={1}
                                max={cap}
                                value={n.qty}
                                onChange={(e) => {
                                  const raw = parseInt(
                                    e.target.value || "1",
                                    10
                                  );
                                  const val = Math.max(
                                    1,
                                    Math.min(cap, isNaN(raw) ? 1 : raw)
                                  );
                                  setBatch((prev) => {
                                    const next = [...prev];
                                    (next[idx] as BatchItemNonPM) = {
                                      ...n,
                                      qty: val,
                                    };
                                    return next;
                                  });
                                }}
                              />
                              <button
                                className="px-2 py-1 rounded border dark:border-gray-700"
                                onClick={() =>
                                  setBatch((prev) => {
                                    const next = [...prev];
                                    next[idx] = {
                                      ...n,
                                      qty: Math.min(cap, n.qty + 1),
                                    };
                                    return next;
                                  })
                                }
                              >
                                ＋
                              </button>
                              <span className="text-xs text-gray-500">
                                / {t.max} {cap}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              className="text-red-500 hover:underline"
                              onClick={() => removeIdx(idx)}
                            >
                              {t.remove}
                            </button>
                          </td>
                        </tr>
                      );
                    }
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 全域欄位 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t.renter}
            </label>
            <input
              type="text"
              value={renter}
              onChange={(e) => setRenter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t.borrower}
            </label>
            <input
              type="text"
              value={borrower}
              onChange={(e) => setBorrower(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t.dueDate}
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            className="text-gray-500 hover:underline"
            onClick={() => setBatch([])}
          >
            {t.clearSelection}
          </button>
          <button
            onClick={openConfirm}
            disabled={
              !renter ||
              !borrower ||
              !dueDate ||
              batch.length === 0 ||
              isLoading ||
              !!error
            }
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-lg disabled:opacity-50"
          >
            {t.loan}
          </button>
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
                {batch.filter((b) => b.kind === "pm").length === 0 ? (
                  <div className="text-gray-500">{t.none}</div>
                ) : (
                  <ul className="list-disc pl-5 space-y-1">
                    {batch
                      .filter((b) => b.kind === "pm")
                      .map((b, i) => (
                        <li key={`cpm-${i}`} className="whitespace-pre-line">
                          {(b as BatchItemPM).display}
                        </li>
                      ))}
                  </ul>
                )}
              </div>

              <div className="p-3 rounded-lg border dark:border-gray-700">
                <div className="font-medium mb-2">{t.confirmNonPMTitle}</div>
                {batch.filter((b) => b.kind === "nonpm").length === 0 ? (
                  <div className="text-gray-500">{t.none}</div>
                ) : (
                  <ul className="list-disc pl-5 space-y-1">
                    {batch
                      .filter((b) => b.kind === "nonpm")
                      .map((b, i) => (
                        <li key={`cnon-${i}`}>
                          {(b as BatchItemNonPM).display} · {t.qtyShort}{" "}
                          {(b as BatchItemNonPM).qty}
                        </li>
                      ))}
                  </ul>
                )}
              </div>

              <div className="p-3 rounded-lg border dark:border-gray-700">
                <div>
                  <b>{t.renter}：</b> {renter}
                </div>
                <div>
                  <b>{t.borrower}：</b> {borrower}
                </div>
                <div>
                  <b>{t.dueDate}：</b> {dueDate}
                </div>
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
                onClick={doSubmit}
                disabled={posting}
              >
                {posting ? t.submitting : t.confirmLoan}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
