"use client";
import useSWR from "swr";
import Fuse from "fuse.js";
import { useMemo, useState } from "react";
import { ProductLiteWithLocal, ProductCategory } from "@/lib/types"; // ← 修正


const fetcher = (url: string) =>
  fetch(url).then(res => {
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  });

export function useProductGallery() {
  // 一次取 products + categories（沿用你原本的 API）
  const { data, error } = useSWR<{
    products: ProductLiteWithLocal[];
    productCategories: ProductCategory[];
  }>("/api/product-categories", fetcher);

  const products = data?.products ?? [];
  const categories = data?.productCategories ?? [];

  const fuse = useMemo(() => new Fuse(products, {
    keys: ["name", "model", "brand", "specifications", "id"],
    threshold: 0.3,
  }), [products]);

  const [query, setQuery] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const byQuery = query ? fuse.search(query).map(r => r.item) : products;
    if (selectedCategories.length === 0) return byQuery;
    const idSet = new Set<string>();
    for (const c of categories) if (selectedCategories.includes(c.id)) {
      for (const pid of c.productIds) idSet.add(pid);
    }
    return byQuery.filter(p => idSet.has(p.id));
  }, [query, fuse, products, categories, selectedCategories]);

  const groupedByBrand = useMemo(() => {
    const g: Record<string, ProductLiteWithLocal[]> = {};
    for (const p of filtered) {
      const b = p.brand && p.brand !== "-" ? p.brand : "-";
      (g[b] ??= []).push(p);
    }
    return g;
  }, [filtered]);

  const sortedBrands = useMemo(
    () => Object.entries(groupedByBrand)
      .filter(([b]) => b !== "-")
      .sort(([,a],[,b]) => b.length - a.length)
      .map(([b]) => b),
    [groupedByBrand]
  );

  return {
    error,
    loading: !data && !error,
    products,
    categories,
    query, setQuery,
    selectedCategories, setSelectedCategories,
    groupedByBrand,
    sortedBrands,
  };
}
