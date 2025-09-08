// features/Discarded.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Archive, Package } from "lucide-react";
import { fetcher } from "@/services/apiClient";

// ✅ i18n
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

type IAMSMap = { stockid: string; IAMSID: string };
// 抽出數字，讓 4031-4040-30020267、IAMS4031404030020267 都能比對
const digits = (s?: string) => (s ? s.replace(/\D+/g, "") : "");

type BulkStatus = "in_stock" | "long_term";

type PMItem = {
  stockId: string;
  product: { id: string; name: string; model: string; brand: string };
  locationId: string;
  locationPath: string[];
  currentStatus: BulkStatus;
};

type NonPMGroup = {
  productId: string;
  product: { id: string; name: string; model: string; brand: string };
  locationId: string;
  locationPath: string[];
  quantity: number; // available at source
  currentStatus: BulkStatus;
};

type GetResp = {
  propertyManaged: PMItem[];
  nonPropertyManaged: NonPMGroup[];
};

type CartPM = { type: "pm"; stockId: string };
type CartNonPM = {
  type: "non";
  productId: string;
  locationId: string;
  currentStatus: BulkStatus;
  quantity: number;
  max: number;
};
type CartItem = CartPM | CartNonPM;

export default function DiscardedModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {

  const { data: iamsData } = useSWR<IAMSMap[]>("/api/iams", fetcher);
  const iamsByStock = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of iamsData ?? []) {
      if (r?.stockid && r?.IAMSID) m.set(r.stockid, r.IAMSID);
    }
    return m;
  }, [iamsData]);

  const { data, error } = useSWR<GetResp>("/api/discarded", fetcher, {
    revalidateOnFocus: true,
  });

  // ✅ i18n mapping
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const t = (tMap[language] || zhTW).DiscardedModal;

  const [message, setMessage] = useState<string | null>(null);
  const [searchPM, setSearchPM] = useState("");
  const [searchNon, setSearchNon] = useState("");

  // 狀態篩選（多選）
  const AVAILABLE: BulkStatus[] = ["in_stock", "long_term"];
  const [selectedStatuses, setSelectedStatuses] = useState<BulkStatus[]>([
    "in_stock",
    "long_term",
  ]);
  const toggleStatus = (st: BulkStatus) =>
    setSelectedStatuses((arr) =>
      arr.includes(st) ? arr.filter((x) => x !== st) : [...arr, st]
    );

  // ====== 來源清單處理 ======
  const allPM = data?.propertyManaged ?? [];
  const allNon = data?.nonPropertyManaged ?? [];

  // 依狀態與搜尋過濾（PM）
  const pmList = useMemo(() => {
    const base = allPM.filter((i) => selectedStatuses.includes(i.currentStatus));
    const q = searchPM.trim().toLowerCase();
    if (!q) return base;

    const qDigits = digits(q);

    return base.filter((i) => {
      const baseHit = [
        i.stockId,
        i.product.name,
        i.product.model,
        i.product.brand,
        i.locationPath.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);

      const iamssid = iamsByStock.get(i.stockId) || "";
      const iamsHit =
        (iamssid && iamssid.toLowerCase().includes(q)) ||
        (!!qDigits && digits(iamssid).includes(qDigits));

      // 額外允許用純數字比對 stockId（若你的 ID 也有數字）
      const idDigitsHit = !!qDigits && digits(i.stockId).includes(qDigits);

      return baseHit || iamsHit || idDigitsHit;
    });
  }, [allPM, selectedStatuses, searchPM, iamsByStock]);


  // 依狀態與搜尋過濾（Non-PM）
  const nonList = useMemo(() => {
    const base = allNon.filter((g) => selectedStatuses.includes(g.currentStatus));
    if (!searchNon.trim()) return base;
    const q = searchNon.trim().toLowerCase();
    return base.filter((g) =>
      [
        g.productId,
        g.product.name,
        g.product.model,
        g.product.brand,
        g.locationPath.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [allNon, selectedStatuses, searchNon]);

  // ====== 選擇區 ======
  const [cart, setCart] = useState<CartItem[]>([]);

  // 後端資料變動時，校正非財 cart 的 max/quantity
  useEffect(() => {
    if (!data) return;
    setCart((prev) => {
      let changed = false;
      const next = prev.map((c) => {
        if (c.type === "non") {
          const n = c as CartNonPM;
          const newMax = getCap(n.productId, n.locationId, n.currentStatus);
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
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const addPM = (stockId: string) =>
    setCart((prev) =>
      prev.some((x) => x.type === "pm" && x.stockId === stockId)
        ? prev
        : [...prev, { type: "pm", stockId }]
    );

  const addNon = (productId: string, locationId: string, currentStatus: BulkStatus) =>
    setCart((prev) => {
      const idx = prev.findIndex(
        (x) =>
          x.type === "non" &&
          (x as CartNonPM).productId === productId &&
          (x as CartNonPM).locationId === locationId &&
          (x as CartNonPM).currentStatus === currentStatus
      );
      const cap = getCap(productId, locationId, currentStatus);
      if (cap <= 0) return prev;
      if (idx >= 0) {
        const cur = prev[idx] as CartNonPM;
        if (cur.quantity >= cur.max) return prev;
        const next = [...prev];
        next[idx] = { ...cur, quantity: Math.min(cur.quantity + 1, cap), max: cap };
        return next;
      }
      return [
        ...prev,
        {
          type: "non",
          productId,
          locationId,
          currentStatus,
          quantity: 1,
          max: cap,
        } as CartNonPM,
      ];
    });

  // 取得目前 cap（防止後端資料更新後超量）
  const getCap = (productId: string, locationId: string, currentStatus: BulkStatus) => {
    const row = allNon.find(
      (g) =>
        g.productId === productId &&
        g.locationId === locationId &&
        g.currentStatus === currentStatus
    );
    return row?.quantity ?? 0;
  };

  // === PM 已加入集合（避免重複顯示） ===
  const cartPMSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of cart) if (c.type === "pm") s.add((c as CartPM).stockId);
    return s;
  }, [cart]);

  // === Non-PM 已加入數量對照表 key=productId::locationId::status ===
  const cartNonUsedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cart) {
      if (c.type === "non") {
        const n = c as CartNonPM;
        const key = `${n.productId}::${n.locationId}::${n.currentStatus}`;
        m.set(key, (m.get(key) ?? 0) + n.quantity);
      }
    }
    return m;
  }, [cart]);

  // === PM 顯示清單（移除已加入的） ===
  const pmListDisplay = useMemo(() => {
    return pmList.filter((i) => !cartPMSet.has(i.stockId));
  }, [pmList, cartPMSet]);

  // === Non 顯示清單（顯示剩餘數量，0 就不顯示） ===
  const nonListDisplay = useMemo(() => {
    return nonList
      .map((g) => {
        const key = `${g.productId}::${g.locationId}::${g.currentStatus}`;
        const used = cartNonUsedMap.get(key) ?? 0;
        const remaining = Math.max(0, g.quantity - used);
        return { ...g, remaining };
      })
      .filter((g) => g.remaining > 0);
  }, [nonList, cartNonUsedMap]);

  // 簡易拖拉
  const onDragStart = (e: React.DragEvent, dragId: string) =>
    e.dataTransfer.setData("text/plain", dragId);
  const onDropToSelection = (e: React.DragEvent) => {
    e.preventDefault();
    const dragId = e.dataTransfer.getData("text/plain");
    if (!dragId) return;
    if (dragId.startsWith("pm::")) {
      addPM(dragId.slice(4));
    } else if (dragId.startsWith("non::")) {
      const [, productId, locationId, st] = dragId.split("::");
      addNon(productId, locationId, st as BulkStatus);
    }
  };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();

  // 原因/經辦 + 送出
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

  const buildPayload = () => {
    const items: Array<
      | { stockId: string }
      | { productId: string; locationId: string; currentStatus: BulkStatus; quantity: number }
    > = [];
    for (const c of cart) {
      if (c.type === "pm") {
        items.push({ stockId: (c as CartPM).stockId });
      } else {
        const n = c as CartNonPM;
        if (n.quantity > 0) {
          items.push({
            productId: n.productId,
            locationId: n.locationId,
            currentStatus: n.currentStatus,
            quantity: n.quantity,
          });
        }
      }
    }
    return { reason: reason.trim(), operator: operator.trim(), items };
  };

  const doSubmit = async () => {
    setPosting(true);
    try {
      const res = await fetch("/api/discarded", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);

      setMessage(t.submitSuccess);
      setCart([]);
      setReason("");
      setOperator("");
      setConfirmOpen(false);
    } catch (e: any) {
      setMessage(`${t.submitFailed} ${(e?.message || e) as string}`);
      setTimeout(() => {
        setMessage(null);
      }, 500);
    } finally {
      setPosting(false);
    }
  };

  const prettyStatus = (st: BulkStatus) => (st === "in_stock" ? t.statusInStock : t.statusLongTerm);

  if (!isOpen) return null;

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
          <h2 className="text-xl font-semibold">🗑️ {t.title}</h2>
          <button onClick={onClose} className="text-red-500 hover:underline">
            {t.close}
          </button>
        </div>

        {error && (
          <div className="p-6 text-red-600">
            {t.loadFailed}: {(error as Error).message}
          </div>
        )}
        {!data && !error && <div className="p-6 text-gray-600">{t.loading}</div>}

        {data && (
          <div className="p-6 space-y-6 flex-1 overflow-y-auto">
            {message && (
              <div
                role="alert"
                className="px-4 py-2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
              >
                {message}
              </div>
            )}

            {/* 狀態篩選 */}
            <section className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {t.filterStatusLabel}
                </span>
                {AVAILABLE.map((st) => {
                  const active = selectedStatuses.includes(st);
                  return (
                    <button
                      key={st}
                      className={`px-3 py-1 rounded-full border text-sm ${
                        active
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-700"
                      }`}
                      onClick={() => toggleStatus(st)}
                      title={t.statusTooltip}
                    >
                      {st === "in_stock" ? t.statusInStock : t.statusLongTerm}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 兩欄：PM / NonPM */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* PM（逐一） */}
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
                        <div className="text-sm font-medium">{s.product.name}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          {t.model} <span className="text-red-600 dark:text-red-200"> {s.product.model} </span>・{t.brand} {s.product.brand}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          ID: <span className="text-blue-600 dark:text-blue-200"><code>{s.stockId}</code></span>
                        </div>
                        {/* ✅ 新增：IAMS（有才顯示） */}
                        {iamsByStock.get(s.stockId) && (
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            IAMS:{" "}
                            <span className="font-mono text-purple-700 dark:text-purple-300">
                              {iamsByStock.get(s.stockId)}
                            </span>
                          </div>
                        )}
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {s.locationPath.join(" → ")}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {t.statusLabel} {s.currentStatus === "in_stock" ? t.statusInStock : t.statusLongTerm}
                        </div>
                      </div>
                      <button
                        className="px-2 py-1 text-xs rounded bg-indigo-600 text-white"
                        onClick={() => addPM(s.stockId)}
                      >
                        {t.add}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Non-PM（聚合） */}
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
                      key={`${g.productId}::${g.locationId}::${g.currentStatus}`}
                      draggable
                      onDragStart={(e) =>
                        onDragStart(
                          e,
                          `non::${g.productId}::${g.locationId}::${g.currentStatus}`
                        )
                      }
                      className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm transition flex items-start gap-3"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium">{g.product.name}</div>
                          <div className="text-sm text-gray-600 dark:text-gray-300">
                            {t.model} <span className="text-red-600 dark:text-red-200"> {g.product.model} </span>・{t.brand} {g.product.brand}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-300">{t.availableQty}: <span className="text-red-600 dark:text-red-200">{g.remaining}</span></div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {g.locationPath.join(" → ")}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400">
                            {t.statusLabel} {(g.currentStatus === "in_stock" ? t.statusInStock : t.statusLongTerm)}     
                          </div>
                      </div>
                      <button
                        className="ml-3 px-2 py-1 text-xs rounded bg-indigo-600 text-white"
                        onClick={() => addNon(g.productId, g.locationId, g.currentStatus)}
                      >
                        {t.add}
                      </button>
                    </div>
                  ))}
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
                            const src = allPM.find(pm => pm.stockId === id);
                            return (
                              <>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium truncate text-blue-600 dark:text-blue-200">
                                    #{id}
                                    <span className="text-gray-600 dark:text-gray-300">                                    
                                      {src && (
                                      <> — {src.product.name}
                                      {/* IAMS（PM） */}
                                      {(() => {
                                        const iamssid = iamsByStock.get(id);
                                        if (!iamssid) return null;
                                        return (
                                          <div className="text-sm text-gray-600 dark:text-gray-300">
                                            IAMS:{" "}
                                            <span className="font-mono text-purple-700 dark:text-purple-300">
                                              {iamssid}
                                            </span>
                                          </div>
                                        );
                                      })()}
                                    <div className="text-red-600 dark:text-red-200">{src.product.model}
                                    <span className="text-gray-600 dark:text-gray-300">・{src.product.brand}</span>
                                    </div></>
                                    )}</span>
                                  </div>

                                  {/* 新增：狀態 + 路徑 */}
                                  {src && (
                                    <div className="text-xs text-gray-600 dark:text-gray-400">
                                      {prettyStatus(src.currentStatus)} · {src ? src.locationPath.join(" → ") : id}
                                    </div>
                                  )}
                                </div>

                                <button
                                  className="px-2 py-1 text-xs rounded bg-red-600 text-white"
                                  onClick={() =>
                                    setCart((prev) => prev.filter((_, i) => i !== idx))
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
                              g.productId === n.productId &&
                              g.locationId === n.locationId &&
                              g.currentStatus === n.currentStatus
                          );
                          return (
                            <div
                              key={`non-${idx}`}
                              className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">
                                  {src?.product.name}
                                </div>
                                <div className="text-sm font-medium truncate">
                                    <span className="text-red-600 dark:text-red-200">{src?.product.model}</span>・{src?.product.brand}
                                </div>
                                <div className="text-xs text-gray-600 dark:text-gray-400">
                                  {prettyStatus(n.currentStatus)} · {src?.locationPath.join(" → ") || n.locationId}
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
                                    const raw = parseInt(e.target.value || "1", 10);
                                    const val = Math.max(
                                      1,
                                      Math.min(n.max, isNaN(raw) ? 1 : raw)
                                    );
                                    setCart((prev) =>
                                      prev.map((x, i) =>
                                        i === idx
                                          ? ({ ...(x as CartNonPM), quantity: val } as CartItem)
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
                                  setCart((prev) => prev.filter((_, i) => i !== idx))
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
                  <label className="block text-sm mb-1">{t.operatorLabel}</label>
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
                  disabled={cart.length === 0 || !reason.trim() || !operator.trim()}
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
                      const src = allPM.find(pm => pm.stockId === id);
                      return (
                        <li key={`cpm-${i}`}>
                          <code>#{id}</code>
                          {src && (
                            <>                               
                              {/* ✅ 新增：確認彈窗也顯示 IAMS（PM） */}
                              {(() => {
                                const iamssid = iamsByStock.get(id);
                                return iamssid ? (
                                  <>
                                    {" · "}IAMS: <code>{iamssid} {"\n"}</code>
                                  </>
                                ) : null;
                              })()}
                              — {src.product.name}/{src.product.model}/{src.product.brand}
                              {" · "}{src.locationPath.join(" → ")}
                              {" · "}{t.status}{": "}{prettyStatus(src.currentStatus)}

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
                            g.productId === n.productId &&
                            g.locationId === n.locationId &&
                            g.currentStatus === n.currentStatus
                        );
                        return (
                          <li key={`cnon-${i}`}>
                            {src?.product.name}/{src?.product.model}/{src?.product.brand} ·{" "}
                            {src?.locationPath.join(" → ") || n.locationId} · {t.status}{": "}
                            {prettyStatus(n.currentStatus)} · {t.qty}{": "}
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
