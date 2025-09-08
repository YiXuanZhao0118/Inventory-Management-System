//pages\ProductGallery\ProductGallery.tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useProductGallery } from "./components/useProductGallery";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";
import SearchBarWithScanner from "./components/SearchBarWithScanner";
import CategoryFilter from "./components/CategoryFilter";
import ProductCard from "./components/ProductCard";
import ContextMenu from "./components/ContextMenu";

export default function ProductGallery() {
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, de: deDE };
  const translations = tMap[language] || zhTW;
  const t = translations.Product;
  const pg = translations.ProductGallery;

  const {
    error, loading,
    categories,
    query, setQuery,
    selectedCategories, setSelectedCategories,
    groupedByBrand, sortedBrands,
  } = useProductGallery();

  const router = useRouter();

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const handleContext = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.preventDefault();
    const p = "pageX" in e ? { x: e.pageX, y: e.pageY } : { x: (e as any).touches[0].pageX, y: (e as any).touches[0].pageY };
    setCtxMenu({ ...p, id });
  };
  const navigateTo = (path: string) => {
    if (!ctxMenu) return;
    router.push(`${path}?productId=${ctxMenu.id}`);
    setCtxMenu(null);
  };
  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  if (error) return <div className="p-4 text-red-600">{t.loading_failed}</div>;
  if (loading) return <div className="p-4 text-gray-600">{t.loading}…</div>;

  return (
    <div className="max-w-screen mx-auto p-6 md:p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-6">
      <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white">📑 {t.title}</h1>

      <SearchBarWithScanner
        placeholder={pg.search_placeholder}
        value={query}
        onChange={setQuery}
        scanLabel="📷"
        onScan={(code) => setQuery(code)}
      />

      <CategoryFilter
        categories={categories}
        selected={selectedCategories}
        onChange={setSelectedCategories}
      />

      {sortedBrands.map((brand) => (
        <section key={brand}>
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">{brand}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {groupedByBrand[brand]
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <ProductCard key={p.id} p={p} onContextMenu={handleContext} />
              ))}
          </div>
        </section>
      ))}

      {/* Unknown brand bucket */}
      {groupedByBrand["-"] && (
        <section>
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">
            {pg.unknown || "Unknown Brand"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {groupedByBrand["-"]
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <ProductCard key={p.id} p={p} onContextMenu={handleContext} />
              ))}
          </div>
        </section>
      )}

      <ContextMenu
        ctx={ctxMenu}
        onClose={() => setCtxMenu(null)}
        items={[
          { label: pg.products_overview, action: () => ctxMenu && setQuery(ctxMenu.id) },
          { label: pg.add_inventory, action: () => navigateTo("/add_inventory") },
          { label: pg.stocks, action: () => navigateTo("/stocks") },
        ]}
      />
    </div>
  );
}
