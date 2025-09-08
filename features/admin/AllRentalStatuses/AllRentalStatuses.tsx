// pages/admin/AllRentalStatuses/AllRentalStatuses.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";
import devices from "@/app/data/device.json";
import { ShortTermRetrievalView } from "@/lib/types";
import { fetcher, api } from "@/services/apiClient";

interface ApiResponse {
  items: ShortTermRetrievalView[];
}


export default function AllRentalStatuses() {
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const t = (tMap[language] || zhTW).AllRentalStatuses;

  // 自動刷新看板
  const { data, error, mutate, isLoading } = useSWR<ApiResponse>(
    "/api/rentals/short-term/active",
    fetcher,
    { refreshInterval: 10000, revalidateOnFocus: true }
  );

  // 倒數用
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const itv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(itv);
  }, []);

  // 搜尋 / 篩選
  const [query, setQuery] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [sortKey, setSortKey] = useState<"due" | "loan" | "product" | "borrower">("due");
  const [asc, setAsc] = useState(true);

  // 勾選（批次歸還）
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [data?.items]);

  const getDeviceName = (id: string) => {
    const rec = (devices as any[]).find((d) => d.deviceId === id);
    return rec ? rec.name : id;
  };

  const fmt = new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const calcRemain = (dueISO: string) => {
    const due = new Date(dueISO).getTime();
    const diff = due - now.getTime();
    const overdue = diff < 0;
    const abs = Math.abs(diff);
    const h = Math.floor(abs / 3_600_000);
    const m = Math.floor((abs % 3_600_000) / 60_000);
    return { overdue, label: overdue ? `-${h}h ${m}m` : `${h}h ${m}m` };
  };

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    const q = query.trim().toLowerCase();

    return items
      .filter((r) => {
        if (onlyOverdue && !calcRemain(r.dueDate).overdue) return false;

        if (!q) return true;
        const hay = [
          r.stockId,
          r.product?.name,
          r.product?.model,
          r.product?.brand,
          r.locationPath?.join(" > "),
          r.borrower,
          r.borrowerId,
          getDeviceName(r.borrowerId),
          fmt.format(new Date(r.loanDate)),
          fmt.format(new Date(r.dueDate)),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const A = a;
        const B = b;
        const mul = asc ? 1 : -1;
        switch (sortKey) {
          case "due":
            return mul * (new Date(A.dueDate).getTime() - new Date(B.dueDate).getTime());
          case "loan":
            return mul * (new Date(A.loanDate).getTime() - new Date(B.loanDate).getTime());
          case "product":
            return mul * String(A.product?.name ?? "").localeCompare(String(B.product?.name ?? ""));
          case "borrower":
            return mul * String(getDeviceName(A.borrowerId)).localeCompare(getDeviceName(B.borrowerId));
          default:
            return 0;
        }
      });
  }, [data?.items, query, onlyOverdue, asc, sortKey, now, language]);

  const allIds = filtered.map((r) => r.id);
  const allSelected = selected.size > 0 && allIds.every((id) => selected.has(id));

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(allIds) : new Set());
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const ns = new Set(prev);
      if (checked) ns.add(id);
      else ns.delete(id);
      return ns;
    });
  };

  const returnOne = async (id: string) => {
    try {
      await api.post("/api/rentals/return", {
        rentedItemId: id,
        returnDate: new Date().toISOString(),
      });

      setSelected((s) => {
        const ns = new Set(s);
        ns.delete(id);
        return ns;
      });
      await mutate();
    } catch (e: any) {
      const msg = e?.data?.error || e?.message || String(e);
      alert((t.returnFailed ?? "Return failed") + `: ${msg}`);
    }
  };

  const returnSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(t.confirmReturnSelected ?? "Return selected items?")) return;

    const ids = Array.from(selected);
    let ok = 0,
      fail = 0;
    for (const id of ids) {
      try {
        await returnOne(id);
        ok++;
      } catch {
        fail++;
      }
    }
    alert(
      (t.bulkResult ?? "Done") + `: ${ok} OK${fail ? `, ${fail} failed` : ""}`
    );
    await mutate();
  };

  if (error) {
    const msg = (error as Error).message;
    return (
      <div className="p-8 text-red-600 dark:text-red-400">
        {(t.loadFailed ?? "Load failed").replace("{errorMessage}", msg)}
      </div>
    );
  }
  if (isLoading) {
    return <div className="p-8 text-gray-600 dark:text-gray-400">{t.loading ?? "Loading…"}</div>;
  }

  if (filtered.length === 0) {
    return (
      <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
        <h1 className="text-3xl font-bold mb-6">📋 {t.title}</h1>
        {/* 控制列 */}
        <Controls
          query={query}
          setQuery={setQuery}
          onlyOverdue={onlyOverdue}
          setOnlyOverdue={setOnlyOverdue}
          onRefresh={() => mutate()}
          t={t}
        />
        <div className="py-16 text-center text-gray-500">{t.noRecords ?? "No active rentals"}</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-8 bg-white dark:bg-gray-900 rounded-lg shadow space-y-4">
      <h1 className="text-2xl font-bold">{t.title}</h1>

      {/* 控制列 */}
      <Controls
        query={query}
        setQuery={setQuery}
        onlyOverdue={onlyOverdue}
        setOnlyOverdue={setOnlyOverdue}
        onRefresh={() => mutate()}
        t={t}
      />

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>

              <SortableTh
                label={t.borrower ?? "Borrower"}
                active={sortKey === "borrower"}
                asc={asc}
                onClick={() => {
                  setAsc(sortKey === "borrower" ? !asc : true);
                  setSortKey("borrower");
                }}
              />
              <SortableTh
                label={t.product ?? "Product"}
                active={sortKey === "product"}
                asc={asc}
                onClick={() => {
                  setAsc(sortKey === "product" ? !asc : true);
                  setSortKey("product");
                }}
              />
              <th className="px-4 py-3 text-left text-sm">{t.stockId ?? "Stock ID"}</th>
              <th className="px-4 py-3 text-left text-sm">{t.location ?? "Location"}</th>

              <SortableTh
                label={t.loanDate ?? "Loan date"}
                active={sortKey === "loan"}
                asc={asc}
                onClick={() => {
                  setAsc(sortKey === "loan" ? !asc : true);
                  setSortKey("loan");
                }}
              />
              <SortableTh
                label={t.dueDate ?? "Due date"}
                active={sortKey === "due"}
                asc={asc}
                onClick={() => {
                  setAsc(sortKey === "due" ? !asc : true);
                  setSortKey("due");
                }}
              />
              <th className="px-4 py-3 text-left text-sm">{t.status ?? "Status"}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>

          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {filtered.map((r) => {
              const { overdue, label } = calcRemain(r.dueDate);
              return (
                <tr key={r.id} className="hover:bg-gray-100 dark:hover:bg-gray-800">
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={(e) => toggleOne(r.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium">{getDeviceName(r.borrowerId)}</div>
                    <div className="text-gray-500 text-xs">{r.borrowerId}</div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium">{r.product.name}</div>
                    <div className="text-gray-500 text-xs">
                      {r.product.brand} / {r.product.model}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">{r.stockId}</td>
                  <td className="px-4 py-3 text-sm">{r.locationPath.join(" > ")}</td>
                  <td className="px-4 py-3 text-sm">{fmt.format(new Date(r.loanDate))}</td>
                  <td className="px-4 py-3 text-sm">{fmt.format(new Date(r.dueDate))}</td>
                  <td className="px-4 py-3 text-sm">
                    <span
                      className={
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold " +
                        (overdue
                          ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200")
                      }
                    >
                      {overdue ? (t.overdue ?? "Overdue") : (t.remaining ?? "Remaining")}: {label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                      onClick={() => returnOne(r.id)}
                    >
                      {t.returnButton ?? "Return"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* 表尾：批次操作 */}
          <tfoot className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <td colSpan={9} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <button
                    disabled={selected.size === 0}
                    onClick={returnSelected}
                    className={
                      "px-4 py-2 rounded text-white " +
                      (selected.size === 0
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-red-600 hover:bg-red-700")
                    }
                  >
                    {(t.returnSelected ?? "Return selected")} ({selected.size})
                  </button>
                  <div className="text-sm text-gray-500">
                    {(t.totalShown ?? "Shown")}: {filtered.length}
                  </div>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ---- 小元件：控制列 / 可排序表頭 ---- */

function Controls({
  query,
  setQuery,
  onlyOverdue,
  setOnlyOverdue,
  onRefresh,
  t,
}: {
  query: string;
  setQuery: (v: string) => void;
  onlyOverdue: boolean;
  setOnlyOverdue: (v: boolean) => void;
  onRefresh: () => void;
  t: any;
}) {
  return (
    <div className="flex flex-col md:flex-row gap-3 md:items-center">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.searchPlaceholder ?? "Search by product, stock, borrower, IAMS…"}
        className="flex-1 px-3 py-2 border rounded bg-white dark:bg-gray-900"
      />
      <label className="inline-flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={onlyOverdue}
          onChange={(e) => setOnlyOverdue(e.target.checked)}
        />
        {t.showOverdueOnly ?? "Overdue only"}
      </label>
      <button
        onClick={onRefresh}
        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
      >
        {t.refresh ?? "Refresh"}
      </button>
    </div>
  );
}

function SortableTh({
  label,
  active,
  asc,
  onClick,
}: {
  label: string;
  active: boolean;
  asc: boolean;
  onClick: () => void;
}) {
  return (
    <th
      onClick={onClick}
      className={
        "px-4 py-3 text-left text-sm cursor-pointer select-none " +
        (active ? "text-indigo-600" : "")
      }
      title="Click to sort"
    >
      {label} {active ? (asc ? "▲" : "▼") : ""}
    </th>
  );
}
