// features/Inventory.tsx
"use client";
import { Boxes, ArrowLeftRight, Trash2 } from "lucide-react";
import DiscardedModal from "@/features/Discarded";
import TransfersModal from "@/features/Transfers";

import React, { useState, useMemo, useEffect } from "react";
import { useLanguage } from "@/src/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";
import { useSearchParams } from "next/navigation";
import { useJson } from "@/hooks/useJson";

// ======== 小工具：組 query string ========
const qs = (o: Record<string, any>) =>
  "?" +
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
    )
    .join("&");

// ======== 型別 ========
type Status = "in_stock" | "short_term" | "long_term" | "discarded";

type Product = {
  id: string;
  name: string;
  model: string;
  brand: string;
  specifications?: string;
  spec?: string;
  isPropertyManaged?: boolean;
};

type RowPM = {
  id: string; // stockId
  product: {
    id: string;
    name: string;
    model: string;
    brand: string;
    spec?: string;
    specifications?: string;
  };
  locationId: string;
  locationPath: string[];
  isPropertyManaged: true;
};

type RowNonPM = {
  product: {
    id: string;
    name: string;
    model: string;
    brand: string;
    spec?: string;
    specifications?: string;
  };
  locationId: string;
  locationPath: string[];
  qty: number;
  isPropertyManaged: false;
};

type PMApiItem = {
  stockId: string;
  product: Product;
  locationId: string;
  locationPath: string[];
  currentStatus: Status;
  iamsId?: string | null;
};
type NonApiItem = {
  product: Product;
  locationId: string;
  locationPath: string[];
  quantity: number;
  currentStatus: Status;
};
type PageMeta = { page: number; pageSize: number; total: number };
type PagedResp<T> = { items: T[]; page?: PageMeta };

type Column<R> = {
  key: string;
  label: React.ReactNode;
  accessor: (r: R) => string | number;
};

export default function InventoryPage() {
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const t = (tMap[language] || zhTW).StockList;

  const statusLabel: Record<Status, string> = {
    in_stock: t?.statusInStock || "In stock",
    short_term: t?.statusShortTerm || "Short-term",
    long_term: t?.statusLongTerm || "Long-term",
    discarded: t?.statusDiscarded || "Discarded",
  };

  const [openDiscard, setOpenDiscard] = useState(false);
  const [openTransfers, setOpenTransfers] = useState(false);
  const searchParams = useSearchParams();
  const initial = searchParams?.get("productId") ?? "";

  const [search, setSearch] = useState(initial);
  const [status, setStatus] = useState<Status>("in_stock");
  const [viewMode, setViewMode] = useState<"aggregated" | "individual">(
    "aggregated"
  );
  const [sortField, setSortField] = useState<string>("model");
  const [sortAsc, setSortAsc] = useState(true);

  // IAMS 標籤快取：stockId -> iamsId
  const [tags, setTags] = useState<Record<string, string>>({});
  // 使用者是否手動覆寫視圖（避免被 auto switch 蓋掉）
  const [userOverrodeMode, setUserOverrodeMode] = useState(false);

  // === 前端分頁（每頁 20 筆） ===
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [search, viewMode, status]);

  useEffect(() => {
    if (initial) setSearch(initial);
  }, [initial]);

  // ==== 全域鍵盤事件抑制（只擋鍵盤，避免干擾 React 的 input 事件）====
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el?.dataset?.stopHotkeys === "true") {
        ev.stopPropagation();
        // @ts-ignore
        if (typeof ev.stopImmediatePropagation === "function")
          ev.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", handler, true);
    window.addEventListener("keypress", handler, true);
    window.addEventListener("keyup", handler, true);
    return () => {
      window.removeEventListener("keydown", handler, true);
      window.removeEventListener("keypress", handler, true);
      window.removeEventListener("keyup", handler, true);
    };
  }, []);

  // ======== 讀取資料（帶入 status + q） ========
  const LIMIT = 500;
  const q = search.trim();

  const pmKey = useMemo(
    () => `/api/inventory/pm${qs({ status, q, page: 1, limit: LIMIT })}`,
    [status, q]
  );
  const nonKey = useMemo(
    () => `/api/inventory/nonpm${qs({ status, q, page: 1, limit: LIMIT })}`,
    [status, q]
  );

  const {
    data: pmRes,
    error: pmErr,
    loading: pmLoading,
    refetch: refetchPm,
  } = useJson<PagedResp<PMApiItem>>(pmKey);

  const {
    data: nonRes,
    error: nonErr,
    loading: nonLoading,
    refetch: refetchNon,
  } = useJson<PagedResp<NonApiItem>>(nonKey);

  // === 2) 保留舊資料：refetch 期間不要把資料清掉 ===
  const [pmData, setPmData] = useState<PagedResp<PMApiItem> | null>(null);
  const [nonData, setNonData] = useState<PagedResp<NonApiItem> | null>(null);
  useEffect(() => {
    if (pmRes?.items) setPmData(pmRes);
  }, [pmRes]);
  useEffect(() => {
    if (nonRes?.items) setNonData(nonRes);
  }, [nonRes]);

  // 初始化 IAMS 對照（從 PM 回傳帶的 iamsId）
  useEffect(() => {
    const map: Record<string, string> = {};
    for (const s of pmData?.items ?? [])
      if (s.iamsId) map[s.stockId] = s.iamsId;
    setTags(map);
  }, [pmData?.items]);

  // 搜尋像 IAMS 時，自動切到個別財產視圖（但尊重手動覆寫；短字串不觸發）
  useEffect(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return;
    if (userOverrodeMode) return; // 使用者手動選過 -> 不再自動切
    if (ql.length < 3) return; // 避免單字元/純數字太短就誤觸

    // 規則可調：至少 3 碼英數/連字號，或帶 iams 前綴
    const looksLikeIAMS = /^(iams[-:\s]?)?[a-z0-9-]{3,}$/i.test(ql);
    if (!looksLikeIAMS) return;

    const hitIAMS = Object.values(tags).some((v) =>
      v?.toLowerCase().includes(ql)
    );
    if (hitIAMS && viewMode !== "individual") setViewMode("individual");
  }, [q, tags, viewMode, userOverrodeMode]);

  // API -> rows（用保留資料 pmData/nonData）
  const individual: RowPM[] = useMemo(() => {
    const list = pmData?.items ?? [];
    return list.map((s) => ({
      id: s.stockId,
      product: {
        id: s.product.id,
        name: s.product.name,
        model: s.product.model,
        brand: s.product.brand,
        spec: s.product.spec,
        specifications: s.product.specifications,
      },
      locationId: s.locationId,
      locationPath: s.locationPath,
      isPropertyManaged: true,
    }));
  }, [pmData?.items]);

  const aggregated: RowNonPM[] = useMemo(() => {
    const list = nonData?.items ?? [];
    return list.map((g) => ({
      product: {
        id: g.product.id,
        name: g.product.name,
        model: g.product.model,
        brand: g.product.brand,
        spec: g.product.spec,
        specifications: g.product.specifications,
      },
      locationId: g.locationId,
      locationPath: g.locationPath,
      qty: g.quantity,
      isPropertyManaged: false,
    }));
  }, [nonData?.items]);

  // 欄位（把 IAMS 正式納入 PM 欄位，成為可點擊排序的欄）
  const individualCols = [
    { key: "id", label: t.id, accessor: (r: RowPM) => r.id },
    { key: "name", label: t.name, accessor: (r: RowPM) => r.product.name },
    { key: "model", label: t.model, accessor: (r: RowPM) => r.product.model },
    { key: "brand", label: t.brand, accessor: (r: RowPM) => r.product.brand },
    {
      key: "location",
      label: t.location,
      accessor: (r: RowPM) => r.locationPath.join(" → "),
    },
    {
      key: "iams",
      label: "IAMS",
      accessor: (r: RowPM) => tags[r.id] || "",
    },
  ] satisfies ReadonlyArray<Column<RowPM>>;

  const aggregatedCols = [
    { key: "name", label: t.name, accessor: (r: RowNonPM) => r.product.name },
    {
      key: "model",
      label: t.model,
      accessor: (r: RowNonPM) => r.product.model,
    },
    {
      key: "brand",
      label: t.brand,
      accessor: (r: RowNonPM) => r.product.brand,
    },
    {
      key: "location",
      label: t.location,
      accessor: (r: RowNonPM) => r.locationPath.join(" → "),
    },
    { key: "qty", label: t.quantity, accessor: (r: RowNonPM) => r.qty },
  ] satisfies ReadonlyArray<Column<RowNonPM>>;

  const columns: ReadonlyArray<Column<RowPM | RowNonPM>> =
    viewMode === "individual"
      ? (individualCols as ReadonlyArray<Column<RowPM | RowNonPM>>)
      : (aggregatedCols as ReadonlyArray<Column<RowPM | RowNonPM>>);

  // 模式 -> rows（原始列表）
  const rowsList = useMemo(
    () => (viewMode === "individual" ? individual : aggregated),
    [viewMode, individual, aggregated]
  );

  // 次要本地搜尋（保留 IAMS 比對）
  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    if (!ql) return rowsList.slice();

    const text = (row: RowPM | RowNonPM) => {
      const base = [
        "product" in row ? row.product.name : "",
        "product" in row ? row.product.model : "",
        "product" in row ? row.product.brand : "",
        row.locationPath.join(" → "),
      ];
      if ((row as RowPM).id) {
        const stockId = (row as RowPM).id;
        base.unshift(stockId);
        const iams = tags[stockId];
        if (iams) base.push(iams);
      }
      if ((row as RowNonPM).qty !== undefined)
        base.push(String((row as RowNonPM).qty));
      return base.filter(Boolean).join(" ").toLowerCase();
    };

    return rowsList.filter((r) => text(r).includes(ql));
  }, [rowsList, q, tags]);

  // ---- 比較工具：文字自然排序（忽略大小寫、數字感知）----
  const cmpStr = (a: string, b: string) =>
    String(a ?? "").localeCompare(String(b ?? ""), undefined, {
      numeric: true,
      sensitivity: "base",
    });

  // 型號排序鍵：先比去掉結尾 '+' 的 base，再比是否有 '+'
  const modelKey = (m?: string) => {
    const s = String(m ?? "");
    const hasPlus = s.endsWith("+") ? 1 : 0;
    const base = hasPlus ? s.slice(0, -1) : s;
    return { base, hasPlus };
  };

  // 排序（複合排序）
  const sortedRows = useMemo(() => {
    const base = rows.slice();

    if (viewMode === "individual") {
      // === PM：複合排序 ===
      // 預設（或點 brand）：brand → model → location → iams → name
      // 點 model：model → brand → location → iams → name
      // 點 location：location → brand → model → iams → name
      // 點 iams：iams → brand → model → location → name
      // 點 name：name → brand → model → location → iams
      // 僅第一鍵吃升/降序；其餘鍵固定升冪（讓群組穩定）
      type PMKey = "brand" | "model" | "location" | "iams" | "name";
      const valid: PMKey[] = ["brand", "model", "location", "iams", "name"];
      const primary: PMKey = valid.includes(sortField as PMKey)
        ? (sortField as PMKey)
        : "brand";
      const dir = sortAsc ? 1 : -1;

      const chainByPrimary: Record<PMKey, PMKey[]> = {
        brand: ["brand", "model", "location", "iams", "name"],
        model: ["model", "brand", "location", "iams", "name"],
        location: ["location", "brand", "model", "iams", "name"],
        iams: ["iams", "brand", "model", "location", "name"],
        name: ["name", "brand", "model", "location", "iams"],
      };
      const order = chainByPrimary[primary];

      return base.sort((aa, bb) => {
        const a = aa as RowPM;
        const b = bb as RowPM;

        for (let i = 0; i < order.length; i++) {
          const key = order[i];

          if (key === "brand") {
            const c =
              (i === 0 ? dir : 1) * cmpStr(a.product.brand, b.product.brand);
            if (c) return c;
          } else if (key === "model") {
            const ka = modelKey(a.product.model);
            const kb = modelKey(b.product.model);
            const baseCmp = (i === 0 ? dir : 1) * cmpStr(ka.base, kb.base);
            if (baseCmp) return baseCmp;
            if (ka.hasPlus !== kb.hasPlus) return ka.hasPlus - kb.hasPlus; // 無+ 在前
          } else if (key === "location") {
            const la = a.locationPath.join(" / ");
            const lb = b.locationPath.join(" / ");
            const c = (i === 0 ? dir : 1) * cmpStr(la, lb);
            if (c) return c;
          } else if (key === "iams") {
            const ia = tags[a.id] ?? "";
            const ib = tags[b.id] ?? "";
            const c = (i === 0 ? dir : 1) * cmpStr(ia, ib);
            if (c) return c;
          } else if (key === "name") {
            const c =
              (i === 0 ? dir : 1) * cmpStr(a.product.name, b.product.name);
            if (c) return c;
          }
        }
        return 0;
      });
    } else {
      // === Non-PM：複合排序 ===
      // 預設（或點 brand）：brand → model → location → qty → name
      // 點 qty：qty → brand → model → location → name
      type NonKey = "brand" | "model" | "location" | "qty" | "name";
      const valid: NonKey[] = ["brand", "model", "location", "qty", "name"];
      const primary: NonKey = valid.includes(sortField as NonKey)
        ? (sortField as NonKey)
        : "brand";
      const dir = sortAsc ? 1 : -1;

      const chainByPrimary: Record<NonKey, NonKey[]> = {
        brand: ["brand", "model", "location", "qty", "name"],
        model: ["model", "brand", "location", "qty", "name"],
        location: ["location", "brand", "model", "qty", "name"],
        qty: ["qty", "brand", "model", "location", "name"],
        name: ["name", "brand", "model", "location", "qty"],
      };
      const order = chainByPrimary[primary];

      return base.sort((aa, bb) => {
        const a = aa as RowNonPM;
        const b = bb as RowNonPM;

        for (let i = 0; i < order.length; i++) {
          const key = order[i];

          if (key === "brand") {
            const c =
              (i === 0 ? dir : 1) * cmpStr(a.product.brand, b.product.brand);
            if (c) return c;
          } else if (key === "model") {
            const ka = modelKey(a.product.model);
            const kb = modelKey(b.product.model);
            const baseCmp = (i === 0 ? dir : 1) * cmpStr(ka.base, kb.base);
            if (baseCmp) return baseCmp;
            if (ka.hasPlus !== kb.hasPlus) return ka.hasPlus - kb.hasPlus;
          } else if (key === "location") {
            const la = a.locationPath.join(" / ");
            const lb = b.locationPath.join(" / ");
            const c = (i === 0 ? dir : 1) * cmpStr(la, lb);
            if (c) return c;
          } else if (key === "qty") {
            const qa = typeof a.qty === "number" ? a.qty : -Infinity;
            const qb = typeof b.qty === "number" ? b.qty : -Infinity;
            const c = (i === 0 ? dir : 1) * (qa - qb);
            if (c) return c;
          } else if (key === "name") {
            const c =
              (i === 0 ? dir : 1) * cmpStr(a.product.name, b.product.name);
            if (c) return c;
          }
        }
        return 0;
      });
    }
  }, [rows, viewMode, sortField, sortAsc, tags]);

  // 前端分頁
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pagedRows = useMemo(
    () => sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedRows, page]
  );
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [pageCount, page]);

  const isFetching = pmLoading || nonLoading;

  // ======== UI ========
  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
        <Boxes className="h-7 w-7" aria-hidden="true" />
        <span>{t.title}</span>
      </h1>

      {/* 工具列：搜尋 + 狀態 + 視圖切換 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div role="search" className="flex flex-1 items-center gap-2">
          <input
            id="inv-search"
            data-stop-hotkeys="true"
            type="text"
            autoComplete="off"
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => {
              const v = e.target.value;
              setSearch(v);
              if (!v) setUserOverrodeMode(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              // @ts-ignore
              if (typeof e.nativeEvent.stopImmediatePropagation === "function")
                e.nativeEvent.stopImmediatePropagation();
              if (e.key === "Enter") e.preventDefault();
            }}
            onKeyUp={(e) => e.stopPropagation()}
            onKeyPress={(e) => e.stopPropagation()}
          />

          <select
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            aria-label={t.statusLabel || "Status"}
            title={t.statusLabel || "Status"}
          >
            <option value="in_stock">{statusLabel.in_stock}</option>
            <option value="short_term">{statusLabel.short_term}</option>
            <option value="long_term">{statusLabel.long_term}</option>
            <option value="discarded">{statusLabel.discarded}</option>
          </select>
        </div>

        <div className="inline-flex rounded-lg bg-gray-200 dark:bg-gray-700 shadow-sm">
          {(["individual", "aggregated"] as const).map((mode) => (
            <button
              type="button"
              key={mode}
              onClick={() => {
                setUserOverrodeMode(true);
                setViewMode(mode);
              }}
              className={
                `px-4 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 ` +
                (viewMode === mode
                  ? "bg-indigo-600 text-white"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600")
              }
            >
              {mode === "aggregated" ? t.showAggregated : t.showIndividual}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto relative">
        {/* 載入角標（不卸載任何節點） */}
        {isFetching && (
          <div className="absolute right-3 top-2 text-xs opacity-70 pointer-events-none">
            {t.loading}…
          </div>
        )}

        {/* 錯誤訊息（不 early return） */}
        {(pmErr || nonErr) && (
          <div className="mb-2 text-red-600">
            {t.loadFailed}
            {pmErr ? ` (PM: ${String(pmErr)})` : ""}
            {nonErr ? ` (NonPM: ${String(nonErr)})` : ""}
          </div>
        )}

        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key as string}
                  onClick={() => {
                    setSortField(col.key as string);
                    setSortAsc((prev) =>
                      col.key === sortField ? !prev : true
                    );
                  }}
                  className="px-4 py-3 text-left cursor-pointer select-none text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-indigo-600"
                >
                  {col.label}
                  {sortField === col.key ? (sortAsc ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {(pmData || nonData) && sortedRows.length > 0 ? (
              pagedRows.map((row) => (
                <tr
                  key={
                    viewMode === "individual"
                      ? (row as RowPM).id
                      : `${(row as RowNonPM).product.id}-${
                          (row as RowNonPM).locationId
                        }`
                  }
                >
                  {columns.map((col) => (
                    <td
                      key={col.key as string}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700 dark:text-gray-300"
                    >
                      {viewMode === "individual" && col.key === "iams" ? (
                        <input
                          type="text"
                          value={tags[(row as RowPM).id] || ""}
                          onChange={(e) =>
                            setTags((prev) => ({
                              ...prev,
                              [(row as RowPM).id]: e.target.value,
                            }))
                          }
                          onBlur={async (e) => {
                            try {
                              const res = await fetch(
                                "/api/inventory/pm/iams",
                                {
                                  method: "PATCH",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({
                                    stockId: (row as RowPM).id,
                                    iamsId: e.target.value,
                                  }),
                                }
                              );
                              if (!res.ok) {
                                const j = await res.json().catch(() => ({}));
                                throw new Error(
                                  j?.message || `HTTP ${res.status}`
                                );
                              }
                              refetchPm();
                            } catch (err: any) {
                              alert(err?.message || "Failed to save IAMS ID");
                            }
                          }}
                          placeholder={t.iamsPlaceholder || "IAMS ID"}
                          className="w-37 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                        />
                      ) : (
                        (col as any).accessor(row as any)
                      )}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-6 text-center text-gray-500 dark:text-gray-400"
                >
                  {search ? t.noMatchingProducts : t.noStock}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          {t.pagerLabel
            ? t.pagerLabel
                .replace("{{pageSize}}", String(PAGE_SIZE))
                .replace("{{total}}", String(sortedRows.length))
                .replace("{{status}}", statusLabel[status])
            : `Per page ${PAGE_SIZE}, total ${sortedRows.length} (${statusLabel[status]})`}
        </div>

        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
            onClick={() => setPage(1)}
            disabled={page === 1}
            aria-label={t.firstPage || "First"}
            title={t.firstPage || "First"}
          >
            «
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label={t.prevPage || "Prev"}
            title={t.prevPage || "Prev"}
          >
            ‹
          </button>

          <span className="text-sm tabular-nums">
            {page} / {pageCount}
          </span>

          <button
            type="button"
            className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={page === pageCount}
            aria-label={t.nextPage || "Next"}
            title={t.nextPage || "Next"}
          >
            ›
          </button>
          <button
            type="button"
            className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
            onClick={() => setPage(pageCount)}
            disabled={page === pageCount}
            aria-label={t.lastPage || "Last"}
            title={t.lastPage || "Last"}
          >
            »
          </button>
        </div>
      </div>

      {/* 轉移庫存 FAB（左下角） */}
      <button
        type="button"
        onClick={() => setOpenTransfers(true)}
        className="fixed bottom-0 left-5 md:bottom-0 md:left-8 z-50 p-4 rounded-full shadow-lg
             bg-black hover:bg-neutral-900 text-white
             focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
        title={t.fabTransfersTitle}
        aria-label={t.fabTransfersAria}
      >
        <ArrowLeftRight className="w-6 h-6" aria-hidden="true" />
      </button>

      {/* 報廢庫存 FAB（右下角） */}
      <button
        type="button"
        onClick={() => setOpenDiscard(true)}
        className="fixed bottom-5 right-5 md:bottom-8 md:right-8 z-50 p-4 rounded-full shadow-lg
             bg-black hover:bg-neutral-900 text-white
             focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
        title={t.fabDiscardTitle}
        aria-label={t.fabDiscardAria}
      >
        <Trash2 className="w-6 h-6 text-white" aria-hidden="true" />
      </button>

      {/* Modal 呼叫 */}
      <TransfersModal
        isOpen={openTransfers}
        onClose={() => {
          setOpenTransfers(false);
          refetchPm();
          refetchNon();
        }}
      />
      <DiscardedModal
        isOpen={openDiscard}
        onClose={() => {
          setOpenDiscard(false);
          refetchPm();
          refetchNon();
        }}
      />
    </div>
  );
}
