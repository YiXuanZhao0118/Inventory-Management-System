// pages/admin/Product/AddProduct.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";
import { renderSegments } from "@/lib/i18n/renderSegments";
import { fetcher } from "@/services/apiClient";

// ---- 型別 ----
type ProductItem = {
  id: string;
  name: string;
  brand: string;
  model: string;
  specifications: string;
  price: number;
  imageLink: string;
  localImage: string | null;
  isPropertyManaged: boolean;
};

type ProductForm = {
  name: string;
  brand: string;
  model: string;
  specifications: string;
  price: number | "";
  imageLink: string;
  isPropertyManaged: boolean;
};

type AnalyzerResult = {
  name?: string | null;
  brand?: string | null;
  model?: string | null;
  spec?: string | null;
  price?: number | null;
  imagelink?: string | null;
};

// ---- 小工具 ----
const normalize = (s: string) => s.trim().toLowerCase();
const safeNum = (x: unknown, fallback = 0) =>
  typeof x === "number" && isFinite(x) ? x : fallback;

// ---- 主頁面 ----
export default function AddProductPage() {
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, de: deDE };
  const t = (tMap[language] || zhTW).Admin.AddProduct;

  // 表單
  const [form, setForm] = useState<ProductForm>({
    name: "",
    brand: "",
    model: "",
    specifications: "",
    price: 0,
    imageLink: "",
    isPropertyManaged: false,
  });

  // 清單與新增
  const { data: allProducts = [], mutate } = useSWR<ProductItem[]>("/api/products", fetcher);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit =
    form.name.trim() &&
    form.brand.trim() &&
    form.model.trim() &&
    form.specifications.trim() &&
    form.price !== "" &&
    Number(form.price) >= 0;

  // ====== 解析器（原 get_product_info 嵌入）======
  const [url, setUrl] = useState("");
  const [aLoading, setALoading] = useState(false);
  const [aError, setAError] = useState<string | null>(null);
  const [aResult, setAResult] = useState<AnalyzerResult | null>(null);
  const [overwrite, setOverwrite] = useState(false); // 是否覆蓋非空欄位

  const onAnalyze = async () => {
    if (!url) return;
    setALoading(true);
    setAError(null);
    setAResult(null);
    try {
      const res = await fetch("/api/analyze_product_info", {
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

    // 映射欄位（spec → specifications、imagelink → imageLink）
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

      // 字串欄位：若不覆蓋，只有在目前為空白才填
      const mergeText = (curr: string, incoming: string) =>
        overwrite || !curr.trim() ? incoming : curr;

      next.name = mergeText(prev.name, mapped.name);
      next.brand = mergeText(prev.brand, mapped.brand);
      next.model = mergeText(prev.model, mapped.model);
      next.specifications = mergeText(prev.specifications, mapped.specifications);

      // 數值欄位：若不覆蓋，只有在目前為空字串或 0 時才填
      if (overwrite || prev.price === "" || Number(prev.price) === 0) {
        next.price = mapped.price;
      }

      // imageLink：若不覆蓋，只有在目前為空時才填
      next.imageLink = overwrite || !prev.imageLink ? mapped.imageLink : prev.imageLink;

      return next;
    });

    setMsg("已套用解析結果到表單");
  }, [aResult, overwrite]);

  // ====== 送出新增 ======
  const handleAdd = async () => {
    if (!canSubmit) return;

    // duplicate check: brand + model
    const dup = allProducts.some(
      (p) => normalize(p.brand) === normalize(form.brand) && normalize(p.model) === normalize(form.model)
    );
    if (dup) {
      setMsg(t.addProduct_duplicate_error || "已有此產品");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          brand: form.brand.trim(),
          model: form.model.trim(),
          specifications: form.specifications.trim(),
          price: Number(form.price) || 0,
          imageLink: form.imageLink.trim(), // 後端會嘗試下載
          isPropertyManaged: !!form.isPropertyManaged,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Create failed");

      setMsg(
        json.localImage
          ? (t.addProduct_success_with_image ?? "新增成功（圖片已下載）")
          : (t.addProduct_success_no_image ?? "新增成功（圖片下載失敗，已設為 null）")
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
      setAResult(null);
      mutate();
    } catch (e: any) {
      setMsg(e.message || (t.addProduct_fail ?? "新增失敗"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!msg) return;
    const timer = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(timer);
  }, [msg]);

  // ====== UI ======
  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
        <h1 className="text-3xl font-bold mb-6">{t.title_product}</h1>
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded px-3 py-2 bg-gray-50 dark:bg-gray-700 text-black dark:text-white"
            placeholder={t.urlPlaceholder ?? "Enter product URL to analyze（e.g., https://www.thorlabs.com/thorproduct.cfm?partnumber=KA05）"}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && url && !aLoading) onAnalyze();
            }}
          />
          <button
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
            onClick={onAnalyze}
            disabled={!url || aLoading}
          >
            {aLoading ? "Analyzing..." : "Analyze"}
          </button>
        </div>

        {aError && <div className="text-red-600">Error: {aError}</div>}

        <h2 className="text-3xl font-bold mb-6"></h2>
        
        {aResult && (
          <div className="rounded border bg-white/50 dark:bg-gray-800/50 p-3 space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <KV k="Name" v={aResult.name ?? ""} />
              <KV k="Brand" v={aResult.brand ?? ""} />
              <KV k="Model" v={aResult.model ?? ""} />
              <KV k="Spec" v={aResult.spec ?? ""} />
              <KV k="Price" v={String(safeNum(aResult.price, 0))} />
              <KV k="Image" v={aResult.imagelink ?? ""} />
            </div>
            {aResult.imagelink ? (
              <div className="flex items-start gap-3">
                <img
                  src={aResult.imagelink}
                  alt="product preview"
                  className="max-h-48 rounded border bg-white"
                />
              </div>
            ) : null}

            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                />
                {t.overwrite ?? "覆蓋非空欄位"}
              </label>
              <button
                className="px-4 py-2 rounded bg-sky-600 text-white hover:bg-sky-700"
                onClick={fillFromAnalyzer}
              >
                {t.fill_from_analyzer ?? "套用解析結果到表單"}
              </button>
            </div>
          </div>
        )}

      {/* 新增產品表單 */}

        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <Field label={t.name} value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} />
          <Field label={t.model} value={form.model} onChange={(v) => setForm((s) => ({ ...s, model: v }))} />
          <Field label={t.brand} value={form.brand} onChange={(v) => setForm((s) => ({ ...s, brand: v }))} />
          <Field
            label={t.specifications}
            value={form.specifications}
            onChange={(v) => setForm((s) => ({ ...s, specifications: v }))}
          />

          <div>
            <label className="block text-sm mb-1">{t.price ?? "Price"}</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700 text-black dark:text-white"
              value={form.price}
              onChange={(e) =>
                setForm((s) => ({ ...s, price: e.target.value === "" ? "" : Number(e.target.value) }))
              }
            />
          </div>

          <Field
            label={t.imageLink}
            type="url"
            value={form.imageLink}
            onChange={(v) => setForm((s) => ({ ...s, imageLink: v }))}
            placeholder="https://example.com/image.jpg"
          />

          <div className="flex items-center gap-2">
            <input
              id="isPropertyManaged"
              type="checkbox"
              checked={form.isPropertyManaged}
              onChange={(e) => setForm((s) => ({ ...s, isPropertyManaged: e.target.checked }))}
            />
            <label htmlFor="isPropertyManaged" className="text-sm">
              {t.isPropertyManaged ?? "財產管理"}
            </label>
          </div>

          <p className="sm:col-span-2 text-xs text-gray-500">
           {
              renderSegments(t.autoDownloadNote, {
                path: "/public/product_images/<id>.<ext>",
                field: "ImageLink",
              })
            }
          </p>
        </div>

        <button
          className="mt-2 bg-sky-600 hover:bg-sky-700 text-white px-6 py-2 rounded-md disabled:opacity-50"
          disabled={!canSubmit || loading}
          onClick={handleAdd}
        >
          {loading ? (t.loading ?? "Saving…") : (t.add_product ?? "Add product")}
        </button>
        {msg && <div className="mt-4 p-3 bg-green-100 text-green-800 rounded">{msg}</div>}
    </div>
  );
}

// ---- 小元件 ----
function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string | number | "";
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm mb-1">{label}</label>
      <input
        type={type}
        className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700 text-black dark:text-white"
        value={value as any}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="text-sm">
      <div className="text-gray-500">{k}</div>
      <div className="font-medium break-all">{v || "—"}</div>
    </div>
  );
}
