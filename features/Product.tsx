// features/Product.tsx
"use client";
import { Tags } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";

// i18n
import { useLanguage } from "@/src/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

/* ====================== 工具 ====================== */
const abortableFetcher = (url: string) => {
  const ac = new AbortController();
  const p = fetch(url, { signal: ac.signal }).then(async (r) => {
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`${r.status} ${r.statusText}${txt ? `: ${txt}` : ""}`);
    }
    return r.json();
  });
  // SWR 會回收不用；但保留返回值可供外界取消
  (p as any).cancel = () => ac.abort();
  return p;
};

const safeNum = (x: unknown, fallback = 0) =>
  typeof x === "number" && isFinite(x) ? x : fallback;

const toCurrency = (n: number | null | undefined, locale: string) =>
  n == null
    ? "—"
    : new Intl.NumberFormat(locale || undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(Number(n));

/* ====================== 型別 ====================== */
type Product = {
  id: string;
  name: string;
  brand: string;
  model: string;
  specifications: string;
  price: number | null;
  imageLink: string | null;
  localImage: string | null;
  isPropertyManaged: boolean;
};
type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
type ProductsResp = { items: Product[]; page: PageMeta };

type UsageResp = {
  ok: true;
  items: Array<{
    id: string;
    stockCount: number;
    canDelete: boolean;
    hasShortTerm: boolean; // ★ 新增
  }>;
};

type AnalyzerResult = {
  name?: string | null;
  brand?: string | null;
  model?: string | null;
  spec?: string | null;
  price?: number | null;
  imagelink?: string | null;
};

/* ====================== 主頁面 ====================== */
export default function AdminProductsPage() {
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const dict = tMap[language] || zhTW;
  const tAdd = dict.Admin?.AddProduct ?? {};
  const tEdit = dict.Admin?.EditProducts ?? {};
  const tModal = dict.Admin?.EditModal ?? {};

  /* ------------ 檢索條件 ------------ */
  const [qRaw, setQRaw] = useState("");
  const [q, setQ] = useState(""); // 防抖後的查詢字串
  const [isPM, setIsPM] = useState<"all" | "true" | "false">("all");
  const [page, setPage] = useState(1);
  const limit = 20;

  // 搜尋防抖
  useEffect(() => {
    const id = setTimeout(() => setQ(qRaw), 300);
    return () => clearTimeout(id);
  }, [qRaw]);

  // 排序
  type SortBy = "name" | "model" | "brand" | "price";
  type SortDir = "asc" | "desc";
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const listKey = useMemo(() => {
    const u = new URLSearchParams();
    if (isPM !== "all") u.set("isPM", isPM);
    if (q.trim()) u.set("q", q.trim());
    u.set("page", String(page));
    u.set("limit", String(limit));
    u.set("sortBy", sortBy);
    u.set("sortDir", sortDir);
    return `/api/products/sort?${u.toString()}`;
  }, [q, isPM, page, sortBy, sortDir]);

  const { data, error, isLoading, mutate } = useSWR<ProductsResp>(
    listKey,
    abortableFetcher,
    {
      revalidateOnFocus: true,
      keepPreviousData: true,
    }
  );

  // 搜尋/篩選改變 → 回第 1 頁
  useEffect(() => {
    setPage(1);
  }, [q, isPM]);

  /* ------------ 取 usage（canDelete/stockCount/hasShortTerm） ------------ */
  const ids = (data?.items ?? []).map((p) => p.id);
  const usageKey = ids.length
    ? `/api/products/usage?ids=${ids.join(",")}`
    : null;
  const { data: usageData } = useSWR<UsageResp>(usageKey, abortableFetcher, {
    revalidateOnFocus: false,
  });
  const usageMap = useMemo(() => {
    const m = new Map<
      string,
      { stockCount: number; canDelete: boolean; hasShortTerm: boolean }
    >();
    for (const u of usageData?.items ?? [])
      m.set(u.id, {
        stockCount: u.stockCount,
        canDelete: u.canDelete,
        hasShortTerm: !!u.hasShortTerm,
      });
    return m;
  }, [usageData]);

  /* ------------ 新增表單 ------------ */
  const [form, setForm] = useState({
    name: "",
    brand: "",
    model: "",
    specifications: "",
    price: 0 as number | "",
    imageLink: "",
    isPropertyManaged: false,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  // ★ 新增：本機檔案（新增用）
  const [file, setFile] = useState<File | null>(null);

  // 新增頁預覽 URL（避免每次 render 都 createObjectURL）
  const addPreviewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  );
  useEffect(() => {
    return () => {
      if (addPreviewUrl) URL.revokeObjectURL(addPreviewUrl);
    };
  }, [addPreviewUrl]);

  const canSubmit =
    form.name.trim().length > 0 &&
    form.brand.trim().length > 0 &&
    form.model.trim().length > 0 &&
    form.specifications.trim().length > 0 &&
    form.price !== "" &&
    Number(form.price) >= 0;

  const handleAdd = async () => {
    if (!canSubmit || posting) return;
    setPosting(true);
    setMsg(null);

    try {
      // 1) 先建立產品
      const res = await fetch("/api/products/sort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          brand: form.brand.trim(),
          model: form.model.trim(),
          specifications: form.specifications.trim(),
          price: Number(form.price) || 0,
          imageLink: form.imageLink.trim() || null,
          isPropertyManaged: !!form.isPropertyManaged,
        }),
      });
      const j = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);

      let uploadMsg = "";
      const createdId: string | undefined = j?.id;

      // 2) 若有選本機檔案則上傳
      if (createdId && file) {
        try {
          const fd = new FormData();
          fd.append("file", file, file.name);
          const up = await fetch(`/api/products/sort/${createdId}/image`, {
            method: "POST",
            body: fd,
          });
          if (!up.ok) {
            const uj = await up.json().catch(() => ({} as any));
            uploadMsg =
              " / " +
              (uj?.message || (tAdd.image_upload_failed ?? "圖片上傳失敗"));
          } else {
            uploadMsg = " / " + (tAdd.image_upload_ok ?? "圖片已上傳");
          }
        } catch {
          uploadMsg = " / " + (tAdd.image_upload_failed ?? "圖片上傳失敗");
        }
      }

      // 3) 成功訊息 + 重置表單
      setMsg(
        (tAdd.addProduct_success_with_image ?? "新增成功（已處理圖片）") +
          uploadMsg
      );
      setForm({
        name: "",
        brand: "",
        model: "",
        specifications: "",
        price: 0,
        imageLink: "",
        isPropertyManaged: false,
      });
      setFile(null); // 清除檔案
      // 4) 刷新列表（無論是否有上傳圖片）
      mutate();
    } catch (e: any) {
      setMsg(e?.message || (tAdd.addProduct_fail ?? "新增失敗"));
    } finally {
      setPosting(false);
    }
  };

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);

  /* ------------ 解析器（可選） ------------ */
  const [url, setUrl] = useState("");
  const [aLoading, setALoading] = useState(false);
  const [aError, setAError] = useState<string | null>(null);
  const [aResult, setAResult] = useState<AnalyzerResult | null>(null);
  const [overwrite, setOverwrite] = useState(false);

  const onAnalyze = async () => {
    if (!url) return;
    setALoading(true);
    setAError(null);
    setAResult(null);
    try {
      const res = await fetch("/api/products/analyze_product_info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as AnalyzerResult | { error?: string };
      if (!res.ok || (data as any)?.error) {
        setAError((data as any)?.error || "Request failed");
      } else {
        setAResult(data as AnalyzerResult);
      }
    } catch (e: any) {
      setAError(e?.message || "Network error");
    } finally {
      setALoading(false);
    }
  };

  const fillFromAnalyzer = useCallback(() => {
    if (!aResult) return;
    const mapped = {
      name: (aResult.name ?? "").trim(),
      brand: (aResult.brand ?? "").trim(),
      model: (aResult.model ?? "").trim(),
      specifications: (aResult.spec ?? "").trim(),
      price: safeNum(aResult.price, 0),
      imageLink: (aResult.imagelink ?? "").trim(),
    };
    setForm((prev) => {
      const next = { ...prev };
      const merge = (curr: string, incoming: string) =>
        overwrite || !curr.trim() ? incoming : curr;

      next.name = merge(prev.name, mapped.name);
      next.brand = merge(prev.brand, mapped.brand);
      next.model = merge(prev.model, mapped.model);
      next.specifications = merge(prev.specifications, mapped.specifications);

      if (overwrite || prev.price === "" || Number(prev.price) === 0) {
        next.price = mapped.price;
      }
      next.imageLink =
        overwrite || !prev.imageLink ? mapped.imageLink : prev.imageLink;
      return next;
    });
    setMsg(
      language === "en-US" ? "Applied analysis to form" : "已套用解析結果到表單"
    );
  }, [aResult, overwrite, language]);

  /* ------------ 編輯 Modal ------------ */
  const [editing, setEditing] = useState<Product | null>(null);
  const [editFile, setEditFile] = useState<File | null>(null);
  // 編輯頁預覽 URL
  const editPreviewUrl = useMemo(
    () => (editFile ? URL.createObjectURL(editFile) : null),
    [editFile]
  );
  useEffect(() => {
    return () => {
      if (editPreviewUrl) URL.revokeObjectURL(editPreviewUrl);
    };
  }, [editPreviewUrl]);

  const [editDraft, setEditDraft] = useState({
    name: "",
    brand: "",
    model: "",
    specifications: "",
    price: 0 as number | "",
    imageLink: "",
    isPropertyManaged: false,
  });
  const [saving, setSaving] = useState(false);

  const openEdit = (p: Product) => {
    const u = usageMap.get(p.id);
    const locked = !!u?.hasShortTerm; // ★ 有 short_term → 鎖定
    setEditing(p);
    setEditDraft({
      name: p.name || "",
      brand: p.brand || "",
      model: p.model || "",
      specifications: p.specifications || "",
      price: Number(p.price ?? 0),
      imageLink: p.imageLink || "",
      isPropertyManaged: locked ? true : !!p.isPropertyManaged, // ★ 鎖定時強制 true
    });
    setEditFile(null);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const u = usageMap.get(editing.id);
      const locked = !!u?.hasShortTerm; // ★

      const res = await fetch(`/api/products/sort/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editDraft.name.trim(),
          brand: editDraft.brand.trim(),
          model: editDraft.model.trim(),
          specifications: editDraft.specifications.trim(),
          price: editDraft.price === "" ? 0 : Number(editDraft.price),
          imageLink: editDraft.imageLink.trim() || null,
          isPropertyManaged: locked ? true : !!editDraft.isPropertyManaged, // ★ 鎖定時一律 true
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);
      setEditing(null);
      mutate(); // refresh list
      setMsg(tEdit.editProduct_success ?? "已更新");
    } catch (e: any) {
      setMsg(tEdit.editProduct_fail ?? e?.message ?? "更新失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Product) => {
    const usage = usageMap.get(p.id);
    if (!usage?.canDelete) return; // 前端再擋一次
    if (
      !confirm(
        (tEdit.delete_confirm ?? "確認刪除？") + `\n${p.brand} ${p.model}`
      )
    )
      return;
    try {
      const res = await fetch(`/api/products/sort/${p.id}`, {
        method: "DELETE",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`);
      mutate();
      setMsg(tEdit.delete_success ?? "刪除成功");
    } catch (e: any) {
      setMsg((tEdit.delete_failed ?? "刪除失敗") + "：" + (e?.message || e));
    }
  };

  const locale = language || "en-US";

  /* ====================== UI ====================== */
  const pageSummary = (pg: PageMeta | undefined) => {
    if (!pg) return "";
    // i18n 模板：pageSize / total
    const tpl = tEdit.page_summary as string | undefined;
    if (!tpl) return `${pg.pageSize} / ${pg.total}`;
    return tpl
      .replace("{pageSize}", String(pg.pageSize))
      .replace("{total}", String(pg.total));
  };

  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      {/* ====== 新增產品區 ====== */}
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
        <Tags className="h-7 w-7" aria-hidden="true" />
        <span>{tAdd.title_product}</span>
      </h1>

      {/* 解析器（可選） */}
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2 bg-gray-50 dark:bg-gray-700 text-black dark:text-white"
          placeholder={tAdd.urlPlaceholder}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url && !aLoading) onAnalyze();
          }}
          aria-label="Product URL"
        />
        <button
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          onClick={onAnalyze}
          disabled={!url || aLoading}
          title="Analyze product URL"
        >
          {aLoading ? "Analyzing..." : "Analyze"}
        </button>
      </div>
      {aError && <div className="text-red-600">{String(aError)}</div>}
      {aResult && (
        <div className="rounded border bg-white/50 dark:bg-gray-800/50 p-3 space-y-3">
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <KV k="Name" v={aResult.name ?? ""} />
            <KV k="Brand" v={aResult.brand ?? ""} />
            <KV k="Model" v={aResult.model ?? ""} />
            <KV k="Spec" v={aResult.spec ?? ""} />
            <KV k="Price" v={String(safeNum(aResult.price, 0))} />
            <KV k="Image" v={aResult.imagelink ?? ""} />
          </div>
          {aResult.imagelink ? (
            <img
              src={aResult.imagelink}
              alt="product preview"
              className="max-h-48 rounded border bg-white"
            />
          ) : null}
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
              {tAdd.overwrite ?? "覆蓋非空欄位"}
            </label>
            <button
              className="px-4 py-2 rounded bg-sky-600 text-white hover:bg-sky-700"
              onClick={fillFromAnalyzer}
            >
              {tAdd.fill_from_analyzer ?? "套用解析結果到表單"}
            </button>
          </div>
        </div>
      )}

      {/* 新增表單 */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Field
          label={tAdd.name ?? "名稱"}
          value={form.name}
          onChange={(v) => setForm((s) => ({ ...s, name: v }))}
        />
        <Field
          label={tAdd.model ?? "型號"}
          value={form.model}
          onChange={(v) => setForm((s) => ({ ...s, model: v }))}
        />
        <Field
          label={tAdd.brand ?? "品牌"}
          value={form.brand}
          onChange={(v) => setForm((s) => ({ ...s, brand: v }))}
        />
        <Field
          label={tAdd.specifications ?? "規格"}
          value={form.specifications}
          onChange={(v) => setForm((s) => ({ ...s, specifications: v }))}
        />

        <div>
          <label className="block text-sm mb-1">{tAdd.price ?? "價格"}</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700 text-black dark:text-white"
            value={form.price}
            onChange={(e) =>
              setForm((s) => ({
                ...s,
                price: e.target.value === "" ? "" : Number(e.target.value),
              }))
            }
            aria-label="Price"
          />
        </div>

        <Field
          label={tAdd.imageLink ?? "圖片連結"}
          type="url"
          value={form.imageLink}
          onChange={(v) => setForm((s) => ({ ...s, imageLink: v }))}
          placeholder="https://example.com/image.jpg"
        />
        <div>
          <label className="block text-sm mb-1">
            {tAdd.local_image ?? "本機圖片（可選）"}
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700 text-black dark:text-white"
          />
          {addPreviewUrl && (
            <div className="mt-2">
              <img
                src={addPreviewUrl}
                alt="preview"
                className="h-24 rounded border bg-white"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            id="isPM"
            type="checkbox"
            checked={form.isPropertyManaged}
            onChange={(e) =>
              setForm((s) => ({ ...s, isPropertyManaged: e.target.checked }))
            }
          />
          <label htmlFor="isPM" className="text-sm">
            {tAdd.isPropertyManaged ?? "財產管理（PM）"}
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          className="mt-2 bg-sky-600 hover:bg-sky-700 text-white px-6 py-2 rounded-md disabled:opacity-50"
          disabled={!canSubmit || posting}
          onClick={handleAdd}
          aria-disabled={!canSubmit || posting}
        >
          {posting
            ? tAdd.loading ?? "Saving…"
            : tAdd.add_product ?? "Add product"}
        </button>
        {msg && (
          <span
            className="mt-2 p-2 bg-green-100 text-green-800 rounded"
            role="status"
          >
            {msg}
          </span>
        )}
      </div>

      <hr className="my-4 h-px border-0 bg-gray-300/100" />
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
        <Tags className="h-7 w-7" aria-hidden="true" />
        <span>{tAdd.title_product2}</span>
      </h1>
      {/* ====== 篩選 + 排序 ====== */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div className="flex gap-2 flex-1">
          <input
            className="flex-1 border rounded px-3 py-2 bg-gray-50 dark:bg-gray-700 text-black dark:text-white"
            placeholder={tEdit.search || "搜尋產品…"}
            value={qRaw}
            onChange={(e) => setQRaw(e.target.value)}
            aria-label="Search"
          />
        </div>

        <div className="flex gap-2">
          <select
            className="px-3 py-2 border rounded bg-white dark:bg-gray-700 text-black dark:text-white"
            value={isPM}
            onChange={(e) => {
              setIsPM(e.target.value as any);
              setPage(1);
            }}
            title="PM filter"
            aria-label="PM filter"
          >
            <option value="all">{tEdit.filter_all ?? "全部"}</option>
            <option value="true">{tAdd.isPropertyManaged ?? "財產管理"}</option>
            <option value="false">{tEdit.non_pm ?? "非財產"}</option>
          </select>

          <select
            className="px-3 py-2 border rounded bg-white dark:bg-gray-700 text-black dark:text-white"
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [by, dir] = e.target.value.split(":") as [SortBy, SortDir];
              setSortBy(by);
              setSortDir(dir);
              setPage(1);
            }}
            aria-label="Sort"
          >
            <option value="name:asc">{tEdit.name ?? "名稱"} ↑</option>
            <option value="name:desc">{tEdit.name ?? "名稱"} ↓</option>
            <option value="model:asc">{tEdit.model ?? "型號"} ↑</option>
            <option value="model:desc">{tEdit.model ?? "型號"} ↓</option>
            <option value="brand:asc">{tEdit.brand ?? "廠牌"} ↑</option>
            <option value="brand:desc">{tEdit.brand ?? "廠牌"} ↓</option>
            <option value="price:asc">{tEdit.price ?? "價格"} ↑</option>
            <option value="price:desc">{tEdit.price ?? "價格"} ↓</option>
          </select>
        </div>

        {isLoading && (
          <div className="opacity-70 text-sm" role="status">
            {tEdit.loading || "載入中…"}
          </div>
        )}
      </div>

      {/* ====== 產品清單（雙欄卡片） ====== */}
      {error ? (
        <div className="p-3 bg-red-100 text-red-700 rounded">
          {tEdit.load_fail || "載入失敗"}：{String(error.message)}
        </div>
      ) : !data ? (
        <div className="p-3">{tEdit.loading || "載入中…"}</div>
      ) : data.items.length === 0 ? (
        <div className="p-6 text-center text-gray-500 dark:text-gray-400">
          {language === "en-US" ? "No products found." : "沒有符合條件的產品。"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.items.map((p) => {
              const u = usageMap.get(p.id);
              const canDelete = u?.canDelete ?? true;
              const stockCount = u?.stockCount ?? 0;
              const locked = !!u?.hasShortTerm;
              return (
                <article
                  key={p.id}
                  className="group rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden hover:shadow transition"
                  aria-label={`${p.brand} ${p.model}`}
                >
                  <div className="p-4 flex items-start gap-3">
                    <Thumb64
                      src={p.localImage || p.imageLink}
                      alt={p.name || p.model}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="font-medium truncate">
                        {p.name || "-"}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {p.brand} / {p.model}
                      </div>
                      {/* 規格顯示 */}
                      <div className="text-xs text-gray-600 dark:text-gray-300 break-words">
                        {p.specifications || "—"}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        {toCurrency(p.price, locale)}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {(tEdit.stock_count ?? "庫存筆數") + "：" + stockCount}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                            p.isPropertyManaged
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-200"
                          }`}
                          aria-label="PM Tag"
                        >
                          {p.isPropertyManaged
                            ? tEdit.badge_pm ?? "Property-Managed"
                            : tEdit.badge_nonpm ?? "Non-PM"}
                        </span>
                        {locked && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            {tEdit.badge_locked ?? "Locked"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <button
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200"
                        onClick={() => openEdit(p)}
                        title={tEdit.edit_product || "Edit product"}
                      >
                        {tEdit.edit || "編輯"}
                      </button>
                      <button
                        className={
                          "inline-flex items-center gap-1 px-3 py-1.5 rounded " +
                          (canDelete
                            ? "bg-rose-500 hover:bg-rose-600 text-white"
                            : "bg-gray-300 text-gray-500 cursor-not-allowed")
                        }
                        onClick={() => canDelete && handleDelete(p)}
                        disabled={!canDelete}
                        title={
                          canDelete
                            ? tEdit.delete_product
                            : tEdit.cannot_delete_product
                        }
                        aria-disabled={!canDelete}
                      >
                        {tEdit.delete || "刪除"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* 分頁 */}
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-gray-300">
              {pageSummary(data.page)}
            </div>
            <div className="inline-flex items-center gap-2">
              <button
                className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                onClick={() => setPage(1)}
                disabled={data.page.page === 1}
                title={language === "en-US" ? "First page" : "第一頁"}
                aria-label="First page"
              >
                «
              </button>
              <button
                className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={data.page.page === 1}
                title={language === "en-US" ? "Previous page" : "上一頁"}
                aria-label="Previous page"
              >
                ‹
              </button>

              <span className="text-sm tabular-nums" aria-live="polite">
                {data.page.page} / {data.page.totalPages}
              </span>

              <button
                className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                onClick={() =>
                  setPage((p) => Math.min(data.page.totalPages, p + 1))
                }
                disabled={data.page.page === data.page.totalPages}
                title={language === "en-US" ? "Next page" : "下一頁"}
                aria-label="Next page"
              >
                ›
              </button>
              <button
                className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
                onClick={() => setPage(data.page.totalPages)}
                disabled={data.page.page === data.page.totalPages}
                title={language === "en-US" ? "Last page" : "最後一頁"}
                aria-label="Last page"
              >
                »
              </button>
            </div>
          </div>
        </>
      )}

      {/* 編輯 Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">
                {tModal.title ?? "編輯產品"}
              </h3>
              <button
                className="text-gray-500 hover:underline disabled:opacity-60"
                onClick={() => !saving && setEditing(null)}
                disabled={saving}
              >
                {tModal.close ?? "關閉"}
              </button>
            </div>

            {/* ★ 計算鎖定狀態（Modal 內） */}
            {(() => {
              const isPMLocked = editing
                ? !!usageMap.get(editing.id)?.hasShortTerm
                : false;

              return (
                <>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Field
                      label={tEdit.name}
                      value={editDraft.name}
                      onChange={(v) => setEditDraft((s) => ({ ...s, name: v }))}
                    />
                    <Field
                      label={tEdit.model}
                      value={editDraft.model}
                      onChange={(v) =>
                        setEditDraft((s) => ({ ...s, model: v }))
                      }
                    />
                    <Field
                      label={tEdit.brand}
                      value={editDraft.brand}
                      onChange={(v) =>
                        setEditDraft((s) => ({ ...s, brand: v }))
                      }
                    />
                    <Field
                      label={tEdit.specifications}
                      value={editDraft.specifications}
                      onChange={(v) =>
                        setEditDraft((s) => ({ ...s, specifications: v }))
                      }
                    />
                    <div>
                      <label className="block text-sm mb-1">
                        {tEdit.price ?? "價格"}
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700 text-black dark:text-white"
                        value={editDraft.price}
                        onChange={(e) =>
                          setEditDraft((s) => ({
                            ...s,
                            price:
                              e.target.value === ""
                                ? ""
                                : Number(e.target.value),
                          }))
                        }
                        aria-label="Edit price"
                      />
                    </div>
                    <Field
                      label={tEdit.imageLink ?? "圖片連結"}
                      value={editDraft.imageLink}
                      onChange={(v) =>
                        setEditDraft((s) => ({ ...s, imageLink: v }))
                      }
                    />

                    {/* ★ 你提供的「本機圖片覆蓋」區塊（已整合 + 預覽） */}
                    <div>
                      <label className="block text-sm mb-1">
                        {tEdit.local_image ?? "本機圖片（覆蓋現有）"}
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setEditFile(e.target.files?.[0] ?? null)}
                        className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700 text-black dark:text-white"
                      />
                      {editPreviewUrl && (
                        <div className="mt-2">
                          <img
                            src={editPreviewUrl}
                            alt="new image preview"
                            className="h-24 rounded border bg-white"
                          />
                        </div>
                      )}
                      <button
                        className="mt-2 px-3 py-2 rounded bg-slate-800 text-white disabled:opacity-50"
                        disabled={!editing || !editFile}
                        onClick={async () => {
                          if (!editing || !editFile) return;
                          const fd = new FormData();
                          fd.append("file", editFile, editFile.name);
                          const up = await fetch(
                            `/api/products/sort/${editing.id}/image`,
                            {
                              method: "POST",
                              body: fd,
                            }
                          );
                          const uj = await up.json().catch(() => ({}));
                          if (!up.ok) {
                            alert((uj as any)?.message || "Upload failed");
                          } else {
                            setMsg(tEdit.editProduct_success ?? "圖片已更新");
                            setEditFile(null);
                            mutate();
                          }
                        }}
                      >
                        {tEdit.upload ?? "上傳本機圖片"}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id="modal-isPM"
                        type="checkbox"
                        checked={editDraft.isPropertyManaged}
                        onChange={(e) =>
                          setEditDraft((s) => ({
                            ...s,
                            isPropertyManaged: e.target.checked,
                          }))
                        }
                        disabled={isPMLocked} // ★ 鎖定禁用
                        title={isPMLocked ? tEdit.pm_locked_hint : undefined}
                      />
                      <label htmlFor="modal-isPM" className="text-sm">
                        {tAdd.isPropertyManaged ?? "財產管理（PM）"}
                      </label>
                      {isPMLocked && (
                        <span className="text-xs text-amber-600">
                          {tEdit.pm_locked_hint}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      className="px-3 py-2 rounded bg-gray-300 dark:bg-gray-700 disabled:opacity-60"
                      onClick={() => setEditing(null)}
                      disabled={saving}
                    >
                      {tModal.cancel ?? "取消"}
                    </button>
                    <button
                      className="px-3 py-2 rounded bg-indigo-600 text-white disabled:opacity-60"
                      onClick={saveEdit}
                      disabled={saving}
                    >
                      {saving
                        ? tModal.saving ?? "儲存中…"
                        : tModal.save ?? "儲存"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

/* ====================== 小元件 ====================== */
type FieldProps = {
  label?: string;
  value: string | number | "";
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
};
const Field = React.memo(function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: FieldProps) {
  return (
    <div>
      {label && <label className="block text-sm mb-1">{label}</label>}
      <input
        type={type}
        className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700 text-black dark:text-white"
        value={value as any}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
});

const KV = React.memo(function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="text-sm">
      <div className="text-gray-500">{k}</div>
      <div className="font-medium break-all">{v || "—"}</div>
    </div>
  );
});

const Thumb64 = React.memo(function Thumb64({
  src,
  alt,
}: {
  src?: string | null;
  alt: string;
}) {
  const url = src && /^(https?:\/\/|\/)/i.test(src) ? src : "/placeholder.svg";
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt={alt || "product image"}
      className="w-16 h-16 object-contain rounded border bg-white flex-shrink-0"
    />
  );
});
