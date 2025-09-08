// features/AddStockPage.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Archive, Package } from "lucide-react";
import { fetcher } from "@/services/apiClient";
import { ProductItem, LocationNode } from "@/lib/database";

// ✅ i18n
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

// ---- 型別 ----
type Draft = {
  productId: string;
  product: Pick<
    ProductItem,
    "id" | "name" | "model" | "brand" | "isPropertyManaged"
  >;
  quantity: number; // 財產固定 1；非財產可 >1
  locationId: "1";
};

export default function AddStockPage() {
  // ✅ i18n mapping
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const t = (tMap[language] || zhTW).AddStockPage;

  // 狀態
  const [message, setMessage] = useState<string | null>(null);
  const [searchPM, setSearchPM] = useState("");
  const [searchNon, setSearchNon] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);

  // 🔔 確認視窗
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  // 讀取產品（沿用 /api/addStock 的 GET）
  const { data, error } = useSWR<{ products: ProductItem[] }>(
    "/api/addStock",
    fetcher,
    {
      revalidateOnFocus: true,
    }
  );
  const all = data?.products ?? [];

  // 讀取 locationTree，從 root 找到 id === "1" 的標籤
  const { data: locTree } = useSWR<LocationNode[]>(
    "/api/location-tree",
    fetcher
  );
  const containerLabel = useMemo(() => {
    const label = locTree?.find((n) => n.id === "1")?.label;
    return label ?? t.containerFallback; // 找不到時後備顯示
  }, [locTree, t.containerFallback]);

  // 兩欄分組 + 搜尋
  const pmList = useMemo(() => {
    const list = all.filter((p) => p.isPropertyManaged);
    if (!searchPM.trim()) return list;
    const q = searchPM.trim().toLowerCase();
    return list.filter((p) =>
      [p.name, p.model, p.brand, p.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [all, searchPM]);

  const nonList = useMemo(() => {
    const list = all.filter((p) => !p.isPropertyManaged);
    if (!searchNon.trim()) return list;
    const q = searchNon.trim().toLowerCase();
    return list.filter((p) =>
      [p.name, p.model, p.brand, p.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [all, searchNon]);

  // 加入草稿（財產：每按一下就多一筆；非財產：合併數量）
  const addDraftForProduct = (p: ProductItem) => {
    const base: Draft = {
      productId: p.id,
      product: {
        id: p.id,
        name: p.name,
        model: p.model,
        brand: p.brand,
        isPropertyManaged: p.isPropertyManaged,
      },
      quantity: p.isPropertyManaged ? 1 : 1,
      locationId: "1",
    };
    setDrafts((prev) => {
      if (p.isPropertyManaged) return [...prev, base];
      const idx = prev.findIndex(
        (d) => !d.product.isPropertyManaged && d.productId === p.id
      );
      if (idx >= 0) {
        const copy = prev.slice();
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [...prev, base];
    });
  };

  // 原生拖拉：開始 / 丟到選擇區
  const onDragStart = (e: React.DragEvent, dragId: string) => {
    e.dataTransfer.setData("text/plain", dragId); // 'prod::<productId>'
  };
  const onDropToSelection = (e: React.DragEvent) => {
    e.preventDefault();
    const dragId = e.dataTransfer.getData("text/plain");
    if (!dragId?.startsWith("prod::")) return;
    const pid = dragId.slice(6);
    const p = all.find((x) => x.id === pid);
    if (p) addDraftForProduct(p);
  };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  // 草稿操作
  const updateDraftQty = (i: number, newQty: number) =>
    setDrafts((prev) =>
      prev.map((d, idx) =>
        idx === i ? { ...d, quantity: Math.max(1, Math.floor(newQty) || 1) } : d
      )
    );
  const removeDraft = (i: number) =>
    setDrafts((prev) => prev.filter((_, idx) => i !== idx));
  const clearDrafts = () => setDrafts([]);

  // 開啟確認（只開視窗，不送出）
  const openConfirm = () => {
    if (drafts.length === 0) return; // 沒東西不開
    setConfirmOpen(true);
  };

  // 送出（只有在確認視窗按「確認」才會呼叫）
  const submitAll = async () => {
    if (drafts.length === 0) return;
    const payload: Array<{
      productId: string;
      locationId: string;
      quantity: number;
    }> = drafts.map((d) => ({
      productId: d.productId,
      locationId: d.locationId,
      quantity: d.product.isPropertyManaged ? 1 : d.quantity,
    }));

    setPosting(true);
    try {
      const res = await fetch("/api/addStock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg =
          j?.errors?.map((e: any) => `#${e.index}: ${e.message}`).join("；") ||
          j?.error ||
          `HTTP ${res.status}`;
        throw new Error(errMsg);
      }
      setMessage(t.submitSuccess);
      setDrafts([]);
      setConfirmOpen(false);
      setTimeout(() => setMessage(null), 1200);
    } catch (e: any) {
      setMessage(`${t.submitFailed} ${e?.message || e}`);
      setTimeout(() => setMessage(null), 1800);
    } finally {
      setPosting(false);
    }
  };

  // ESC 關閉確認視窗（送出中則不關）
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && confirmOpen && !posting) setConfirmOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen, posting]);

  if (error)
    return (
      <div className="p-6 text-red-600">
        {t.loadFailed}: {String((error as Error).message)}
      </div>
    );
  if (!data) return <div className="p-6 text-gray-600">{t.loading}</div>;

  return (
    <div className="max-w-screen mx-auto p-6 md:p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-6">
      <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white">
        ➕ {t.title}
      </h2>

      {message && (
        <div className="px-4 py-2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          {message}
        </div>
      )}

      {/* 兩欄：PM / Non-PM（可拖拉＋按鈕加入） */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PM */}
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
            {pmList.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => onDragStart(e, `prod::${p.id}`)}
                className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm transition flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-semibold text-red-600 dark:text-red-200">
                      {" "}
                      {p.model}{" "}
                    </span>{" "}
                    · {p.brand}
                  </div>
                </div>
                <button
                  className="px-2 py-1 text-xs rounded bg-indigo-600 text-white"
                  onClick={() => addDraftForProduct(p)}
                >
                  {t.add}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Non-PM */}
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
          <div className="grid gap-3 max-h-[420px] overflow-auto pr-1">
            {nonList.length === 0 && (
              <div className="text-sm text-gray-500">{t.noMatches}</div>
            )}
            {nonList.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => onDragStart(e, `prod::${p.id}`)}
                className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm transition flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-semibold text-red-600 dark:text-red-200">
                      {" "}
                      {p.model}{" "}
                    </span>{" "}
                    · {p.brand}
                  </div>
                </div>
                <button
                  className="px-2 py-1 text-xs rounded bg-indigo-600 text-white"
                  onClick={() => addDraftForProduct(p)}
                >
                  {t.add}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 選擇區（待新增清單） */}
      <section className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-4">
        <h3 className="font-semibold text-lg">🧺 {t.selectionTitle}</h3>
        <div
          className="min-h-[160px] p-4 rounded-lg border-2 border-dashed dark:border-gray-700 bg-white dark:bg-gray-800"
          onDrop={onDropToSelection}
          onDragOver={onDragOver}
        >
          {drafts.length === 0 ? (
            <div className="text-center text-gray-500">{t.emptyList}</div>
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
                  {drafts.map((d, i) => (
                    <tr key={`${d.productId}-${i}`}>
                      <td className="px-3 py-2">{d.product.name}</td>
                      <td className="px-3 py-2">
                        {d.product.model} / {d.product.brand}
                      </td>
                      <td className="px-3 py-2">
                        {d.product.isPropertyManaged
                          ? t.typeProperty
                          : t.typeNonProperty}
                      </td>
                      <td className="px-3 py-2 font-mono">{containerLabel}</td>
                      <td className="px-3 py-2">
                        {d.product.isPropertyManaged ? (
                          <span>1</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              className="px-2 py-1 rounded border dark:border-gray-700"
                              onClick={() =>
                                updateDraftQty(i, Math.max(1, d.quantity - 1))
                              }
                              aria-label="decrement"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              className="w-20 px-2 py-1 border rounded text-center dark:bg-gray-900 dark:border-gray-700"
                              min={1}
                              value={d.quantity}
                              onChange={(e) =>
                                updateDraftQty(
                                  i,
                                  parseInt(e.target.value || "1", 10)
                                )
                              }
                            />
                            <button
                              className="px-2 py-1 rounded border dark:border-gray-700"
                              onClick={() => updateDraftQty(i, d.quantity + 1)}
                              aria-label="increment"
                            >
                              ＋
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="text-red-500 hover:underline"
                          onClick={() => removeDraft(i)}
                        >
                          {t.remove}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            className="text-gray-500 hover:underline"
            onClick={clearDrafts}
          >
            {t.clear}
          </button>
          <button
            className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-60"
            onClick={openConfirm}
            disabled={drafts.length === 0}
          >
            {t.submitAdd}
          </button>
        </div>
      </section>

      {/* ✅ 確認視窗 */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-5"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm add"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">
                {t.confirmTitle || "確認新增"}
              </h3>
              <button
                className="text-gray-500 hover:underline"
                onClick={() => !posting && setConfirmOpen(false)}
                disabled={posting}
              >
                {t.cancel || "返回"}
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-auto pr-1 text-sm">
              {drafts.length === 0 ? (
                <div className="text-gray-500">{t.emptyList}</div>
              ) : (
                <ul className="space-y-2">
                  {drafts.map((d, i) => (
                    <li
                      key={`${d.productId}-${i}`}
                      className="p-3 rounded-lg border dark:border-gray-700"
                    >
                      <div className="font-medium">{d.product.name}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        {t.thModelBrand}：
                        <b className="text-red-600 dark:text-red-200">
                          {d.product.model}
                        </b>
                        ・{d.product.brand}
                      </div>
                      <div className="text-xs">
                        {t.thType}：
                        {d.product.isPropertyManaged
                          ? t.typeProperty
                          : t.typeNonProperty}
                      </div>
                      <div className="text-xs">
                        {t.thLocation}：
                        <span className="font-mono">{containerLabel}</span>
                      </div>
                      <div className="text-xs">
                        {t.thQuantity}：
                        <b>{d.product.isPropertyManaged ? 1 : d.quantity}</b>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="px-3 py-2 rounded bg-gray-300 dark:bg-gray-700 disabled:opacity-60"
                onClick={() => setConfirmOpen(false)}
                disabled={posting}
              >
                {t.backToEdit || t.cancel || "返回修改"}
              </button>
              <button
                className="px-3 py-2 rounded bg-indigo-600 text-white disabled:opacity-60"
                onClick={submitAll}
                disabled={posting || drafts.length === 0}
              >
                {posting
                  ? t.submitting || "正在送出…"
                  : t.confirmAdd || "確認送出"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
