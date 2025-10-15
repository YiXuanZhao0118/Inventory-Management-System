"use client";
import { PackagePlus } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Archive, Package } from "lucide-react";

// ✅ i18n
import { useLanguage } from "@/src/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

/* ---------- 最小型別，避免依賴不存在模組 ---------- */
type ProductItem = {
  id: string;
  name: string;
  model: string;
  brand: string;
  isPropertyManaged: boolean;
};
type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages?: number;
};
type PagedResp<T> = { items: T[]; page?: PageMeta };

/* ---------- fetcher / qs ---------- */
const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};
const qs = (o: Record<string, any>) =>
  "?" +
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
    )
    .join("&");

/* ---------- 常數：新 API 路徑 ---------- */
const PRODUCTS_API = "/api/products"; // GET ?isPM=true|false&q=&page=&limit=
const ADD_STOCK_API = "/api/inventory/add"; // POST { PropertyManaged:[], nonPropertyManaged:[] }
const PAGE_SIZE = 20;

/* ---------- Draft 型別（維持你原本頁的資料結構與 UI） ---------- */
type Draft = {
  productId: string;
  product: Pick<
    ProductItem,
    "id" | "name" | "model" | "brand" | "isPropertyManaged"
  >;
  quantity: number; // 財產固定 1；非財產可 >1
  locationId: "1"; // 後端固定落 ROOT，不再送出，僅 UI 顯示
};

/* ---------- 快速就地通知 ---------- */
type QuickToast = {
  productId: string;
  count: number;
  until: number; // ms timestamp
  text: string; // 顯示內容（model/brand）
};

export default function AddInventory() {
  // ✅ i18n mapping
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const t = (tMap[language] || zhTW).AddStockPage;

  // 狀態訊息
  const [message, setMessage] = useState<string | null>(null);

  // 左右欄各自搜尋與分頁
  const [searchPM, setSearchPM] = useState("");
  const [searchNon, setSearchNon] = useState("");
  const [pmPage, setPmPage] = useState(1);
  const [nonPage, setNonPage] = useState(1);

  // 草稿
  const [drafts, setDrafts] = useState<Draft[]>([]);

  // 🔔 確認視窗
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  // 容器顯示用（不再打 /api/location-tree，避免 404）
  const containerLabel = t.containerFallback || "ROOT";

  // 搜尋變動回到第 1 頁
  useEffect(() => setPmPage(1), [searchPM]);
  useEffect(() => setNonPage(1), [searchNon]);

  /* ====== 新 API：PM / NonPM 分頁各 20 筆 ====== */
  const pmKey = useMemo(
    () =>
      `${PRODUCTS_API}${qs({
        isPM: true,
        q: searchPM.trim(),
        page: pmPage,
        limit: PAGE_SIZE,
      })}`,
    [searchPM, pmPage]
  );
  const nonKey = useMemo(
    () =>
      `${PRODUCTS_API}${qs({
        isPM: false,
        q: searchNon.trim(),
        page: nonPage,
        limit: PAGE_SIZE,
      })}`,
    [searchNon, nonPage]
  );

  const {
    data: pmRes,
    error: pmErr,
    isLoading: pmLoading,
  } = useSWR<PagedResp<ProductItem>>(pmKey, fetcher, {
    revalidateOnFocus: true,
  });

  const {
    data: nonRes,
    error: nonErr,
    isLoading: nonLoading,
  } = useSWR<PagedResp<ProductItem>>(nonKey, fetcher, {
    revalidateOnFocus: true,
  });

  const pmList = pmRes?.items ?? [];
  const nonList = nonRes?.items ?? [];

  // 分頁資訊
  const pmTotal = pmRes?.page?.total ?? null;
  const pmPageSize = pmRes?.page?.pageSize ?? PAGE_SIZE;
  const pmPageCount =
    pmRes?.page?.totalPages ??
    (pmTotal ? Math.max(1, Math.ceil(pmTotal / pmPageSize)) : null);
  const pmTotalPagesDisp = Math.max(1, pmPageCount || 1);

  const nonTotal = nonRes?.page?.total ?? null;
  const nonPageSize = nonRes?.page?.pageSize ?? PAGE_SIZE;
  const nonPageCount =
    nonRes?.page?.totalPages ??
    (nonTotal ? Math.max(1, Math.ceil(nonTotal / nonPageSize)) : null);
  const nonTotalPagesDisp = Math.max(1, nonPageCount || 1);

  /* ====== 快速就地通知（1秒自動消失，切換商品會替換） ====== */
  const [toast, setToast] = useState<QuickToast | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bumpToastForProduct = (p: ProductItem) => {
    const now = Date.now();
    setToast((prev) => {
      let next: QuickToast;
      if (prev && prev.productId === p.id && now < prev.until) {
        // 同一商品 1 秒內連續點擊 => 疊加次數並延長 1 秒
        next = {
          ...prev,
          count: prev.count + 1,
          until: now + 1000,
        };
      } else {
        // 新商品或前一個已過期 => 建立新通知
        next = {
          productId: p.id,
          count: 1,
          until: now + 1000,
          text: `${p.model} / ${p.brand}`,
        };
      }
      // 重置計時器
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(null), 1000);
      return next;
    });
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  /* ====== 加入草稿（財產每點一次就多一筆；非財產合併數量） ====== */
  const addDraftForProduct = (p: ProductItem) => {
    // 先顯示就地通知
    bumpToastForProduct(p);

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

  /* ====== 拖拉（維持你原本頁的行為；拖拉也會觸發通知） ====== */
  const onDragStart = (e: React.DragEvent, dragId: string) => {
    e.dataTransfer.setData("text/plain", dragId); // 'prod::<productId>'
  };
  const onDropToSelection = (e: React.DragEvent) => {
    e.preventDefault();
    const dragId = e.dataTransfer.getData("text/plain");
    if (!dragId?.startsWith("prod::")) return;
    const pid = dragId.slice(6);
    const p =
      pmList.find((x) => x.id === pid) || nonList.find((x) => x.id === pid);
    if (p) addDraftForProduct(p);
  };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  /* ====== 草稿操作 ====== */
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
    if (drafts.length === 0) return;
    setConfirmOpen(true);
  };

  /* ====== 送出到新 API /api/inventory/add ====== */
  const submitAll = async () => {
    if (drafts.length === 0) return;

    const pmPayload = drafts
      .filter((d) => d.product.isPropertyManaged)
      .map((d) => ({ productId: d.productId }));

    const nonPayload = drafts
      .filter((d) => !d.product.isPropertyManaged)
      .map((d) => ({ productId: d.productId, quantity: d.quantity }));

    const body = {
      PropertyManaged: pmPayload,
      nonPropertyManaged: nonPayload,
    };

    setPosting(true);
    try {
      const res = await fetch(ADD_STOCK_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false) {
        const errMsg =
          j?.errors
            ?.map((e: any) => `#${e.productId}: ${e.message}`)
            .join("；") ||
          j?.message ||
          `HTTP ${res.status}`;
        throw new Error(errMsg);
      }
      const totalAdded =
        j?.total ??
        pmPayload.length +
          nonPayload.reduce((a: number, r: any) => a + (r.quantity || 0), 0);
      setMessage(`${t.submitSuccess} (total: ${totalAdded})`);
      setDrafts([]);
      setConfirmOpen(false);
      setTimeout(() => setMessage(null), 1500);
    } catch (e: any) {
      setMessage(`${t.submitFailed} ${e?.message || e}`);
      setTimeout(() => setMessage(null), 2000);
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

  /* ====================== UI ====================== */

  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
        <PackagePlus className="h-7 w-7" aria-hidden="true" />
        <span>{t.title}</span>
      </h1>

      {(pmErr || nonErr) && (
        <div className="px-4 py-2 rounded bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
          {t.loadFailed}
          {pmErr ? ` (PM: ${String(pmErr)})` : ""}
          {nonErr ? ` (NonPM: ${String(nonErr)})` : ""}
        </div>
      )}

      {message && (
        <div className="px-4 py-2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          {message}
        </div>
      )}

      {/* 兩欄：PM / Non-PM */}
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
          <div className="grid gap-3 max-h-[420px] overflow-auto pr-1 relative">
            {pmLoading && (
              <div className="absolute right-1 -top-1 text-xs opacity-70">
                {t.loading}…
              </div>
            )}
            {pmList.length === 0 && !pmLoading && (
              <div className="text-sm text-gray-500">{t.noMatches}</div>
            )}
            {pmList.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => onDragStart(e, `prod::${p.id}`)}
                className="relative p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm transition flex items-start gap-3"
              >
                {/* 🔔 就地通知：只在這張卡片上方顯示 */}
                {toast && toast.productId === p.id && (
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-20 px-2 py-1 rounded-full text-xs font-medium bg-indigo-600 text-white shadow-md pointer-events-none"
                    role="status"
                    aria-live="polite"
                  >
                    {t.quickAdded } {toast.text}
                    {toast.count > 1 ? ` × ${toast.count}` : ""}
                  </div>
                )}

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

          {/* 分頁器（PM） */}
          <div className="mt-3 flex items-center justify-between text-sm">
            <div className="text-gray-600 dark:text-gray-300">
              {pmTotal !== null
                ? `${t.pager.perPage} ${pmPageSize}, ${t.pager.total} ${pmTotal}`
                : `${t.pager.perPage} ${PAGE_SIZE}`}
            </div>
            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                onClick={() => setPmPage(1)}
                disabled={pmPage === 1 || pmPageCount === null}
                title={t.pager.first}
              >
                «
              </button>
              <button
                type="button"
                className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                onClick={() => setPmPage((p) => Math.max(1, p - 1))}
                disabled={pmPage === 1}
                title={t.pager.prev}
              >
                ‹
              </button>
              <span className="tabular-nums">
                {pmPage} / {pmTotalPagesDisp}
              </span>
              <button
                type="button"
                className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                onClick={() =>
                  setPmPage((p) =>
                    pmPageCount ? Math.min(pmPageCount, p + 1) : p + 1
                  )
                }
                disabled={pmPageCount ? pmPage >= pmPageCount : false}
                title={t.pager.next}
              >
                ›
              </button>
              <button
                type="button"
                className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                onClick={() => pmPageCount && setPmPage(pmPageCount)}
                disabled={!pmPageCount || pmPage === pmPageCount}
                title={t.pager.last}
              >
                »
              </button>
            </div>
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
          <div className="grid gap-3 max-h-[420px] overflow-auto pr-1 relative">
            {nonLoading && (
              <div className="absolute right-1 -top-1 text-xs opacity-70">
                {t.loading}…
              </div>
            )}
            {nonList.length === 0 && !nonLoading && (
              <div className="text-sm text-gray-500">{t.noMatches}</div>
            )}
            {nonList.map((p) => (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => onDragStart(e, `prod::${p.id}`)}
                className="relative p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm transition flex items-start gap-3"
              >
                {/* 🔔 就地通知：非財產區塊也支援 */}
                {toast && toast.productId === p.id && (
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-20 px-2 py-1 rounded-full text-xs font-medium bg-indigo-600 text-white shadow-md pointer-events-none"
                    role="status"
                    aria-live="polite"
                  >
                    {t.quickAdded } {toast.text}
                    {toast.count > 1 ? ` × ${toast.count}` : ""}
                  </div>
                )}

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

          {/* 分頁器（NonPM） */}
          <div className="mt-3 flex items-center justify-between text-sm">
            <div className="text-gray-600 dark:text-gray-300">
              {nonTotal !== null
                ? `${t.pager.perPage} ${nonPageSize}, ${t.pager.total} ${nonTotal}`
                : `${t.pager.perPage} ${PAGE_SIZE}`}
            </div>
            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                onClick={() => setNonPage(1)}
                disabled={nonPage === 1 || nonPageCount === null}
                title={t.pager.first}
              >
                «
              </button>
              <button
                type="button"
                className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                onClick={() => setNonPage((p) => Math.max(1, p - 1))}
                disabled={nonPage === 1}
                title={t.pager.prev}
              >
                ‹
              </button>
              <span className="tabular-nums">
                {nonPage} / {nonTotalPagesDisp}
              </span>
              <button
                type="button"
                className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                onClick={() =>
                  setNonPage((p) =>
                    nonPageCount ? Math.min(nonPageCount, p + 1) : p + 1
                  )
                }
                disabled={nonPageCount ? nonPage >= nonPageCount : false}
                title={t.pager.next}
              >
                ›
              </button>
              <button
                type="button"
                className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                onClick={() => nonPageCount && setNonPage(nonPageCount)}
                disabled={!nonPageCount || nonPage === nonPageCount}
                title={t.pager.last}
              >
                »
              </button>
            </div>
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
              <h3 className="text-lg font-semibold">{t.confirmTitle}</h3>
              <button
                className="text-gray-500 hover:underline"
                onClick={() => !posting && setConfirmOpen(false)}
                disabled={posting}
              >
                {t.cancel}
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
                {t.backToEdit}
              </button>
              <button
                className="px-3 py-2 rounded bg-indigo-600 text-white disabled:opacity-60"
                onClick={submitAll}
                disabled={posting || drafts.length === 0}
              >
                {posting ? t.submitting : t.confirmAdd}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
