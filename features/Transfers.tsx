//features\Transfers.tsx
"use client";

import React, { useMemo, useState } from "react";
import useSWR from "swr";
import { Archive, Package } from "lucide-react";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";
import { fetcher } from "@/services/apiClient";
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { LocationField } from "@/components/LocationField";

type IAMSMap = { stockid: string; IAMSID: string };

// 小工具：抽取數字
const digits = (s?: string) => (s ? s.replace(/\D+/g, "") : "");

type PMItem = {
  stockId: string;
  product: { id: string; name: string; model: string; brand: string };
  locationId: string;
  locationPath: string[];
};

type NonPMGroup = {
  productId: string;
  product: { id: string; name: string; model: string; brand: string };
  locationId: string;
  locationPath: string[];
  quantity: number;
};

type LocationNode = { id: string; label: string; children?: LocationNode[] };

type GetResp = {
  propertyManaged: PMItem[];
  nonPropertyManaged: NonPMGroup[];
  locations: LocationNode[];
};

// 轉移籃中的項目
type CartPM = {
  type: "pm";
  stockId: string;
  product: PMItem["product"];
  fromLocation: string;
  fromPath: string[];
  toLocation: string | "";
};

type CartNonPM = {
  type: "non";
  productId: string;
  product: NonPMGroup["product"];
  fromLocation: string;
  fromPath: string[];
  toLocation: string | "";
  quantity: number; // 要移動的數量
  maxQuantity: number; // 可移動上限（來源地可用數量）
};

type CartItem = CartPM | CartNonPM;

/** 把地點樹攤平成下拉清單可用的 {id, pathLabel} */
function flattenLocations(roots: LocationNode[]) {
  const list: { id: string; path: string[]; label: string; isLeaf: boolean }[] =
    [];
  const walk = (n: LocationNode, trail: string[]) => {
    const next = [...trail, n.label];
    const isLeaf = !n.children || n.children.length === 0;
    list.push({ id: n.id, path: next, label: next.join(" → "), isLeaf });
    n.children?.forEach((c) => walk(c, next));
  };
  roots.forEach((r) => walk(r, []));
  return list;
}

/** 可拖曳卡片 + 右側加入按鈕；拖拉把手獨立在左邊避免誤觸 */
function DraggableCard({
  id,
  children,
  onAdd,
}: {
  id: string;
  children: React.ReactNode;
  onAdd: () => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id });

  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const t = (tMap[language] || zhTW).TransfersModal;

  return (
    <div
      ref={setNodeRef}
      className="rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-700 p-3 shadow-sm flex items-start justify-between gap-3"
    >
      {/* drag handle */}
      <div
        className="shrink-0 mt-0.5 px-1 text-gray-400 cursor-grab active:cursor-grabbing select-none"
        aria-label="拖拉"
        {...listeners}
        {...attributes}
      >
        ⠿
      </div>

      <div className="flex-1 min-w-0">{children}</div>

      <button
        className="shrink-0 px-2 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-700 text-white"
        // 防止按鈕點擊被當成拖拉起手
        onPointerDownCapture={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onAdd();
        }}
      >
        {t.add}
      </button>
    </div>
  );
}

/** 轉移區（放置區） */
function DropZone({
  onDropId,
  children,
}: {
  onDropId: (dragId: string) => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "dropzone" });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-2 p-4 min-h-[140px] transition-colors ${
        isOver
          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
          : "border-dashed border-gray-300 dark:border-gray-700"
      }`}
    >
      {children}
    </div>
  );
}

export default function TransfersModal({
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

  const { data, error, mutate } = useSWR<GetResp>("/api/transfers", fetcher, {
    revalidateOnFocus: true,
  });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [searchPM, setSearchPM] = useState("");
  const [searchNon, setSearchNon] = useState("");

  // 全部項目共同目標地點
  const [globalTo, setGlobalTo] = useState<string>("");
  function applyGlobalTo(all = false) {
    if (!globalTo) return;
    setCart((prev) =>
      prev.map((item) => {
        if (all) {
          return { ...item, toLocation: globalTo } as CartItem;
        }
        if (!item.toLocation) {
          return { ...item, toLocation: globalTo } as CartItem;
        }
        return item;
      })
    );
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const flatLoc = useMemo(
    () => flattenLocations(data?.locations ?? []),
    [data?.locations]
  );
  const locLabel = (id: string) =>
    flatLoc.find((l) => l.id === id)?.label ?? "";

  // 來源清單（搜尋）
  const pmList = useMemo(() => {
    const list = data?.propertyManaged ?? [];
    const q = searchPM.trim().toLowerCase();
    if (!q) return list;

    const qDigits = digits(q);

    return list.filter((i) => {
      // 原本的文字比對（名稱/型號/品牌/路徑/stockId）
      const text = [
        i.stockId,
        i.product?.name,
        i.product?.model,
        i.product?.brand,
        i.locationPath?.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const textHit = text.includes(q);

      // IAMS 比對（對照 stockId → IAMSID）
      const iamssid = iamsByStock.get(i.stockId) || "";
      const iamssidLower = iamssid.toLowerCase();
      const iamsHit =
        (iamssidLower && iamssidLower.includes(q)) ||
        (!!qDigits && digits(iamssid).includes(qDigits));

      // 也順手做「純數字」比 stockId 的數字，以防你有把 stockId 做成含數字的 QR 格式
      const idDigitsHit = !!qDigits && digits(i.stockId).includes(qDigits);

      return textHit || iamsHit || idDigitsHit;
    });
  }, [data?.propertyManaged, searchPM, iamsByStock]);

  const nonList = useMemo(() => {
    const list = data?.nonPropertyManaged ?? [];
    if (!searchNon.trim()) return list;
    const q = searchNon.trim().toLowerCase();
    return list.filter((i) =>
      [
        i.productId,
        i.product.name,
        i.product.model,
        i.product.brand,
        i.locationPath.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [data?.nonPropertyManaged, searchNon]);

  // === 新增：PM 已加入集合（避免重複顯示） ===
  const cartPMSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of cart) if (c.type === "pm") s.add((c as CartPM).stockId);
    return s;
  }, [cart]);

  // === 新增：Non-PM 已加入數量對照表 key=productId::fromLocation ===
  const cartNonUsedMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cart) {
      if (c.type === "non") {
        const key = `${c.productId}::${c.fromLocation}`;
        m.set(key, (m.get(key) ?? 0) + (c as CartNonPM).quantity);
      }
    }
    return m;
  }, [cart]);

  // === 新增：PM 顯示清單（移除已加入的） ===
  const pmListDisplay = useMemo(() => {
    return pmList.filter((item) => !cartPMSet.has(item.stockId));
  }, [pmList, cartPMSet]);

  // === 新增：Non 顯示清單（顯示剩餘數量，0 就不顯示） ===
  const nonListDisplay = useMemo(() => {
    return nonList
      .map((item) => {
        const key = `${item.productId}::${item.locationId}`;
        const used = cartNonUsedMap.get(key) ?? 0;
        const remaining = Math.max(0, item.quantity - used);
        return { ...item, remaining };
      })
      .filter((item) => item.remaining > 0);
  }, [nonList, cartNonUsedMap]);

  /** 封裝：加入 PM 一筆（避免重複） */
  const addPmByStockId = (stockId: string) => {
    const src = (data?.propertyManaged ?? []).find(
      (i) => i.stockId === stockId
    );
    if (!src) return;
    setCart((prev) =>
      prev.some((x) => x.type === "pm" && x.stockId === stockId)
        ? prev
        : [
            ...prev,
            {
              type: "pm",
              stockId,
              product: src.product,
              fromLocation: src.locationId,
              fromPath: src.locationPath,
              toLocation: "",
            },
          ]
    );
  };

  /** 封裝：加入 Non-PM（同產品同來源累加，且不超過 cap） */
  const addNonByKey = (productId: string, fromLocation: string) => {
    const src = (data?.nonPropertyManaged ?? []).find(
      (i) => i.productId === productId && i.locationId === fromLocation
    );
    if (!src) return;
    setCart((prev) => {
      const idx = prev.findIndex(
        (x) =>
          x.type === "non" &&
          (x as CartNonPM).productId === productId &&
          (x as CartNonPM).fromLocation === fromLocation
      );
      if (idx >= 0) {
        const cur = prev[idx] as CartNonPM;
        if (cur.quantity >= cur.maxQuantity) return prev;
        const next = [...prev];
        next[idx] = {
          ...cur,
          quantity: Math.min(cur.quantity + 1, src.quantity),
          maxQuantity: src.quantity,
        };
        return next;
      } else {
        return [
          ...prev,
          {
            type: "non",
            productId,
            product: src.product,
            fromLocation,
            fromPath: src.locationPath,
            toLocation: "",
            quantity: 1,
            maxQuantity: src.quantity,
          } as CartNonPM,
        ];
      }
    });
  };

  // 拖曳結束 => 呼叫上面的 add helpers
  function handleDragEnd(event: any) {
    const { over, active } = event;
    if (!over || over.id !== "dropzone") return;
    const dragId: string = active.id;
    if (dragId.startsWith("pm::")) {
      addPmByStockId(dragId.slice(4));
    } else if (dragId.startsWith("non::")) {
      const [, productId, fromLocation] = dragId.split("::");
      addNonByKey(productId, fromLocation);
    }
  }

  // 檢查有效性（原樣）
  const validateCart = () => {
    if (cart.length === 0) return "請先加入要轉移的項目";

    for (const c of cart) {
      if (!c.toLocation) return "請為每筆選擇目標地點";
      if (c.toLocation === c.fromLocation) return "目標地點不可與來源相同";

      const leaf = flatLoc.find((l) => l.id === c.toLocation)?.isLeaf;
      if (!leaf) return "目標地點只能選擇結構最底層的節點";

      if (c.type === "non" && c.quantity < 1) return "數量不可小於 1";
    }

    const sumMap = new Map<string, { used: number; cap: number }>();
    for (const group of data?.nonPropertyManaged ?? []) {
      sumMap.set(`${group.productId}::${group.locationId}`, {
        used: 0,
        cap: group.quantity,
      });
    }
    for (const c of cart) {
      if (c.type === "non") {
        const key = `${c.productId}::${c.fromLocation}`;
        const rec = sumMap.get(key);
        if (!rec)
          return `來源不足（${c.product.name} @ ${locLabel(c.fromLocation)}）`;
        rec.used += c.quantity;
        if (rec.used > rec.cap)
          return `來源數量不足：${c.product.name}（要求 ${rec.used} > 可用 ${rec.cap}）`;
      }
    }
    return "";
  };

  // 產生送出的 payload（原樣）
  const buildPayload = () => {
    return cart.map((c) =>
      c.type === "pm"
        ? {
            stockId: c.stockId,
            fromLocation: c.fromLocation,
            toLocation: c.toLocation,
          }
        : {
            productId: c.productId,
            quantity: c.quantity,
            fromLocation: c.fromLocation,
            toLocation: c.toLocation,
          }
    );
  };

  const onConfirmExecute = async () => {
    const err = validateCart();
    if (err) {
      alert(err);
      return;
    }
    setPosting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      await mutate();
      setCart([]);
      setConfirmOpen(false);
      alert("轉移成功");
    } catch (e: any) {
      alert(`轉移失敗：${e.message || e}`);
    } finally {
      setPosting(false);
    }
  };

  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const t = (tMap[language] || zhTW).TransfersModal;

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
        <div className="flex items-center justify-between px-6 py-3 border-b dark:border-gray-700">
          <h2 className="text-xl font-semibold">📦 {t.title}</h2>
          <button onClick={onClose} className="text-red-500 hover:underline">
            {t.cancelButton}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-6 text-red-600">
              {t.loadFailed}: {(error as Error).message}
            </div>
          )}

          {!data && !error && (
            <div className="p-6 text-gray-600">{t.loading}</div>
          )}

          {data && (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              {/* 來源清單 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
                {/* 財產管理（逐一） */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-indigo-600" />
                      <h3 className="text-base font-semibold">
                        {t.propertyManagedItems}
                      </h3>
                    </div>
                    <input
                      className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700"
                      placeholder={t.searchPlaceholder}
                      value={searchPM}
                      onChange={(e) => setSearchPM(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-3 max-h-80 overflow-auto p-1 border rounded dark:border-gray-700">
                    {pmListDisplay.map((item) => (
                      <DraggableCard
                        key={item.stockId}
                        id={`pm::${item.stockId}`}
                        onAdd={() => addPmByStockId(item.stockId)}
                      >
                        <div className="text-sm font-medium">
                          {item.product.name}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          <span className="text-red-600 dark:text-red-200">
                            {" "}
                            {item.product.model}{" "}
                          </span>
                          ・{item.product.brand}
                        </div>
                        <div className="text-xs">
                          ID:{" "}
                          <span className="text-blue-600 dark:text-blue-200">
                            {item.stockId}
                          </span>
                        </div>

                        {/* 👇 新增這段：顯示 IAMSID（有才顯示） */}
                        {iamsByStock.get(item.stockId) && (
                          <div className="text-xs">
                            IAMS:{" "}
                            <span className="font-mono text-purple-600 dark:text-purple-300">
                              {iamsByStock.get(item.stockId)}
                            </span>
                          </div>
                        )}

                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {item.locationPath.join(" → ")}
                        </div>
                      </DraggableCard>
                    ))}
                    {pmListDisplay.length === 0 && (
                      <div className="text-sm text-gray-500">
                        {t.noItemsToMove}
                      </div>
                    )}
                  </div>
                </div>

                {/* 非財產（聚合） */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-indigo-600" />
                      <h3 className="text-base font-semibold">
                        {t.nonPropertyItems}
                      </h3>
                    </div>
                    <input
                      className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700"
                      placeholder={t.searchPlaceholder}
                      value={searchNon}
                      onChange={(e) => setSearchNon(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-3 max-h-80 overflow-auto p-1 border rounded dark:border-gray-700">
                    {nonListDisplay.map((item) => (
                      <DraggableCard
                        key={`${item.productId}::${item.locationId}`}
                        id={`non::${item.productId}::${item.locationId}`}
                        onAdd={() =>
                          addNonByKey(item.productId, item.locationId)
                        }
                      >
                        <div className="text-sm font-medium">
                          {item.product.name}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          <span className="text-red-600 dark:text-red-200">
                            {" "}
                            {item.product.model}{" "}
                          </span>
                          ・{item.product.brand}
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          {t.availableLabel}
                          <span className="text-red-600 dark:text-red-200">
                            {item.quantity}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {item.locationPath.join(" → ")}
                        </div>
                      </DraggableCard>
                    ))}
                    {nonListDisplay.length === 0 && (
                      <div className="text-sm text-gray-500">
                        {t.noItemsToMove}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 轉移區 */}
              <div className="px-6 pb-6">
                <h3 className="text-lg font-semibold mb-2">{t.transferZone}</h3>

                {/* 全部項目共同目標地點 */}
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <span className="text-sm">{t.globalTarget}</span>
                  <LocationField
                    value={globalTo}
                    onChange={setGlobalTo}
                    onlyLeaf
                    getLabelById={locLabel}
                  />
                  <button
                    className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm"
                    disabled={!globalTo || cart.length === 0}
                    onClick={() => applyGlobalTo(false)}
                    title={t.applyToUnset}
                  >
                    {t.applyToUnset}
                  </button>
                  <button
                    className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm disabled:opacity-50"
                    disabled={!globalTo || cart.length === 0}
                    onClick={() => applyGlobalTo(true)}
                    title={t.applyToAll}
                  >
                    {t.applyToAll}
                  </button>
                </div>

                <DropZone onDropId={() => {}}>
                  {cart.length === 0 ? (
                    <div className="text-sm text-gray-500">
                      {t.noItemsToMove}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cart.map((c, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-lg border bg-white dark:bg-gray-800 dark:border-gray-700 shadow-sm"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-blue-600 dark:text-blue-200 truncate">
                                {c.type === "pm"
                                  ? `#${(c as CartPM).stockId} — `
                                  : ""}
                                <span className="text-gray-600 dark:text-gray-300">
                                  {c.product.name}
                                </span>
                              </div>
                              {/* IAMS（PM） */}
                              {(() => {
                                const iamssid = iamsByStock.get(
                                  (c as CartPM).stockId
                                );
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
                              <div className="text-xs text-gray-600 dark:text-gray-300">
                                <span className="text-red-600 dark:text-red-200">
                                  {" "}
                                  {c.product.model}{" "}
                                </span>
                                ・{c.product.brand}
                              </div>
                              <div className="text-xs text-gray-500">
                                {t.from}
                                {c.fromPath.join(" → ")}
                              </div>
                            </div>

                            {c.type === "non" && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{t.quantity}</span>
                                <button
                                  className="px-2 py-1 rounded border dark:border-gray-700"
                                  onClick={() =>
                                    setCart((prev) =>
                                      prev.map((x, i) =>
                                        i === idx
                                          ? ({
                                              ...x,
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
                                  max={(c as CartNonPM).maxQuantity}
                                  value={(c as CartNonPM).quantity}
                                  onChange={(e) => {
                                    const val = Math.max(
                                      1,
                                      Math.min(
                                        (c as CartNonPM).maxQuantity,
                                        parseInt(e.target.value || "1", 10)
                                      )
                                    );
                                    setCart((prev) =>
                                      prev.map((x, i) =>
                                        i === idx
                                          ? ({
                                              ...x,
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
                                              ...x,
                                              quantity: Math.min(
                                                (x as CartNonPM).maxQuantity,
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
                                  / 最多 {(c as CartNonPM).maxQuantity}
                                </span>
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <span className="text-sm">
                                {t.targetLocationLabel}
                              </span>
                              <LocationField
                                value={c.toLocation}
                                onChange={(v) => {
                                  const next = v;
                                  setCart((prev) =>
                                    prev.map((x, i) =>
                                      i === idx
                                        ? ({
                                            ...x,
                                            toLocation: next,
                                          } as CartItem)
                                        : x
                                    )
                                  );
                                }}
                                onlyLeaf
                                getLabelById={locLabel}
                                // exclude={[c.fromLocation]} // 若你想禁止選同來源，可打開這行
                              />
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
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </DropZone>

                <div className="flex items-center justify-between mt-4">
                  <button
                    className="text-gray-500 hover:underline"
                    onClick={() => setCart([])}
                  >
                    {t.clearSelection}
                  </button>
                  <div className="space-x-3">
                    <button
                      className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
                      onClick={() => onClose()}
                    >
                      {t.cancel}
                    </button>
                    <button
                      className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                      disabled={cart.length === 0}
                      onClick={() => {
                        const err = validateCart();
                        if (err) {
                          alert(err);
                          return;
                        }
                        setConfirmOpen(true);
                      }}
                    >
                      {t.reviewChanges}
                    </button>
                  </div>
                </div>
              </div>
            </DndContext>
          )}
        </div>
      </div>

      {/* 確認對話框：顯示前後變化 */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl">
            <div className="px-6 py-4 border-b dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t.confirmTitle}</h3>
              <button
                className="text-gray-500 hover:underline"
                onClick={() => setConfirmOpen(false)}
              >
                {t.cancelButton}
              </button>
            </div>
            <div className="p-6 space-y-3 max-h-[60vh] overflow-auto">
              {cart.map((c, i) => (
                <div
                  key={i}
                  className="p-3 rounded border dark:border-gray-700"
                >
                  <div className="text-sm font-medium">
                    {c.type === "pm" ? `#${(c as CartPM).stockId} — ` : ""}
                    {c.product.name} {c.product.model}
                    {c.type === "non" ? ` × ${(c as CartNonPM).quantity}` : ""}
                  </div>
                  {(() => {
                    const iamssid = iamsByStock.get((c as CartPM).stockId);
                    return iamssid ? (
                      <div className="text-sm mt-1">
                        IAMS:{" "}
                        <code>
                          {iamssid} {"\n"}
                        </code>
                      </div>
                    ) : null;
                  })()}
                  <div className="text-xs mt-1">
                    {t.source}
                    {c.fromPath.join(" → ")}
                  </div>
                  <div className="text-xs">
                    {t.target}
                    {locLabel(c.toLocation || "")}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6 pt-0 flex items-center justify-end gap-3">
              <button
                className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
                onClick={() => setConfirmOpen(false)}
              >
                {t.backToEdit}
              </button>
              <button
                disabled={posting}
                onClick={onConfirmExecute}
                className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
              >
                {posting ? t.executing : t.confirmExecute}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
