// pages/admin/Product/EditProducts.tsx
"use client";

import React, { useState, useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import { EditModal } from "./EditModal";

import type {
  AdminProduct as ModalProduct,
  ProductForm as ModalForm,
} from "./EditModal";

import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";
import { fetcher } from "@/services/apiClient";


type ProductLite = {
  id: string;
  name: string;
  model: string;
  brand: string;
  specifications: string;
  price: number;
  imageLink?: string | null;
  localImage?: string | null;
};

export default function EditProducts() {
  const { language } = useLanguage();
  const translationMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const translations = translationMap[language] || zhTW;
  const t = translations.Admin.EditProducts;

  const { mutate } = useSWRConfig();

  // 產品列表
  const { data: products, error } = useSWR<ProductLite[]>("/api/products", fetcher);

  // 抓 db 取得 stock 以便判斷哪些 product 被使用
  const { data: dbData } = useSWR<{ stock: { productId: string }[] }>("/api/db", fetcher);
  const usedProductIdSet = new Set((dbData?.stock || []).map((s) => s.productId));

  const adminProducts = (products ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    model: p.model,
    brand: p.brand,
    specifications: p.specifications,
    price: Number.isFinite(p.price) ? p.price : 0,
    imageLink: p.imageLink ?? null,
    localImage: p.localImage ?? null,
  }));

  // 可搜尋/排序欄位
  const searchableKeys = ["name", "model", "brand", "specifications"] as const;
  type SearchKey = (typeof searchableKeys)[number];
  type SortKey = SearchKey | "price";

  const normalize = (s: string) => s.trim().toLowerCase();

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  const filteredProducts = adminProducts
    .filter((p) =>
      searchableKeys.some((field) => normalize(p[field]).includes(normalize(search)))
    )
    .sort((a, b) => {
      if (sortField === "price") {
        const xa = a.price ?? 0;
        const xb = b.price ?? 0;
        return sortAsc ? xa - xb : xb - xa;
      }
      return sortAsc
        ? String(a[sortField]).localeCompare(String(b[sortField]))
        : String(b[sortField]).localeCompare(String(a[sortField]));
    });

  // ✅ 單一份 state，型別以 Modal 的定義為準
  const [edit, setEdit] = useState<ModalProduct | null>(null);
  const [draft, setDraft] = useState<ModalForm>({
    name: "",
    model: "",
    brand: "",
    specifications: "",
    price: 0,
    imageLink: "",     // required string
    localImage: null,  // string | null
  });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 2000);
    return () => clearTimeout(timer);
  }, [message]);

  const editProduct = async (id: string, product: ModalForm) => {
    const res = await fetch(`/api/products/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(product),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to edit product");
    return json;
  };

  const saveEdit = async () => {
    if (!edit) return;

    // 重複檢查：同品牌 + 同型號
    if (
      adminProducts.some(
        (p) =>
          p.id !== edit.id &&
          p.model.trim().toLowerCase() === draft.model.trim().toLowerCase() &&
          p.brand.trim().toLowerCase() === draft.brand.trim().toLowerCase()
      )
    ) {
      setMessage(t.editProduct_duplicate_error ?? "同品牌/型號已存在");
      return;
    }

    try {
      await editProduct(edit.id, {
        ...draft,
        price: Number.isFinite(draft.price) ? Number(draft.price) : 0,
      });
      mutate("/api/products");
      setEdit(null);
      setMessage(t.editProduct_success ?? "已更新");
    } catch (e: any) {
      setMessage(t.editProduct_fail ?? e.message ?? "更新失敗");
    }
  };

  // 刪除（前端先判斷是否被使用；後端亦會再檢查一次）
  const handleDelete = async (p: ProductLite) => {
    const inUse = usedProductIdSet.has(p.id);
    if (inUse) {
      alert(t.delete_in_use ?? "此產品仍有庫存，無法刪除。");
      return;
    }
    if (!confirm((t.delete_confirm ?? "確認刪除？這個動作無法復原。") + `\n${p.brand} ${p.model}`)) return;

    try {
      const res = await fetch(`/api/products/${p.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setMessage(t.delete_success ?? "刪除成功");
      mutate("/api/products");
    } catch (e: any) {
      alert((t.delete_failed ?? "刪除失敗") + `：${e.message}`);
    }
  };

  if (error)
    return (
      <div className="p-4 text-red-600">
        {t.load_fail || "載入產品資料失敗，請稍後再試。"}
      </div>
    );

  if (!products) return <div className="p-4">{t.loading || "載入中..."}</div>;

  const columns: { label: string; field: SortKey | null }[] = [
    { label: t.name, field: "name" },
    { label: t.model, field: "model" },
    { label: t.brand, field: "brand" },
    { label: t.specifications, field: "specifications" },
    { label: t.price ?? "價格", field: "price" },
    { label: t.actions || "操作", field: null },
  ];

  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      <h1 className="text-3xl font-bold mb-6">✏️ {t.title}</h1>

      <div className="mb-4">
        <input
          type="text"
          placeholder={t.search || "搜尋產品..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2 rounded w-full sm:w-1/2"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm table-fixed">
          <thead className="bg-gray-100 dark:bg-gray-700">
            <tr>
              {columns.map(({ label, field }) => (
                <th
                  key={label}
                  className={`px-4 py-2 text-left select-none cursor-pointer ${
                    label === (t.actions || "操作") ? "w-36" : ""
                  }`}
                  onClick={() => {
                    if (!field) return;
                    if (sortField === field) setSortAsc(!sortAsc);
                    else {
                      setSortField(field);
                      setSortAsc(true);
                    }
                  }}
                >
                  {label}
                  {field && sortField === field && (sortAsc ? " 🔼" : " 🔽")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => {
              const inUse = usedProductIdSet.has(p.id);
              return (
                <tr key={p.id} className="border-b">
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">{p.model}</td>
                  <td className="px-4 py-2">{p.brand}</td>
                  <td className="px-4 py-2">{p.specifications}</td>
                  <td className="px-4 py-2">{Number(p.price ?? 0)}</td>
                  <td className="px-4 py-2 space-x-2 w-36">
                    <button
                      className="px-2 py-1 bg-blue-600 text-white rounded"
                      onClick={() => {
                        const modalProduct: ModalProduct = {
                          id: p.id,
                          name: p.name,
                          brand: p.brand,
                          model: p.model,
                          specifications: p.specifications,
                          price: Number(p.price ?? 0),
                          imageLink: p.imageLink ?? "",      // <- 轉成 string
                          localImage: p.localImage ?? null,  // <- 轉成 string|null
                        };
                        setEdit(modalProduct);

                        const modalDraft: ModalForm = {
                          name: p.name,
                          model: p.model,
                          brand: p.brand,
                          specifications: p.specifications,
                          price: Number(p.price ?? 0),
                          imageLink: p.imageLink ?? "",
                          localImage: p.localImage ?? null,
                        };
                        setDraft(modalDraft);
                      }}
                    >
                      {t.edit || "編輯"}
                    </button>

                    <button
                      className={`px-2 py-1 rounded ${
                        inUse
                          ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                          : "bg-red-600 text-white hover:bg-red-700"
                      }`}
                      title={
                        inUse
                          ? (t.delete_disabled_hint ?? "此產品仍有庫存，不能刪除")
                          : (t.delete ?? "刪除")
                      }
                      disabled={inUse}
                      onClick={() => handleDelete(p)}
                    >
                      {t.delete || "刪除"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {edit && (
        <EditModal
          edit={edit}
          draft={draft}
          setDraft={setDraft}
          onClose={() => setEdit(null)}
          onSave={saveEdit}
        />
      )}

      {message && (
        <div className="mt-4 px-4 py-2 bg-green-100 text-green-800 rounded">
          {message}
        </div>
      )}
    </div>
  );
}
