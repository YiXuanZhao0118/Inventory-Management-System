// features\StockList.tsx
"use client";

import DiscardedModal from '@/features/Discarded';
import TransfersModal from '@/features/Transfers';

import React, { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import QRScanner from "@/components/QRScanner";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";
import { useSearchParams } from "next/navigation";

import { fetcher } from "@/services/apiClient";

type Product = {
  id: string;
  name: string;
  model: string;
  brand: string;
  specifications?: string;
  spec?: string;
  isPropertyManaged: boolean;
};

type Stock = {
  id: string;           // stockId
  productId: string;
  locationId: string;
  discarded?: boolean;
  [k: string]: any;
};

type LocationNode = {
  id: string;
  label: string;
  children?: LocationNode[];
};

type DBResponse = {
  stock: Stock[];
  products: Product[];
  locations: LocationNode[];
  iams: Array<{ stockid: string; IAMSID: string }>;
};

type RowPM = {
  id: string; // stockId
  product: { id: string; name: string; model: string; brand: string; spec?: string; specifications?: string };
  locationId: string;
  locationPath: string[];
  isPropertyManaged: true;
};

type RowNonPM = {
  product: { id: string; name: string; model: string; brand: string; spec?: string; specifications?: string };
  locationId: string;
  locationPath: string[];
  qty: number;
  isPropertyManaged: false;
};

export default function StockList() {
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, de: deDE };
  const t = (tMap[language] || zhTW).StockList;
  const p = (tMap[language] || zhTW).Product;

  const [openDiscard, setOpenDiscard] = useState(false);
  const [openTransfers, setOpenTransfers] = useState(false);
  const searchParams = useSearchParams();
  const initial = searchParams?.get("productId") ?? "";

  const [search, setSearch] = useState(initial);
  const [viewMode, setViewMode] = useState<"aggregated" | "individual">("aggregated");
  const [sortField, setSortField] = useState<string>("model");
  const [sortAsc, setSortAsc] = useState(true);
  const [scannerOpen, setScannerOpen] = useState(false);

  // IAMS 標籤(財產編號)快取：stockId -> IAMSID
  const [tags, setTags] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initial) setSearch(initial);
  }, [initial]);

  // 一次抓所有 DB 資料
  const { data, error } = useSWR<DBResponse>("/api/stocklist", fetcher);

  // 當 /api/stocklist 回來時，填入 IAMS 現況
  useEffect(() => {
    if (!data?.iams) return;
    const map: Record<string, string> = {};
    for (const i of data.iams) map[i.stockid] = i.IAMSID;
    setTags(map);
  }, [data?.iams]);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) return;
    const hitIAMS = Object.values(tags).some(v => v?.toLowerCase().includes(q));
    if (hitIAMS && viewMode !== "individual") {
      setViewMode("individual");
    }
  }, [search, tags, viewMode]);

  // 產生 locationId => 路徑(字串陣列) 的快取
  const pathMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const dfs = (node: LocationNode, trail: string[]) => {
      const next = [...trail, node.label];
      map.set(node.id, next);
      node.children?.forEach((c) => dfs(c, next));
    };
    data?.locations?.forEach((root) => dfs(root, []));
    return map;
  }, [data?.locations]);

  // 將 stock 與 product join，切成 PM / nonPM
  const { individual, aggregated } = useMemo(() => {
    const pm: RowPM[] = [];
    const nonMap = new Map<string, RowNonPM>(); // key: productId + '::' + locationId

    if (!data) return { individual: pm, aggregated: [] as RowNonPM[] };

    const prodMap = new Map<string, Product>(data.products.map((p) => [p.id, p]));
    for (const s of data.stock) {
      const prod = prodMap.get(s.productId);
      if (!prod) continue;
      if (s.discarded) continue; // 丟棄的就不列

      const locationPath = pathMap.get(s.locationId) ?? [];
      const baseProd = {
        id: prod.id,
        name: prod.name,
        model: prod.model,
        brand: prod.brand,
        spec: prod.spec,
        specifications: prod.specifications,
      };

      if (prod.isPropertyManaged) {
        pm.push({
          id: s.id,
          product: baseProd,
          locationId: s.locationId,
          locationPath,
          isPropertyManaged: true,
        });
      } else {
        const key = `${prod.id}::${s.locationId}`;
        const existed = nonMap.get(key);
        if (existed) {
          existed.qty += 1;
        } else {
          nonMap.set(key, {
            product: baseProd,
            locationId: s.locationId,
            locationPath,
            qty: 1,
            isPropertyManaged: false,
          });
        }
      }
    }

    // 排序一下穩定性
    pm.sort((a, b) => a.product.name.localeCompare(b.product.name));
    const agg = Array.from(nonMap.values()).sort((a, b) => a.product.name.localeCompare(b.product.name));

    return { individual: pm, aggregated: agg };
  }, [data, pathMap]);

  // 欄位宣告
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
  ] as const;

  const aggregatedCols = [
    { key: "name", label: t.name, accessor: (r: RowNonPM) => r.product.name },
    { key: "model", label: t.model, accessor: (r: RowNonPM) => r.product.model },
    { key: "brand", label: t.brand, accessor: (r: RowNonPM) => r.product.brand },
    {
      key: "location",
      label: t.location,
      accessor: (r: RowNonPM) => r.locationPath.join(" → "),
    },
    { key: "qty", label: t.quantity, accessor: (r: RowNonPM) => r.qty },
  ] as const;

  const columns = viewMode === "individual" ? individualCols : aggregatedCols;

  // 依模式取得 rows
  const rowsList = useMemo(() => (viewMode === "individual" ? individual : aggregated), [viewMode, individual, aggregated]);

  // 搜尋
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rowsList.slice();

    const text = (row: RowPM | RowNonPM) => {
      const base = [
        "product" in row ? row.product.name : "",
        "product" in row ? row.product.model : "",
        "product" in row ? row.product.brand : "",
        row.locationPath.join(" → "),
      ];

      // 個別財產列：加入 stockId 與 IAMS（讓 IAMS 也能被搜尋）
      if ((row as RowPM).id) {
        const stockId = (row as RowPM).id;
        base.unshift(stockId); // stockId 也可搜
        const iams = tags[stockId];
        if (iams) base.push(iams); // ★ IAMS 放進索引
      }

      // 聚合列：加入數量文字
      if ((row as RowNonPM).qty !== undefined) {
        base.push(String((row as RowNonPM).qty));
      }

      return base.filter(Boolean).join(" ").toLowerCase();
    };

    return rowsList.filter((r) => text(r).includes(q));
  }, [rowsList, search, tags]); // ★ 依賴 tags，IAMS 資料更新時可重算

  // 排序
  const sortedRows = useMemo(() => {
    if (!sortField) return rows;
    const col: any = columns.find((c) => c.key === sortField);
    if (!col) return rows;
    return rows.slice().sort((a: any, b: any) => {
      const va = col.accessor(a);
      const vb = col.accessor(b);
      if (typeof va === "number" && typeof vb === "number") {
        return sortAsc ? va - vb : vb - va;
      }
      return sortAsc
        ? String(va ?? "").localeCompare(String(vb ?? ""))
        : String(vb ?? "").localeCompare(String(va ?? ""));
    });
  }, [rows, columns, sortField, sortAsc]);

  if (error) return <div className="text-red-500 p-4">{t.loadFailed}</div>;
  if (!data) return <div className="text-gray-600 p-4">{t.loading}…</div>;

  return (
    <div className="max-w-screen mx-auto p-6 md:p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-6">
      <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white">📦 {t.title}</h1>

      {/* 轉移庫存 FAB（右下角） */}
      {!scannerOpen && (
        <button
          type="button"
          onClick={() => setOpenTransfers(true)}
          className="fixed bottom-5 left-5 md:bottom-8 md:left-8 z-50
                      p-4 rounded-full shadow-lg bg-amber-500 hover:bg-amber-600
                      text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
          title="轉移庫存"
          aria-label="轉移庫存"
        >
          🔁
        </button>
      )}

      {/* 報廢庫存 FAB（右下角往上 60px） */}
      {!scannerOpen && (
        <button
          type="button"
          onClick={() => setOpenDiscard(true)}
          className="fixed bottom-5 right-5 md:bottom-8 md:right-8 z-50
                      p-4 rounded-full shadow-lg bg-rose-500 hover:bg-rose-600
                      text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500"
          title="報廢庫存"
          aria-label="報廢庫存"
        >
          🗑️
        </button>
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-1 items-center gap-2">
          <input
            type="text"
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            placeholder={t.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={() => setScannerOpen(true)}
            className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            📷
          </button>
        </div>

        <div className="inline-flex rounded-lg bg-gray-200 dark:bg-gray-700 shadow-sm">
          {(["aggregated", "individual"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
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

      {/* Scanner Modal */}
      {scannerOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg w-full max-w-md p-6">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">
              {p.scan_button}
            </h3>
            <div className="h-64 bg-black rounded-lg overflow-hidden">
              <QRScanner
                onScan={(code) => {
                  setSearch(code);
                  setScannerOpen(false);
                }}
                onError={(err) => {
                  alert(err.message);
                  setScannerOpen(false);
                }}
              />
            </div>
            <button
              onClick={() => setScannerOpen(false)}
              className="mt-4 text-sm text-red-500 hover:underline"
            >
              {t.closeScanner}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key as string}
                  onClick={() => {
                    setSortField(col.key as string);
                    setSortAsc((prev) => (col.key === sortField ? !prev : true));
                  }}
                  className="px-4 py-3 text-left cursor-pointer select-none text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-indigo-600"
                >
                  {col.label}
                  {sortField === col.key ? (sortAsc ? " ▲" : " ▼") : ""}
                </th>
              ))}
              {viewMode === "individual" && (
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-600 dark:text-gray-300">
                  IAMS
                </th>
              )}
            </tr>
          </thead>

          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {sortedRows.length > 0 ? (
              sortedRows.map((row) =>
                viewMode === "individual" ? (
                  <tr key={(row as RowPM).id}>
                    {individualCols.map((col) => (
                      <td key={col.key as string} className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700 dark:text-gray-300">
                        {col.accessor(row as RowPM)}
                      </td>
                    ))}
                    <td className="px-4 py-3 w-60">
                      <input
                        type="text"
                        value={tags[(row as RowPM).id] || ""}
                        onChange={(e) =>
                          setTags((prev) => ({ ...prev, [(row as RowPM).id]: e.target.value }))
                        }
                        onBlur={async (e) => {
                          try {
                            await fetch("/api/iams", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                stockid: (row as RowPM).id,
                                IAMSID: e.target.value,
                              }),
                            });
                          } catch (err: any) {
                            alert(err.message || "Failed to save IAMS ID");
                          }
                        }}
                        placeholder="IAMS ID"
                        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={`${(row as RowNonPM).product.id}-${(row as RowNonPM).locationId}`}>
                    {aggregatedCols.map((col) => (
                      <td key={col.key as string} className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-700 dark:text-gray-300">
                        {col.accessor(row as RowNonPM)}
                      </td>
                    ))}
                  </tr>
                )
              )
            ) : (
              <tr>
                <td
                  colSpan={columns.length + (viewMode === "individual" ? 1 : 0)}
                  className="px-4 py-6 text-center text-gray-500 dark:text-gray-400"
                >
                  {search ? t.noMatchingProducts : t.noStock}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    
      {/* Modal 呼叫：注意 prop 名稱是 open，不是 isOpen */}
      <TransfersModal
        isOpen={openTransfers}
        onClose={() => setOpenTransfers(false)}
      />
      <DiscardedModal
        isOpen={openDiscard}
        onClose={() => setOpenDiscard(false)}
      />  
    </div>
  );
}
