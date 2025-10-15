// features\ProductGallery\products-overview.tsx
"use client";
import { FileText } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import FileUploadModal from "./components/FileUploadModal";
import ProductFileEditModal from "./components/FileEditModal";

// i18n
import { useLanguage } from "@/src/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

type ProductRow = {
  id: string;
  name: string;
  brand: string;
  model: string;
  specifications: string;
  imageUrl: string;
  datasheetCount: number;
  isPropertyManaged?: boolean;
};

type ProductFileRow = {
  id: string;
  path: string;
  partNumber: string;
  description: string | null;
  files: {
    image?: string[];
    pdf?: string[];
    video?: string[];
    other?: string[];
    [k: string]: any;
  };
  sizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
};

type PMFilter = "all" | "true" | "false";

const PAGE_SIZE = 20;
const PF_PAGE_SIZE = 5;

function displayName(name: string) {
  if (name.length <= 28) return name;
  return `${name.slice(0, 14)}…${name.slice(-10)}`;
}

// --- 小工具：簡單的模板字串取代 ---
const fmt = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    tpl
  );

export default function ProductsOverviewPage() {
  // i18n -------------------------------------------------
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const t = (tMap[language] || zhTW).ProductGallery?.Overview;

  // 狀態 -------------------------------------------------
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);

  // toolbar
  const [query, setQuery] = useState("");
  const [pmFilter, setPmFilter] = useState<PMFilter>("all");
  const [page, setPage] = useState(1);

  // Modal：檔案清單
  const [modalProduct, setModalProduct] = useState<ProductRow | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [productFiles, setProductFiles] = useState<ProductFileRow[]>([]);
  const [pfPage, setPfPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // 上傳 / 編輯 modal（外掛）
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductFileRow | null>(null);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const validImg = (u?: string | null) => !!u && /^(https?:\/\/|\/)/i.test(u);

  // ===== 產品清單（分頁＋篩選＋搜尋 P/N） =====
  const abortRef = useRef<AbortController | null>(null);

  const fetchProducts = async (opts?: {
    page?: number;
    q?: string;
    pm?: PMFilter;
  }) => {
    const _page = opts?.page ?? page;
    const _q = opts?.q ?? query;
    const _pm = opts?.pm ?? pmFilter;

    setLoading(true);
    setErrorMsg(null);

    // 取消上一個請求，避免慢回應覆蓋新資料
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const url = new URL("/api/products-overview", window.location.origin);
      url.searchParams.set("page", String(_page));
      url.searchParams.set("pageSize", String(PAGE_SIZE));
      if (_q.trim()) url.searchParams.set("q", _q.trim());
      if (_pm !== "all") url.searchParams.set("pm", _pm);

      const res = await fetch(url.toString(), {
        cache: "no-store",
        signal: ac.signal,
      });
      const txt = await res.text();
      const json = txt ? JSON.parse(txt) : null;
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      setProducts(json?.items || []);
      setTotal(json?.total || 0);
    } catch (e: any) {
      if (e?.name === "AbortError") return; // 忽略中止
      console.error("GET /api/products-overview failed", e);
      setProducts([]);
      setTotal(0);
      setErrorMsg(e?.message || "Failed to load");
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  };

  // 初次載入
  useEffect(() => {
    fetchProducts({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 搜尋 / 篩選 改變 → 回到第 1 頁（含 200ms debounce）
  useEffect(() => {
    setPage(1);
    const id = setTimeout(
      () => fetchProducts({ page: 1, q: query, pm: pmFilter }),
      200
    );
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, pmFilter]);

  // 換頁
  useEffect(() => {
    fetchProducts({ page, q: query, pm: pmFilter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // ===== 檔案清單（支援保留展開、保持特定列展開、保留分頁） =====
  const refreshFiles = async (
    pid: string,
    opts: {
      preserveExpanded?: boolean;
      keepOpenId?: string;
      keepPfPage?: boolean;
    } = {}
  ) => {
    setFilesLoading(true);

    const prevExpanded = expanded;
    const prevPfPage = pfPage;

    try {
      const res = await fetch(
        `/api/product-files?productId=${encodeURIComponent(pid)}`,
        {
          cache: "no-store",
        }
      );
      const txt = await res.text();
      const json = txt ? JSON.parse(txt) : null;
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      const items: ProductFileRow[] = json?.items || [];
      setProductFiles(items);

      // 同步更新上層產品表的 datasheetCount
      setProducts((prev) =>
        prev.map((p) =>
          p.id === pid ? { ...p, datasheetCount: items.length } : p
        )
      );

      // 分頁維持
      if (opts.keepPfPage) {
        const newPageCount = Math.max(
          1,
          Math.ceil(items.length / PF_PAGE_SIZE)
        );
        setPfPage(Math.min(prevPfPage, newPageCount));
      } else {
        setPfPage(1);
      }

      // 展開維持
      if (opts.preserveExpanded) {
        const next: Record<string, boolean> = {};
        for (const it of items) if (prevExpanded[it.id]) next[it.id] = true;
        if (opts.keepOpenId) next[opts.keepOpenId] = true;
        setExpanded(next);
      } else {
        setExpanded({});
      }
    } catch (e) {
      console.error("GET /api/product-files failed", e);
      setProductFiles([]);
      if (!opts.keepPfPage) setPfPage(1);
      if (!opts.preserveExpanded) setExpanded({});
    } finally {
      setFilesLoading(false);
    }
  };

  const openDatasheet = async (p: ProductRow) => {
    setModalProduct(p);
    await refreshFiles(p.id, { preserveExpanded: true });
  };
  const closeDatasheet = () => {
    setModalProduct(null);
    setProductFiles([]);
    setPfPage(1);
    setExpanded({});
    setUploadOpen(false);
    setEditTarget(null);
  };
  const toggleRow = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  // P/N 分頁
  const pfTotal = productFiles.length;
  const pfPageCount = Math.max(1, Math.ceil(pfTotal / PF_PAGE_SIZE));
  const pfPaged = useMemo(() => {
    const start = (pfPage - 1) * PF_PAGE_SIZE;
    return productFiles.slice(start, start + PF_PAGE_SIZE);
  }, [productFiles, pfPage]);

  // 刪除整筆 ProductFile（含資料夾）
  const onDeleteProductFile = async (id: string) => {
    if (!modalProduct) return;
    if (!confirm(t.modal.deleteConfirm)) return;

    const res = await fetch(`/api/product-files?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const txt = await res.text();
    const json = txt ? JSON.parse(txt) : null;
    if (!res.ok) {
      alert(json?.error || `${t.modal.deleteFailed} (${res.status})`);
      return;
    }
    await refreshFiles(modalProduct.id, {
      preserveExpanded: true,
      keepPfPage: true,
    });
  };

  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
        <FileText className="h-7 w-7" aria-hidden="true" />
        <span>{t.title}</span>
      </h1>

      {/* 工具列：搜尋 + isPropertyManaged 篩選 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div role="search" className="flex flex-1 items-center gap-2">
          <input
            id="products-search"
            data-stop-hotkeys="true"
            type="text"
            autoComplete="off"
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            placeholder={t.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              // @ts-ignore
              if (
                typeof (e.nativeEvent as any).stopImmediatePropagation ===
                "function"
              )
                (e.nativeEvent as any).stopImmediatePropagation();
              if (e.key === "Enter") e.preventDefault();
            }}
            onKeyUp={(e) => e.stopPropagation()}
            onKeyPress={(e) => e.stopPropagation()}
            aria-label={t.searchPlaceholder}
          />
          <select
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100"
            value={pmFilter}
            onChange={(e) => setPmFilter(e.target.value as PMFilter)}
            title={t.pm_title}
            aria-label={t.pm_title}
          >
            <option value="all">{t.filter_all}</option>
            <option value="true">{t.filter_pm}</option>
            <option value="false">{t.filter_non_pm}</option>
          </select>
          <div className="text-xs text-gray-500 shrink-0">
            {loading
              ? t.counterLoading
              : fmt(t.counterFmt, { count: products.length, total })}
          </div>
        </div>
        {errorMsg && (
          <div className="text-sm px-3 py-2 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            {errorMsg}
          </div>
        )}
      </div>

      {/* 產品表格 */}
      <div className="overflow-x-auto relative">
        {loading && (
          <div className="absolute right-3 top-2 text-xs opacity-70 pointer-events-none">
            {t.loading}
          </div>
        )}

        <table
          className="min-w-full divide-y divide-gray-200 dark:divide-gray-700"
          role="table"
          aria-label="products"
        >
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-200">
                {t.table.image}
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-200">
                {t.table.name}
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-200">
                {t.table.model}
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-200">
                {t.table.brand}
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-200">
                {t.table.spec}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-gray-500 dark:text-gray-400"
                >
                  {t.loading}
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-gray-500 dark:text-gray-400"
                >
                  {t.noData}
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="group">
                  <td className="px-4 py-3">
                    {validImg(p.imageUrl) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl!}
                        alt={p.name}
                        className="h-12 w-12 object-contain rounded"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display =
                            "none";
                          (
                            e.currentTarget.nextElementSibling as HTMLElement
                          )?.classList.remove("hidden");
                        }}
                      />
                    ) : null}
                    <div
                      className={`h-12 w-12 rounded bg-gray-200 ${
                        validImg(p.imageUrl) ? "hidden" : ""
                      }`}
                    />
                  </td>
                  <td className="px-4 py-3">{p.name || "-"}</td>
                  <td className="px-4 py-3">{p.model || "-"}</td>
                  <td className="px-4 py-3">{p.brand || "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 w-full">
                      <span
                        className="min-w-0 flex-1 text-gray-800 dark:text-gray-200"
                        title={p.specifications}
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical" as any,
                          overflow: "hidden",
                          maxHeight: "3.2rem",
                          wordBreak: "break-word",
                        }}
                      >
                        {p.specifications || "-"}
                      </span>

                      <button
                        type="button"
                        onClick={() => openDatasheet(p)}
                        className="shrink-0 ml-auto px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                        title={t.btnDatasheetsTitle}
                        aria-label={t.btnDatasheetsTitle}
                      >
                        {t.btnDatasheets}
                        {p.datasheetCount ? ` (${p.datasheetCount})` : ""}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 產品分頁器 */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          {fmt(t.paginationFmt, { pageSize: PAGE_SIZE, total })}
        </div>
        <div className="inline-flex items-center gap-2">
          <button
            className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
            onClick={() => setPage(1)}
            disabled={page === 1}
            aria-label="first page"
            title="«"
          >
            «
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label="previous page"
            title="‹"
          >
            ‹
          </button>
          <span className="text-sm tabular-nums">
            {page} / {pageCount}
          </span>
          <button
            className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={page === pageCount}
            aria-label="next page"
            title="›"
          >
            ›
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
            onClick={() => setPage(pageCount)}
            disabled={page === pageCount}
            aria-label="last page"
            title="»"
          >
            »
          </button>
        </div>
      </div>

      {/* ====== Datasheet Modal ====== */}
      {modalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeDatasheet}
          />
          <div className="relative z-10 w-[min(100%,1000px)] max-h-[85vh] overflow-hidden rounded-2xl bg-white dark:bg-gray-900 shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {fmt(t.modal.titleTpl, {
                  brand: modalProduct.brand,
                  model: modalProduct.model,
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                >
                  {t.modal.add}
                </button>
                <button
                  type="button"
                  onClick={closeDatasheet}
                  className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                >
                  {t.modal.close}
                </button>
              </div>
            </div>

            {/* 檔案表格（第一欄：縮放 + P/N & Description） */}
            <div className="p-4 overflow-auto max-h-[70vh]">
              {filesLoading ? (
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  {t.loading}
                </div>
              ) : productFiles.length === 0 ? (
                <div className="text-sm text-gray-500">
                  {t.modal.noDatasheets}
                </div>
              ) : (
                <>
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-gray-700 dark:text-gray-200 w-56">
                          {t.modal.headers.pnDesc}
                        </th>
                        <th className="px-4 py-3 text-left text-gray-700 dark:text-gray-200">
                          {t.modal.headers.files}
                        </th>
                        <th className="px-4 py-3 text-left text-gray-700 dark:text-gray-200 w-40">
                          {t.modal.headers.updated}
                        </th>
                        <th className="px-4 py-3 text-left text-gray-700 dark:text-gray-200 w-24">
                          {t.modal.headers.actions}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {pfPaged.map((pf) => {
                        const imgN = pf.files?.image?.length || 0;
                        const pdfN = pf.files?.pdf?.length || 0;
                        const vidN = pf.files?.video?.length || 0;
                        const isOpen = !!expanded[pf.id];

                        return (
                          <React.Fragment key={pf.id}>
                            <tr>
                              {/* 第一欄：縮放 + P/N & Description */}
                              <td className="px-4 py-3 align-top">
                                <div className="flex items-start gap-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleRow(pf.id)}
                                    className="px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    title={
                                      isOpen ? t.modal.collapse : t.modal.expand
                                    }
                                    aria-label={
                                      isOpen ? t.modal.collapse : t.modal.expand
                                    }
                                  >
                                    {isOpen ? "–" : "+"}
                                  </button>
                                  <div className="min-w-0">
                                    <div className="font-medium text-gray-900 dark:text-gray-100 break-words">
                                      {pf.partNumber || "-"}
                                    </div>
                                    <div className="text-xs text-gray-600 dark:text-gray-300 break-words mt-1">
                                      {pf.description || "-"}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* 第二欄：未展開顯示數量；展開改在下一列顯示清單 */}
                              <td className="px-4 py-3 align-top">
                                {!isOpen ? (
                                  <div className="text-gray-700 dark:text-gray-200">
                                    {t.modal.image}: {imgN}, {t.modal.pdf}:{" "}
                                    {pdfN}, {t.modal.video}: {vidN}
                                  </div>
                                ) : (
                                  <div className="text-gray-500">
                                    {t.modal.seeBelow}
                                  </div>
                                )}
                              </td>

                              {/* 第三欄：Updated */}
                              <td className="px-4 py-3 align-top text-xs text-gray-500">
                                {new Date(pf.updatedAt).toLocaleString()}
                              </td>

                              {/* 第四欄：Actions */}
                              <td className="px-4 py-3 align-top">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditTarget(pf);
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                                    title={t.modal.edit}
                                  >
                                    {t.modal.edit}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onDeleteProductFile(pf.id)}
                                    className="px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
                                    title={t.modal.remove}
                                  >
                                    {t.modal.remove}
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* 展開內容：分組檔案清單 */}
                            {isOpen && (
                              <tr className="bg-gray-50/60 dark:bg-gray-800/50">
                                <td className="px-4 py-3 align-top"></td>
                                <td className="px-4 py-3 align-top" colSpan={3}>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {(["image", "pdf", "video"] as const).map(
                                      (cat) => {
                                        const arr =
                                          (pf.files?.[cat] as string[]) || [];
                                        if (arr.length === 0) return null;
                                        return (
                                          <div key={cat}>
                                            <div className="text-xs uppercase text-gray-500 mb-1">
                                              {t.modal[cat]}
                                            </div>
                                            <ul className="space-y-1">
                                              {arr.map((fname) => (
                                                <li
                                                  key={fname}
                                                  className="flex items-center gap-2"
                                                >
                                                  <a
                                                    className="text-indigo-600 hover:underline max-w-[24ch] truncate inline-block align-bottom"
                                                    href={`/product_files/${
                                                      pf.id
                                                    }/${encodeURIComponent(
                                                      fname
                                                    )}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    title={
                                                      fname.length <= 80
                                                        ? fname
                                                        : undefined
                                                    }
                                                  >
                                                    {fname.length > 50
                                                      ? t.modal.nameHidden
                                                      : displayName(fname)}
                                                  </a>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        );
                                      }
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* P/N 分頁器 */}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      {fmt(t.pnPaginationFmt, {
                        pageSize: PF_PAGE_SIZE,
                        total: pfTotal,
                      })}
                    </div>
                    <div className="inline-flex items-center gap-2">
                      <button
                        className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                        onClick={() => setPfPage(1)}
                        disabled={pfPage === 1}
                        aria-label="first page"
                        title="«"
                      >
                        «
                      </button>
                      <button
                        className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                        onClick={() => setPfPage((p) => Math.max(1, p - 1))}
                        disabled={pfPage === 1}
                        aria-label="previous page"
                        title="‹"
                      >
                        ‹
                      </button>
                      <span className="text-sm tabular-nums">
                        {pfPage} / {pfPageCount}
                      </span>
                      <button
                        className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                        onClick={() =>
                          setPfPage((p) => Math.min(pfPageCount, p + 1))
                        }
                        disabled={pfPage === pfPageCount}
                        aria-label="next page"
                        title="›"
                      >
                        ›
                      </button>
                      <button
                        className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                        onClick={() => setPfPage(pfPageCount)}
                        disabled={pfPage === pfPageCount}
                        aria-label="last page"
                        title="»"
                      >
                        »
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 編輯 Modal（沿用你的元件） */}
          {editTarget && (
            <ProductFileEditModal
              isOpen={!!editTarget}
              productFile={editTarget}
              onClose={async (changed: boolean) => {
                const keepId = editTarget?.id;
                setEditTarget(null);
                if (changed && modalProduct && keepId) {
                  await refreshFiles(modalProduct.id, {
                    preserveExpanded: true,
                    keepOpenId: keepId,
                    keepPfPage: true,
                  });
                }
              }}
            />
          )}

          {/* 上傳 Modal：成功或關閉時刷新 */}
          {uploadOpen && modalProduct && (
            <FileUploadModal
              isOpen={uploadOpen}
              productId={modalProduct.id}
              onClose={async () => {
                setUploadOpen(false);
                await refreshFiles(modalProduct.id, {
                  preserveExpanded: true,
                  keepPfPage: true,
                });
              }}
              currentLanguageData={{ FileUploadModal: {} } as any}
            />
          )}
        </div>
      )}
    </div>
  );
}
