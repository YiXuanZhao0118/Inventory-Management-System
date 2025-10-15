"use client";
import { Trash2 } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { Archive, Package } from "lucide-react";
import { useJson } from "@/hooks/useJson";
import { useLanguage } from "@/src/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

/* ========== 工具 ========== */
const qs = (o: Record<string, any>) =>
  "?" +
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
    )
    .join("&");

/* ========== 型別 ========== */
type ProductLite = { id: string; name: string; model: string; brand: string };

type PMApiItem = {
  stockId: string;
  product: ProductLite;
  locationId: string;
  locationPath: string[];
  currentStatus: "in_stock" | "short_term" | "long_term" | "discarded";
  iamsId?: string | null;
};

type NonApiItem = {
  product: ProductLite;
  locationId: string;
  locationPath: string[];
  quantity: number;
  currentStatus: "in_stock" | "short_term" | "long_term" | "discarded";
};

type PagedResp<T> = { items: T[] }; // 如需 total/page 可擴充

// 放入購物籃的型別（多存快照避免換頁不見）
type CartPM = {
  type: "pm";
  stockId: string;
  product?: ProductLite;
  locationPath?: string[];
  iamsId?: string | null;
};
type CartNonPM = {
  type: "non";
  productId: string;
  locationId: string;
  quantity: number;
  max: number;
  product?: ProductLite;
  locationPath?: string[];
};
type CartItem = CartPM | CartNonPM;

export default function DiscardedModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const PAGE_SIZE = 20;

  // i18n
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const t = (tMap[language] || zhTW).DiscardedModal;

  const [message, setMessage] = useState<string | null>(null);

  // 搜尋與分頁（左右獨立）
  const [searchPM, setSearchPM] = useState("");
  const [searchNon, setSearchNon] = useState("");
  const [pmPage, setPmPage] = useState(1);
  const [nonPage, setNonPage] = useState(1);

  useEffect(() => setPmPage(1), [searchPM]);
  useEffect(() => setNonPage(1), [searchNon]);

  // API Key（僅 in_stock）
  const pmKey = useMemo(
    () =>
      `/api/inventory/pm${qs({
        status: "in_stock",
        q: searchPM.trim(),
        page: pmPage,
        limit: PAGE_SIZE,
      })}`,
    [searchPM, pmPage]
  );
  const nonKey = useMemo(
    () =>
      `/api/inventory/nonpm${qs({
        status: "in_stock",
        q: searchNon.trim(),
        page: nonPage,
        limit: PAGE_SIZE,
      })}`,
    [searchNon, nonPage]
  );

  const { data: pmRes } = useJson<PagedResp<PMApiItem>>(pmKey);
  const { data: nonRes } = useJson<PagedResp<NonApiItem>>(nonKey);

  // IAMS map（顯示用）
  const iamsByStock = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of pmRes?.items ?? [])
      if (s.iamsId) m.set(s.stockId, s.iamsId);
    return m;
  }, [pmRes?.items]);

  const allPM = pmRes?.items ?? [];
  const allNon = nonRes?.items ?? [];

  /* ========== 選擇區（購物籃） ========== */
  const [cart, setCart] = useState<CartItem[]>([]);

  // Non-PM 若本頁有相同項目，更新 max；不在本頁就保留原 max
  useEffect(() => {
    setCart((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        if (c.type === "non") {
          const n = c as CartNonPM;
          const row = allNon.find(
            (g) => g.product.id === n.productId && g.locationId === n.locationId
          );
          if (!row) return c;
          const newMax = row.quantity;
          const newQty = Math.min(n.quantity, newMax);
          if (newMax !== n.max || newQty !== n.quantity) {
            changed = true;
            return { ...n, max: newMax, quantity: newQty };
          }
        }
        return c;
      });
      return changed ? next : prev;
    });
  }, [allNon]);

  // 加入 PM
  const addPMFromItem = (item: PMApiItem) =>
    setCart((prev) =>
      prev.some(
        (x) => x.type === "pm" && (x as CartPM).stockId === item.stockId
      )
        ? prev
        : [
            ...prev,
            {
              type: "pm",
              stockId: item.stockId,
              product: item.product,
              locationPath: item.locationPath,
              iamsId: item.iamsId ?? null,
            } as CartPM,
          ]
    );
  const addPMById = (stockId: string) => {
    const found = allPM.find((s) => s.stockId === stockId);
    if (found) return addPMFromItem(found);
    setCart((prev) =>
      prev.some((x) => x.type === "pm" && (x as CartPM).stockId === stockId)
        ? prev
        : [...prev, { type: "pm", stockId } as CartPM]
    );
  };

  // 加入 Non-PM
  const addNonFromItem = (g: NonApiItem) =>
    setCart((prev) => {
      const productId = g.product.id;
      const locationId = g.locationId;
      const idx = prev.findIndex(
        (x) =>
          x.type === "non" &&
          (x as CartNonPM).productId === productId &&
          (x as CartNonPM).locationId === locationId
      );
      const cap = g.quantity;
      if (cap <= 0) return prev;
      if (idx >= 0) {
        const cur = prev[idx] as CartNonPM;
        if (cur.quantity >= cur.max) return prev;
        const next = [...prev];
        next[idx] = {
          ...cur,
          quantity: Math.min(cur.quantity + 1, cap),
          max: cap,
          product: g.product,
          locationPath: g.locationPath,
        };
        return next;
      }
      return [
        ...prev,
        {
          type: "non",
          productId,
          locationId,
          quantity: 1,
          max: cap,
          product: g.product,
          locationPath: g.locationPath,
        } as CartNonPM,
      ];
    });
  const addNonByKeys = (productId: string, locationId: string) => {
    const found = allNon.find(
      (g) => g.product.id === productId && g.locationId === locationId
    );
    if (found) addNonFromItem(found);
  };

  // DnD
  const onDragStart = (e: React.DragEvent, dragId: string) =>
    e.dataTransfer.setData("text/plain", dragId);
  const onDropToSelection = (e: React.DragEvent) => {
    e.preventDefault();
    const dragId = e.dataTransfer.getData("text/plain");
    if (!dragId) return;
    if (dragId.startsWith("pm::")) addPMById(dragId.slice(4));
    else if (dragId.startsWith("non::")) {
      const [, productId, locationId] = dragId.split("::");
      addNonByKeys(productId, locationId);
    }
  };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  // 避免清單與購物籃重複
  const cartPMSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of cart) if (c.type === "pm") s.add((c as CartPM).stockId);
    return s;
  }, [cart]);
  const cartNonUsedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cart)
      if (c.type === "non") {
        const n = c as CartNonPM;
        const key = `${n.productId}::${n.locationId}`;
        m.set(key, (m.get(key) ?? 0) + n.quantity);
      }
    return m;
  }, [cart]);

  const pmListDisplay = useMemo(
    () => allPM.filter((i) => !cartPMSet.has(i.stockId)),
    [allPM, cartPMSet]
  );
  const nonListDisplay = useMemo(
    () =>
      allNon
        .map((g) => {
          const key = `${g.product.id}::${g.locationId}`;
          const used = cartNonUsedMap.get(key) ?? 0;
          const remaining = Math.max(0, g.quantity - used);
          return { ...g, remaining };
        })
        .filter((g) => g.remaining > 0),
    [allNon, cartNonUsedMap]
  );

  // 是否還有下一頁（簡易：本頁數量 == PAGE_SIZE）
  const pmHasNext = (pmRes?.items?.length ?? 0) === PAGE_SIZE;
  const nonHasNext = (nonRes?.items?.length ?? 0) === PAGE_SIZE;

  // 送出（reason / operator）
  const [reason, setReason] = useState("");
  const [operator, setOperator] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  const openConfirm = () => {
    setMessage(null);
    if (cart.length === 0) return setMessage(t.msgAddItemsFirst);
    if (!reason.trim() || !operator.trim())
      return setMessage(t.msgNeedReasonOperator);
    setConfirmOpen(true);
  };

  const buildPayloadV2 = () => {
    const pmRows = cart
      .filter((c) => c.type === "pm")
      .map((c) => ({ stockId: (c as CartPM).stockId }));
    const nonRows = cart
      .filter((c) => c.type === "non")
      .map((c) => ({
        ProductId: (c as CartNonPM).productId,
        LocationId: (c as CartNonPM).locationId,
        quantity: (c as CartNonPM).quantity,
      }));
    return {
      reason: reason.trim(),
      operator: operator.trim(),
      PropertyManaged: pmRows,
      nonPropertyManaged: nonRows,
    };
  };

  const doSubmit = async () => {
    setPosting(true);
    try {
      const res = await fetch("/api/inventory/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayloadV2()),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.ok === false)
        throw new Error(j?.message || `HTTP ${res.status}`);

      setMessage(t.submitSuccess);
      setCart([]);
      setReason("");
      setOperator("");
      setConfirmOpen(false);
    } catch (e: any) {
      setMessage(`${t.submitFailed} ${(e?.message || e) as string}`);
      setTimeout(() => setMessage(null), 600);
    } finally {
      setPosting(false);
    }
  };

  if (!isOpen) return null;

  // helper for頁碼文案
  const pageText = (page: number) =>
    String(t.pageIndicator)
      .replace("{page}", String(page))
      .replace("{pageSize}", String(PAGE_SIZE));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="w-full max-w-7xl h-[calc(100vh-2rem)] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white inline-flex items-center gap-2">
            <Trash2 className="w-6 h-6" aria-hidden="true" />
            {t.title}
          </h2>
          <button onClick={onClose} className="text-red-500 hover:underline">
            {t.close}
          </button>
        </div>

        {!pmRes && !nonRes && (
          <div className="p-6 text-gray-600">{t.loading}</div>
        )}

        {(pmRes || nonRes) && (
          <div className="p-6 space-y-6 flex-1 overflow-y-auto">
            {message && (
              <div
                role="alert"
                className="px-4 py-2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
              >
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
                    <h3 className="text-base font-semibold">{t.pmTitle}</h3>
                  </div>
                  <input
                    className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700"
                    placeholder={t.searchPlaceholder}
                    value={searchPM}
                    onChange={(e) => setSearchPM(e.target.value)}
                  />
                </div>

                <div className="grid gap-3 max-h-[420px] overflow-auto pr-1">
                  {pmListDisplay.length === 0 && (
                    <div className="text-sm text-gray-500">{t.noItems}</div>
                  )}
                  {pmListDisplay.map((s) => (
                    <div
                      key={s.stockId}
                      draggable
                      onDragStart={(e) => onDragStart(e, `pm::${s.stockId}`)}
                      className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm transition flex items-start gap-3"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {s.product.name}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          {t.model}{" "}
                          <span className="text-red-600 dark:text-red-200">
                            {s.product.model}
                          </span>
                          ・{t.brand} {s.product.brand}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {t.idLabel}:{" "}
                          <span className="text-blue-600 dark:text-blue-200">
                            <code>{s.stockId}</code>
                          </span>
                        </div>
                        {s.iamsId ? (
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {t.iamsLabel}:{" "}
                            <span className="font-mono text-purple-700 dark:text-purple-300">
                              {s.iamsId}
                            </span>
                          </div>
                        ) : null}
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {s.locationPath.join(" → ")}
                        </div>
                      </div>
                      <button
                        className="px-2 py-1 text-xs rounded bg-indigo-600 text-white"
                        onClick={() => addPMFromItem(s)}
                      >
                        {t.add}
                      </button>
                    </div>
                  ))}
                </div>

                {/* PM 分頁 */}
                <div className="mt-2 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                  <span>{pageText(pmPage)}</span>
                  <div className="inline-flex items-center gap-1">
                    <button
                      className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                      onClick={() => setPmPage(1)}
                      disabled={pmPage <= 1}
                      title={t.firstPage}
                    >
                      «
                    </button>
                    <button
                      className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                      onClick={() => setPmPage((p) => Math.max(1, p - 1))}
                      disabled={pmPage <= 1}
                      title={t.prevPage}
                    >
                      ‹
                    </button>
                    <button
                      className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                      onClick={() => setPmPage((p) => p + 1)}
                      disabled={!pmHasNext}
                      title={t.nextPage}
                    >
                      ›
                    </button>
                  </div>
                </div>
              </div>

              {/* Non-PM */}
              <div className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-base font-semibold">{t.nonPmTitle}</h3>
                  </div>
                  <input
                    className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700"
                    placeholder={t.searchPlaceholder}
                    value={searchNon}
                    onChange={(e) => setSearchNon(e.target.value)}
                  />
                </div>

                <div className="grid gap-3 max-h-[420px] overflow-auto pr-1">
                  {nonListDisplay.length === 0 && (
                    <div className="text-sm text-gray-500">{t.noItems}</div>
                  )}
                  {nonListDisplay.map((g) => (
                    <div
                      key={`${g.product.id}::${g.locationId}`}
                      draggable
                      onDragStart={(e) =>
                        onDragStart(e, `non::${g.product.id}::${g.locationId}`)
                      }
                      className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm transition flex items-start gap-3"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {g.product.name}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          {t.model}{" "}
                          <span className="text-red-600 dark:text-red-200">
                            {g.product.model}
                          </span>
                          ・{t.brand} {g.product.brand}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          {t.availableQty}:{" "}
                          <span className="text-red-600 dark:text-red-200">
                            {g.quantity -
                              (cartNonUsedMap.get(
                                `${g.product.id}::${g.locationId}`
                              ) ?? 0)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {g.locationPath.join(" → ")}
                        </div>
                      </div>
                      <button
                        className="ml-3 px-2 py-1 text-xs rounded bg-indigo-600 text-white"
                        onClick={() => addNonFromItem(g)}
                      >
                        {t.add}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Non-PM 分頁 */}
                <div className="mt-2 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                  <span>{pageText(nonPage)}</span>
                  <div className="inline-flex items-center gap-1">
                    <button
                      className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                      onClick={() => setNonPage(1)}
                      disabled={nonPage <= 1}
                      title={t.firstPage}
                    >
                      «
                    </button>
                    <button
                      className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                      onClick={() => setNonPage((p) => Math.max(1, p - 1))}
                      disabled={nonPage <= 1}
                      title={t.prevPage}
                    >
                      ‹
                    </button>
                    <button
                      className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                      onClick={() => setNonPage((p) => p + 1)}
                      disabled={!nonHasNext}
                      title={t.nextPage}
                    >
                      ›
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* 選擇區 */}
            <section className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-4">
              <h3 className="font-semibold text-lg">🧺 {t.selectionTitle}</h3>
              <div
                className="min-h-[160px] p-4 rounded-lg border-2 border-dashed dark:border-gray-700 bg-white dark:bg-gray-800"
                onDrop={onDropToSelection}
                onDragOver={onDragOver}
              >
                {cart.length === 0 ? (
                  <div className="text-center text-gray-500">
                    {t.selectionHint}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map((c, idx) =>
                      c.type === "pm" ? (
                        <div
                          key={`pm-${idx}`}
                          className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 flex items-start justify-between gap-3"
                        >
                          {(() => {
                            const id = (c as CartPM).stockId;
                            const src =
                              allPM.find((pm) => pm.stockId === id) || null;
                            const snap = c as CartPM;
                            const product = src?.product || snap.product;
                            const path =
                              src?.locationPath ||
                              snap.locationPath ||
                              ([] as string[]);
                            const iams =
                              src?.iamsId ||
                              snap.iamsId ||
                              iamsByStock.get(id) ||
                              null;

                            return (
                              <>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium truncate text-blue-600 dark:text-blue-200">
                                    #{id}
                                    {product && (
                                      <span className="text-gray-600 dark:text-gray-300">
                                        {" "}
                                        — {product.name}
                                      </span>
                                    )}
                                  </div>

                                  {iams ? (
                                    <div className="text-sm text-gray-600 dark:text-gray-300">
                                      {t.iamsLabel}:{" "}
                                      <span className="font-mono text-purple-700 dark:text-purple-300">
                                        {iams}
                                      </span>
                                    </div>
                                  ) : null}

                                  {product && (
                                    <div className="text-red-600 dark:text-red-200">
                                      {product.model}
                                      <span className="text-gray-600 dark:text-gray-300">
                                        ・{product.brand}
                                      </span>
                                    </div>
                                  )}
                                  {path.length > 0 && (
                                    <div className="text-xs text-gray-600 dark:text-gray-400">
                                      {path.join(" → ")}
                                    </div>
                                  )}
                                </div>

                                <button
                                  className="px-2 py-1 text-xs rounded bg-red-600 text-white"
                                  onClick={() =>
                                    setCart((prev) =>
                                      prev.filter((_, i) => i !== idx)
                                    )
                                  }
                                >
                                  {t.remove}
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        (() => {
                          const n = c as CartNonPM;
                          const src = allNon.find(
                            (g) =>
                              g.product.id === n.productId &&
                              g.locationId === n.locationId
                          );
                          const product = src?.product || n.product;
                          const path = src?.locationPath || n.locationPath;

                          return (
                            <div
                              key={`non-${idx}`}
                              className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">
                                  {product?.name || n.productId}
                                </div>
                                {product && (
                                  <div className="text-sm font-medium truncate">
                                    <span className="text-red-600 dark:text-red-200">
                                      {product.model}
                                    </span>
                                    ・{product.brand}
                                  </div>
                                )}
                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                  {(path && path.join(" → ")) || n.locationId}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-sm">{t.quantity}</span>
                                <button
                                  className="px-2 py-1 rounded border dark:border-gray-700"
                                  onClick={() =>
                                    setCart((prev) =>
                                      prev.map((x, i) =>
                                        i === idx
                                          ? ({
                                              ...(x as CartNonPM),
                                              quantity: Math.max(
                                                1,
                                                (x as CartNonPM).quantity - 1
                                              ),
                                            } as CartItem)
                                          : x
                                      )
                                    )
                                  }
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  className="w-16 px-2 py-1 border rounded text-center dark:bg-gray-900 dark:border-gray-700"
                                  min={1}
                                  max={n.max}
                                  value={n.quantity}
                                  onChange={(e) => {
                                    const raw = parseInt(
                                      e.target.value || "1",
                                      10
                                    );
                                    const val = Math.max(
                                      1,
                                      Math.min(n.max, isNaN(raw) ? 1 : raw)
                                    );
                                    setCart((prev) =>
                                      prev.map((x, i) =>
                                        i === idx
                                          ? ({
                                              ...(x as CartNonPM),
                                              quantity: val,
                                            } as CartItem)
                                          : x
                                      )
                                    );
                                  }}
                                />
                                <button
                                  className="px-2 py-1 rounded border dark:border-gray-700"
                                  onClick={() =>
                                    setCart((prev) =>
                                      prev.map((x, i) =>
                                        i === idx
                                          ? ({
                                              ...(x as CartNonPM),
                                              quantity: Math.min(
                                                (x as CartNonPM).max,
                                                (x as CartNonPM).quantity + 1
                                              ),
                                            } as CartItem)
                                          : x
                                      )
                                    )
                                  }
                                >
                                  ＋
                                </button>
                                <span className="text-xs text-gray-500">
                                  / {t.max} {n.max}
                                </span>
                              </div>

                              <button
                                className="px-2 py-1 text-xs rounded bg-red-600 text-white"
                                onClick={() =>
                                  setCart((prev) =>
                                    prev.filter((_, i) => i !== idx)
                                  )
                                }
                              >
                                {t.remove}
                              </button>
                            </div>
                          );
                        })()
                      )
                    )}
                  </div>
                )}
              </div>

              {/* reason / operator + actions */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-sm mb-1">{t.reasonLabel}</label>
                  <input
                    className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t.reasonPlaceholder}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1">
                    {t.operatorLabel}
                  </label>
                  <input
                    className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 dark:border-gray-700"
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    placeholder={t.operatorPlaceholder}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  className="text-gray-500 hover:underline"
                  onClick={() => setCart([])}
                >
                  {t.clearSelection}
                </button>
                <button
                  className="px-4 py-2 rounded bg-red-600 text-white disabled:opacity-60"
                  onClick={openConfirm}
                  disabled={
                    cart.length === 0 || !reason.trim() || !operator.trim()
                  }
                >
                  {t.discard}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* 確認彈窗 */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl p-5">
            <h3 className="text-lg font-semibold mb-3">{t.confirmTitle}</h3>
            <div className="space-y-4 max-h-[60vh] overflow-auto pr-1 text-sm">
              <div className="p-3 rounded-lg border dark:border-gray-700">
                <div className="font-medium mb-2">{t.confirmPMTitle}</div>
                {cart.filter((c) => c.type === "pm").length === 0 ? (
                  <div className="text-gray-500">{t.none}</div>
                ) : (
                  <ul className="list-disc pl-5 space-y-1">
                    {cart
                      .filter((c) => c.type === "pm")
                      .map((c, i) => {
                        const id = (c as CartPM).stockId;
                        const src = allPM.find((pm) => pm.stockId === id);
                        const snap = c as CartPM;
                        const product = src?.product || snap.product;
                        const path = src?.locationPath || snap.locationPath;
                        const iams =
                          src?.iamsId ||
                          snap.iamsId ||
                          iamsByStock.get(id) ||
                          null;

                        return (
                          <li key={`cpm-${i}`}>
                            <code>#{id}</code>
                            {iams ? (
                              <>
                                {" · "}
                                {t.iamsLabel}: <code>{iams}</code>
                              </>
                            ) : null}
                            {product ? (
                              <>
                                {" — "}
                                {product.name}/{product.model}/{product.brand}
                              </>
                            ) : null}
                            {path && path.length > 0 ? (
                              <> · {path.join(" → ")}</>
                            ) : null}
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>

              <div className="p-3 rounded-lg border dark:border-gray-700">
                <div className="font-medium mb-2">{t.confirmNonPMTitle}</div>
                {cart.filter((c) => c.type === "non").length === 0 ? (
                  <div className="text-gray-500">{t.none}</div>
                ) : (
                  <ul className="list-disc pl-5 space-y-1">
                    {cart
                      .filter((c) => c.type === "non")
                      .map((c, i) => {
                        const n = c as CartNonPM;
                        const src = allNon.find(
                          (g) =>
                            g.product.id === n.productId &&
                            g.locationId === n.locationId
                        );
                        const product = src?.product || n.product;
                        const path = src?.locationPath || n.locationPath;

                        return (
                          <li key={`cnon-${i}`}>
                            {product
                              ? `${product.name}/${product.model}/${product.brand}`
                              : `${n.productId}`}{" "}
                            · {(path && path.join(" → ")) || n.locationId} ·{" "}
                            {t.qty}
                            {": "}
                            <b>{n.quantity}</b> ({t.max} {n.max})
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>

              <div className="p-3 rounded-lg border dark:border-gray-700">
                <div>
                  <b>{t.reasonLabel}：</b> {reason}
                </div>
                <div>
                  <b>{t.operatorLabel}：</b> {operator}
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
                className="px-3 py-2 rounded bg-red-600 text-white disabled:opacity-60"
                onClick={doSubmit}
                disabled={posting}
              >
                {posting ? t.submitting : t.confirmDiscard}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
