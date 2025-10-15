// features/Transfers.tsx
"use client";
import React, { useMemo, useState, useEffect, useCallback } from "react";
import { ArrowLeftRight, Archive, Package } from "lucide-react";
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { useJson } from "@/hooks/useJson";
import { useLanguage } from "@/src/components/LanguageSwitcher";

import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

/* =================== Utils =================== */
const qs = (o: Record<string, any>) =>
  "?" +
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
    )
    .join("&");

const debounce = <F extends (...a: any[]) => void>(fn: F, ms = 250) => {
  let t: any;
  return (...args: Parameters<F>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

const format = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

/* =================== Types =================== */
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
type PagedResp<T> = {
  items: T[];
  total?: number;
  page?: number;
  pageSize?: number;
};

type LocationNode = { id: string; label: string; children?: LocationNode[] };

type GetResp = {
  propertyManaged: Array<{
    stockId: string;
    product: ProductLite;
    locationId: string;
    locationPath: string[];
    iamsId?: string | null;
  }>;
  nonPropertyManaged: Array<{
    productId: string;
    product: ProductLite;
    locationId: string;
    locationPath: string[];
    quantity: number;
  }>;
  locations: LocationNode[];
};

// Cart
type CartPM = {
  type: "pm";
  stockId: string;
  product: ProductLite;
  fromLocation: string;
  fromPath: string[];
  toLocation: string | "";
  iamsId?: string | null;
};
type CartNonPM = {
  type: "non";
  productId: string;
  product: ProductLite;
  fromLocation: string;
  fromPath: string[];
  toLocation: string | "";
  quantity: number;
  maxQuantity: number;
};
type CartItem = CartPM | CartNonPM;

/* =================== Small UI =================== */
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
      <div
        className="shrink-0 mt-0.5 px-1 text-gray-400 cursor-grab active:cursor-grabbing select-none"
        aria-label="drag"
        {...listeners}
        {...attributes}
      >
        ⠿
      </div>
      <div className="flex-1 min-w-0">{children}</div>
      <button
        className="shrink-0 px-2 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-700 text-white"
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

function DropZone({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: "dropzone" });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[160px] p-4 rounded-lg border-2 border-dashed dark:border-gray-700 bg-white dark:bg-gray-800 ${
        isOver
          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
          : "border-dashed border-gray-300 dark:border-gray-700"
      }`}
    >
      {children}
    </div>
  );
}

function TreeLocationSelect({
  value,
  onChange,
  roots,
  placeholder,
  disabled,
  widthClass = "w-72",
}: {
  value: string;
  onChange: (v: string) => void;
  roots: LocationNode[]; // ← 用 locations 樹
  placeholder: string;
  disabled?: boolean;
  widthClass?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const rootRef = React.useRef<HTMLDivElement>(null); // ← 新增

  // 建 parent/children map & 找到 label 與是否 leaf
  const { byId, parentOf, isLeaf, fullLabel } = React.useMemo(() => {
    const byId = new Map<string, LocationNode>();
    const parentOf = new Map<string, string | null>();
    const isLeaf = new Map<string, boolean>();

    const walk = (n: LocationNode, parent: string | null) => {
      byId.set(n.id, n);
      parentOf.set(n.id, parent);
      const leaf = !n.children || n.children.length === 0;
      isLeaf.set(n.id, leaf);
      n.children?.forEach((c) => walk(c, n.id));
    };
    roots.forEach((r) => walk(r, null));

    const fullLabel = (id: string) => {
      if (!id || !byId.has(id)) return "";
      const path: string[] = [];
      let cur: string | null = id;
      while (cur) {
        const node = byId.get(cur)!;
        path.push(node.label);
        cur = parentOf.get(cur) ?? null;
      }
      return path.reverse().join(" → ");
    };

    return { byId, parentOf, isLeaf, fullLabel };
  }, [roots]);

  // 預設展開目前選取節點的祖先
  React.useEffect(() => {
    if (!value) return;
    const set = new Set<string>();
    let cur: string | null = value;
    while (cur) {
      set.add(cur);
      cur = (parentOf.get(cur) as string | null) ?? null;
    }
    setExpanded(set);
  }, [value, parentOf]);

  // 搜尋：顯示符合的節點與其祖先
  const q = query.trim().toLowerCase();
  const matches = React.useMemo(() => {
    if (!q) return new Set<string>();
    const hit = new Set<string>();
    for (const [id, n] of byId.entries()) {
      if (n.label.toLowerCase().includes(q)) {
        // 命中自己與祖先
        let cur: string | null = id;
        while (cur) {
          hit.add(cur);
          cur = (parentOf.get(cur) as string | null) ?? null;
        }
      }
    }
    return hit;
  }, [q, byId, parentOf]);

  // 可見列（依展開狀態/搜尋自動展開）
  const visible = React.useMemo(() => {
    const rows: Array<{ id: string; depth: number }> = [];
    const walk = (n: LocationNode, depth: number) => {
      rows.push({ id: n.id, depth });
      const openThis = q ? matches.has(n.id) : expanded.has(n.id); // 搜尋時自動展開命中路徑
      if (openThis && n.children) {
        n.children.forEach((c) => walk(c, depth + 1));
      }
    };
    roots.forEach((r) => walk(r, 0));
    return rows;
  }, [roots, expanded, q, matches]);

  const toggle = (id: string) => {
    const node = byId.get(id);
    if (!node?.children || node.children.length === 0) return; // 葉不收展
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  // 🔒 點擊/聚焦到元件外就關閉（捕獲階段，避免被 DnD 攔截）
  React.useEffect(() => {
    const closeIfOutside = (ev: Event) => {
      const root = rootRef.current;
      const t = ev.target as Node | null;
      if (!root || !t) return;
      if (!root.contains(t)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", closeIfOutside, true);
    document.addEventListener("focusin", closeIfOutside, true);
    const onResize = () => setOpen(false);
    window.addEventListener("resize", onResize);

    return () => {
      document.removeEventListener("pointerdown", closeIfOutside, true);
      document.removeEventListener("focusin", closeIfOutside, true);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className={`relative ${widthClass}`}
      data-locselect-root
      aria-expanded={open}
    >
      <div className="flex gap-2 items-center">
        <input
          disabled={disabled}
          className="flex-1 min-w-0 w-full px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700 text-[14px] leading-tight"
          placeholder={placeholder}
          value={open ? query : fullLabel(value)}
          onFocus={() => setOpen(true)}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setQuery("");
            }
          }}
        />
        {value && (
          <button
            type="button"
            className="px-2 border rounded dark:border-gray-700"
            onClick={() => onChange("")}
            title="清除"
          >
            ✕
          </button>
        )}
      </div>

      {open && (
        <ul
          className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-white shadow-lg dark:bg-gray-900 dark:border-gray-700"
          role="listbox"
        >
          {visible.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-500">沒有符合的位置</li>
          ) : (
            visible.map(({ id, depth }) => {
              const node = byId.get(id)!;
              const leaf = isLeaf.get(id)!;
              const active = value === id;
              const isOpen =
                (node.children?.length ?? 0) > 0 &&
                (q ? matches.has(id) : expanded.has(id));

              return (
                <li
                  key={id}
                  className={`px-3 py-1.5 text-sm flex items-center gap-2 ${
                    active ? "bg-indigo-50 dark:bg-indigo-950/30" : ""
                  }`}
                  style={{ paddingLeft: 12 + depth * 14 }}
                  role="option"
                  aria-selected={active}
                  title={node.label}
                >
                  {/* 展開箭頭（僅非葉） */}
                  {node.children && node.children.length > 0 ? (
                    <button
                      type="button"
                      className="shrink-0 w-4 text-gray-500"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(id);
                      }}
                      aria-label={isOpen ? "collapse" : "expand"}
                    >
                      {isOpen ? "▾" : "▸"}
                    </button>
                  ) : (
                    <span className="shrink-0 w-4" />
                  )}

                  {/* 標籤（葉可選；夾點則切換展開） */}
                  <button
                    type="button"
                    className={`flex-1 text-left ${
                      leaf
                        ? "hover:underline"
                        : "text-gray-700 dark:text-gray-300"
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (leaf) {
                        onChange(id);
                        setOpen(false);
                        setQuery("");
                      } else {
                        toggle(id);
                      }
                    }}
                  >
                    {node.label}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

/* =================== Main =================== */
export default function TransfersModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const PAGE_SIZE = 20;
  const status = "in_stock";

  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const t = (tMap[language] || zhTW).TransfersModal;

  const [cart, setCart] = useState<CartItem[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [posting, setPosting] = useState(false);

  // searches (debounced)
  const [searchPMRaw, setSearchPMRaw] = useState("");
  const [searchNonRaw, setSearchNonRaw] = useState("");
  const [searchPM, setSearchPM] = useState("");
  const [searchNon, setSearchNon] = useState("");

  useEffect(() => {
    const d1 = debounce(setSearchPM, 250);
    d1(searchPMRaw);
    return () => d1("");
  }, [searchPMRaw]);

  useEffect(() => {
    const d2 = debounce(setSearchNon, 250);
    d2(searchNonRaw);
    return () => d2("");
  }, [searchNonRaw]);

  const [globalTo, setGlobalTo] = useState<string>("");

  // paging
  const [pmPage, setPmPage] = useState(1);
  const [nonPage, setNonPage] = useState(1);

  useEffect(() => setPmPage(1), [searchPM]);
  useEffect(() => setNonPage(1), [searchNon]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // fetch lists (server paging)
  const pmKey = useMemo(
    () =>
      `/api/inventory/pm${qs({
        status,
        q: searchPM.trim(),
        page: pmPage,
        limit: PAGE_SIZE,
      })}`,
    [status, searchPM, pmPage]
  );
  const nonKey = useMemo(
    () =>
      `/api/inventory/nonpm${qs({
        status,
        q: searchNon.trim(),
        page: nonPage,
        limit: PAGE_SIZE,
      })}`,
    [status, searchNon, nonPage]
  );

  const {
    data: pmRes,
    error: pmErr,
    refetch: refetchPm,
  } = useJson<PagedResp<PMApiItem>>(pmKey);
  const {
    data: nonRes,
    error: nonErr,
    refetch: refetchNon,
  } = useJson<PagedResp<NonApiItem>>(nonKey);
  const { data: locRes, error: locErr } = useJson<{ tree: LocationNode[] }>(
    "/api/locations/tree"
  );

  const iamsByStock = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of pmRes?.items ?? [])
      if (s.iamsId) m.set(s.stockId, s.iamsId);
    return m;
  }, [pmRes?.items]);

  const data: GetResp | undefined = useMemo(() => {
    if (!pmRes || !nonRes || !locRes) return undefined;
    return {
      propertyManaged: (pmRes.items ?? []).map((s) => ({
        stockId: s.stockId,
        product: s.product,
        locationId: s.locationId,
        locationPath: s.locationPath,
        iamsId: s.iamsId ?? null,
      })),
      nonPropertyManaged: (nonRes.items ?? []).map((g) => ({
        productId: g.product.id,
        product: g.product,
        locationId: g.locationId,
        locationPath: g.locationPath,
        quantity: g.quantity,
      })),
      locations: locRes.tree ?? [],
    };
  }, [pmRes, nonRes, locRes]);

  const flatLoc = useMemo(
    () => flattenLocations(data?.locations ?? []),
    [data?.locations]
  );
  const locLabel = (id: string) =>
    flatLoc.find((l) => l.id === id)?.label ?? "";

  const pmList = useMemo(
    () => data?.propertyManaged ?? [],
    [data?.propertyManaged]
  );
  const nonList = useMemo(
    () => data?.nonPropertyManaged ?? [],
    [data?.nonPropertyManaged]
  );

  const cartPMSet = useMemo(() => {
    const s = new Set<string>();
    for (const c of cart) if (c.type === "pm") s.add((c as CartPM).stockId);
    return s;
  }, [cart]);

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

  const pmListDisplay = useMemo(
    () => pmList.filter((i) => !cartPMSet.has(i.stockId)),
    [pmList, cartPMSet]
  );

  const nonListDisplay = useMemo(() => {
    return nonList
      .map((g) => {
        const key = `${g.productId}::${g.locationId}`;
        const used = cartNonUsedMap.get(key) ?? 0;
        const remaining = Math.max(0, g.quantity - used);
        return { ...g, remaining };
      })
      .filter((g) => g.remaining > 0);
  }, [nonList, cartNonUsedMap]);

  const pmHasNext = (pmRes?.items?.length ?? 0) === PAGE_SIZE;
  const nonHasNext = (nonRes?.items?.length ?? 0) === PAGE_SIZE;

  // actions
  const addPmByStockId = (stockId: string) => {
    const src = pmList.find((i) => i.stockId === stockId);
    if (!src) return;
    setCart((prev) =>
      prev.some((x) => x.type === "pm" && (x as CartPM).stockId === stockId)
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
              iamsId: src.iamsId ?? null,
            } as CartPM,
          ]
    );
  };

  const addNonByKey = (productId: string, fromLocation: string) => {
    const src = nonList.find(
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
        const cap = src.quantity;
        const next = [...prev];
        next[idx] = {
          ...cur,
          quantity: Math.min(cur.quantity + 1, cap),
          maxQuantity: cap,
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

  const handleDragEnd = (event: any) => {
    const { over, active } = event;
    if (!over || over.id !== "dropzone") return;
    const dragId: string = active.id;
    if (dragId.startsWith("pm::")) {
      addPmByStockId(dragId.slice(4));
    } else if (dragId.startsWith("non::")) {
      const [, productId, fromLocation] = dragId.split("::");
      addNonByKey(productId, fromLocation);
    }
  };

  const applyGlobalTo = useCallback(
    (all = false) => {
      if (!globalTo) return;
      setCart((prev) =>
        prev.map((item) => {
          if (all) return { ...item, toLocation: globalTo } as CartItem;
          if (!item.toLocation)
            return { ...item, toLocation: globalTo } as CartItem;
          return item;
        })
      );
    },
    [globalTo]
  );

  const validateCart = () => {
    if (cart.length === 0) return t.errAddItemsFirst as string;
    for (const c of cart) {
      if (!c.toLocation) return t.errChooseTarget as string;
      if (c.toLocation === c.fromLocation) return t.errTargetSame as string;
      const leaf = flatLoc.find((l) => l.id === c.toLocation)?.isLeaf;
      if (!leaf) return t.errLeafOnly as string;
      if (c.type === "non") {
        const n = c as CartNonPM;
        if (n.quantity < 1) return t.errQtyTooSmall as string;
        if (n.quantity > n.maxQuantity) {
          return format(t.errInsufficient, {
            name: c.product.name,
            req: n.quantity,
            avail: n.maxQuantity,
          });
        }
      }
    }
    return "";
  };

  const buildPayloadV2 = () => {
    const pmRows = cart
      .filter((c) => c.type === "pm")
      .map((c) => ({
        stockId: (c as CartPM).stockId,
        fromLocation: c.fromLocation,
        toLocation: c.toLocation,
      }));
    const nonRows = cart
      .filter((c) => c.type === "non")
      .map((c) => ({
        ProductId: (c as CartNonPM).productId,
        LocationId: c.fromLocation,
        quantity: (c as CartNonPM).quantity,
        toLocation: c.toLocation,
      }));
    return { PropertyManaged: pmRows, nonPropertyManaged: nonRows };
  };

  const onConfirmExecute = async () => {
    const err = validateCart();
    if (err) return alert(err);
    setPosting(true);
    try {
      const res = await fetch("/api/inventory/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayloadV2()),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false)
        throw new Error(json?.message || `HTTP ${res.status}`);
      await Promise.all([refetchPm(), refetchNon()]);
      setCart([]);
      setConfirmOpen(false);
      alert(t.transferSuccess);
    } catch (e: any) {
      alert(format(t.transferFailed, { msg: e?.message || String(e) }));
    } finally {
      setPosting(false);
    }
  };

  if (!isOpen) return null;

  // page label (localized)
  const pageLabel = (page: number) =>
    format(t.pageLabel, { page, size: PAGE_SIZE });

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
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white inline-flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6" aria-hidden="true" />
            {t.title}
          </h2>
          <button onClick={onClose} className="text-red-500 hover:underline">
            {t.cancelButton}
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          {(pmErr || nonErr || locErr) && (
            <div className="px-4 py-2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              {t.loadFailed}
              {pmErr ? ` (PM: ${pmErr})` : ""}
              {nonErr ? ` (NonPM: ${nonErr})` : ""}
              {locErr ? ` (Loc: ${locErr})` : ""}
            </div>
          )}

          {!data && !(pmErr || nonErr || locErr) && (
            <div className="p-6 text-gray-600">{t.loading}</div>
          )}

          {data && (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              {/* Sources */}
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* PM */}
                <div className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
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
                      value={searchPMRaw}
                      onChange={(e) => setSearchPMRaw(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-3 max-h-[420px] overflow-auto pr-1">
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
                            {item.product.model}
                          </span>{" "}
                          ・{item.product.brand}
                        </div>
                        <div className="text-xs">
                          ID:{" "}
                          <span className="text-blue-600 dark:text-blue-200">
                            {item.stockId}
                          </span>
                        </div>
                        {item.iamsId ? (
                          <div className="text-xs">
                            IAMS:{" "}
                            <span className="font-mono text-purple-600 dark:text-purple-300">
                              {item.iamsId}
                            </span>
                          </div>
                        ) : null}
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

                  {/* PM pagination */}
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                    <span>{pageLabel(pmPage)}</span>
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
                      <h3 className="text-base font-semibold">
                        {t.nonPropertyItems}
                      </h3>
                    </div>
                    <input
                      className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700"
                      placeholder={t.searchPlaceholder}
                      value={searchNonRaw}
                      onChange={(e) => setSearchNonRaw(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-3 max-h-[420px] overflow-auto pr-1">
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
                            {item.product.model}
                          </span>{" "}
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

                  {/* Non-PM pagination */}
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                    <span>{pageLabel(nonPage)}</span>
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

              {/* Basket */}
              <section className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <h3 className="font-semibold text-lg">🧺 {t.transferZone}</h3>

                {/* global target */}
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <span className="text-sm">{t.globalTarget}</span>
                  <div className="flex-1 min-w-0">
                    <TreeLocationSelect
                      value={globalTo}
                      onChange={setGlobalTo}
                      roots={data?.locations ?? []}
                      placeholder={t.searchLocationPlaceholder}
                      widthClass="w-full"
                    />
                  </div>
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

                <DropZone>
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
                              {/* IAMS (PM) */}
                              {(() => {
                                if (c.type !== "pm") return null;
                                const snap = c as CartPM;
                                const iamssid =
                                  iamsByStock.get(snap.stockId) ||
                                  snap.iamsId ||
                                  null;
                                return iamssid ? (
                                  <div className="text-sm text-gray-600 dark:text-gray-300">
                                    IAMS:{" "}
                                    <span className="font-mono text-purple-700 dark:text-purple-300">
                                      {iamssid}
                                    </span>
                                  </div>
                                ) : null;
                              })()}
                              <div className="text-xs text-gray-600 dark:text-gray-300">
                                <span className="text-red-600 dark:text-red-200">
                                  {c.product.model}
                                </span>{" "}
                                ・{c.product.brand}
                              </div>
                              <div className="text-xs text-gray-500">
                                {t.from}
                                {(c as any).fromPath.join(" → ")}
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
                                    const raw = parseInt(
                                      e.target.value || "1",
                                      10
                                    );
                                    const val = Math.max(
                                      1,
                                      Math.min(
                                        (c as CartNonPM).maxQuantity,
                                        isNaN(raw) ? 1 : raw
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
                                                (c as CartNonPM).maxQuantity,
                                                (c as CartNonPM).quantity + 1
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
                                  / {t.availableLabel}
                                  {(c as CartNonPM).maxQuantity}
                                </span>
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 min-w-0">
                              {/* 標籤 */}
                              <span className="text-sm whitespace-nowrap">
                                {t.targetLocationLabel}
                              </span>

                              {/* 選單：小螢幕滿版；sm 以上固定寬度 */}
                              <div className="min-w-0">
                                <TreeLocationSelect
                                  value={c.toLocation}
                                  onChange={(next) =>
                                    setCart((prev) =>
                                      prev.map((x, i) =>
                                        i === idx
                                          ? ({
                                              ...x,
                                              toLocation: next,
                                            } as CartItem)
                                          : x
                                      )
                                    )
                                  }
                                  roots={data?.locations ?? []}
                                  placeholder={t.searchLocationPlaceholder}
                                  widthClass="w-full sm:w-70" // 小螢幕佔滿、sm 以上維持你原本的 w-70
                                />
                              </div>

                              {/* 移除按鈕：小螢幕靠左、sm 以上跟著第三欄 */}
                              <button
                                className="justify-self-start sm:justify-self-auto px-2 py-1 text-xs rounded bg-red-600 text-white"
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
                        if (err) return alert(err);
                        setConfirmOpen(true);
                      }}
                    >
                      {t.reviewChanges}
                    </button>
                  </div>
                </div>
              </section>
            </DndContext>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
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
                    if (c.type !== "pm") return null;
                    const snap = c as CartPM;
                    const iamssid =
                      iamsByStock.get(snap.stockId) || snap.iamsId || null;
                    return iamssid ? (
                      <div className="text-sm mt-1">
                        IAMS: <code>{iamssid}</code>
                      </div>
                    ) : null;
                  })()}
                  <div className="text-xs mt-1">
                    {t.source}
                    {(c as any).fromPath.join(" → ")}
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
