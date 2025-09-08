// pages/admin/Product/EditProperty.tsx
"use client";
import React, { useState, useEffect, useMemo } from "react";
import { GoArrowRight, GoArrowLeft } from "react-icons/go";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

type Product = {
  id: string;
  name: string;
  model: string;
  brand: string;
  isPropertyManaged: boolean;
};

export default function PropertyManagementPage() {
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, de: deDE };
  const t = (tMap[language] || zhTW).Admin.EditProperty;

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [propertyManagedIds, setPropertyManagedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nonManagedSearch, setNonManagedSearch] = useState("");
  const [managedSearch, setManagedSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/products/propertyManaged", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        setAllProducts(Array.isArray(data.products) ? data.products : []);
        setPropertyManagedIds(Array.isArray(data.propertyManagedProductIds) ? data.propertyManagedProductIds : []);
      } catch (e: any) {
        setError(e.message || "Load failed");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const nonManaged = useMemo(
    () => allProducts.filter(p => !propertyManagedIds.includes(p.id)),
    [allProducts, propertyManagedIds]
  );
  const managed = useMemo(
    () => allProducts.filter(p => propertyManagedIds.includes(p.id)),
    [allProducts, propertyManagedIds]
  );

  const filteredNonManaged = useMemo(() => {
    const q = nonManagedSearch.toLowerCase().trim();
    if (!q) return nonManaged;
    return nonManaged.filter(p =>
      [p.name, p.model, p.brand].some(x => x?.toLowerCase().includes(q))
    );
  }, [nonManaged, nonManagedSearch]);

  const filteredManaged = useMemo(() => {
    const q = managedSearch.toLowerCase().trim();
    if (!q) return managed;
    return managed.filter(p =>
      [p.name, p.model, p.brand].some(x => x?.toLowerCase().includes(q))
    );
  }, [managed, managedSearch]);

  const updateServer = async (nextIds: string[]) => {
    setSaving(true);
    try {
      const r = await fetch("/api/products/propertyManaged", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyManagedProductIds: nextIds }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setPropertyManagedIds(nextIds);
    } catch (e: any) {
      alert((t.updateFailed ?? "更新失敗") + `: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ✅ 兩邊都先警告（加入財產／移出財產）
  const moveToManaged = (id: string) => {
    if (saving) return;
    if (propertyManagedIds.includes(id)) return;

    const ok = confirm(
      (t.confirmPromote ?? "確定將此產品加入『財產管理』嗎？") +
        "\n" +
        (t.confirmPromoteHint ?? "會影響顯示與盤點方式。")
    );
    if (!ok) return;

    const next = Array.from(new Set([...propertyManagedIds, id]));
    updateServer(next);
  };

  const moveToNonManaged = (id: string) => {
    if (saving) return;

    const ok = confirm(
      (t.confirmDemote ?? "確定要將此產品從『財產管理』移除嗎？") +
        "\n" +
        (t.confirmDemoteHint ?? "會影響顯示/盤點方式。")
    );
    if (!ok) return;

    const next = propertyManagedIds.filter(x => x !== id);
    updateServer(next);
  };

  if (loading) return <div className="container mx-auto p-4">{t.loading}</div>;
  if (error) return <div className="container mx-auto p-4 text-red-500">{t.error}{error}</div>;

  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      <h1 className="text-3xl font-bold mb-6">
        <span className="text-3xl font-bold mb-6">🔧</span>{t.pageTitle}
        {saving && <span className="ml-2 text-sm text-gray-500">({t.saving ?? "儲存中"})</span>}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-grow overflow-hidden">
        {/* 非財產管理 */}
        <div className="flex flex-col min-h-0">
          <h2 className="text-xl font-semibold mb-2">{t.nonManagedTitle}</h2>
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            className="border p-2 rounded-md mb-4"
            value={nonManagedSearch}
            onChange={(e) => setNonManagedSearch(e.target.value)}
          />
          <div className="border p-4 flex-grow overflow-y-auto rounded">
            {filteredNonManaged.map(p => (
              <div key={p.id} className="flex justify-between items-center mb-2 p-2 border-b">
                <div>
                  <p>{t.productName}: {p.name}</p>
                  <p>{t.productModel}: {p.model}</p>
                  <p>{t.productBrand}: {p.brand}</p>
                </div>
                <button
                  onClick={() => moveToManaged(p.id)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded disabled:opacity-50"
                  disabled={saving}
                  title={t.moveToManaged ?? "加入財產管理"}
                >
                  <GoArrowRight />
                </button>
              </div>
            ))}
            {filteredNonManaged.length === 0 && (
              <div className="text-sm text-gray-500">{t.emptyList ?? "沒有項目"}</div>
            )}
          </div>
        </div>

        {/* 財產管理 */}
        <div className="flex flex-col min-h-0">
          <h2 className="text-xl font-semibold mb-2">{t.managedTitle}</h2>
          <input
            type="text"
            placeholder={t.searchPlaceholder}
            className="border p-2 rounded-md mb-4"
            value={managedSearch}
            onChange={(e) => setManagedSearch(e.target.value)}
          />
          <div className="border p-4 flex-grow overflow-y-auto rounded">
            {filteredManaged.map(p => (
              <div key={p.id} className="flex justify-between items-center mb-2 p-2 border-b">
                <div>
                  <p>{t.productName}: {p.name}</p>
                  <p>{t.productModel}: {p.model}</p>
                  <p>{t.productBrand}: {p.brand}</p>
                </div>
                <button
                  onClick={() => moveToNonManaged(p.id)}
                  className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded disabled:opacity-50"
                  disabled={saving}
                  title={t.moveToNonManaged ?? "移出財產管理"}
                >
                  <GoArrowLeft />
                </button>
              </div>
            ))}
            {filteredManaged.length === 0 && (
              <div className="text-sm text-gray-500">{t.emptyList ?? "沒有項目"}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
