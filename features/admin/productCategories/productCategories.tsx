// pages/admin/productCategories/productCategories.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { GoArrowLeft, GoArrowRight } from "react-icons/go";
import { IoChevronDown, IoChevronForward } from "react-icons/io5";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";
import { fetcher } from "@/services/apiClient";

type Product = {
  id: string;
  name: string;
  model: string;
  brand: string;
  specifications?: string;
};

type Category = {
  id: string;
  name: string;
  productIds: string[];
};

export default function ProductCategoriesPage() {
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, de: deDE };
  const t = (tMap[language] || zhTW).productCategories;
  const tProduct = (tMap[language] || zhTW).Product;

  const { mutate } = useSWRConfig();
  // 一次抓 products + categories
  const { data, error, isLoading } = useSWR<{ products: Product[]; productCategories: Category[] }>(
    "/api/product-categories",
    fetcher
  );

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // 新增分類表單
  const [isAddFormExpanded, setIsAddFormExpanded] = useState(true);
  const [categoryName, setCategoryName] = useState("");
  const [selectedCategoryToCopy, setSelectedCategoryToCopy] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [addProductSearch, setAddProductSearch] = useState("");
  const [selectedSearch, setSelectedSearch] = useState("");

  // 編輯表單
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editProductIds, setEditProductIds] = useState<string[]>([]);
  const [originalCategory, setOriginalCategory] = useState<Category | null>(null);
  const [searchAll, setSearchAll] = useState("");
  const [searchCat, setSearchCat] = useState("");
  const [showChanges, setShowChanges] = useState(false);

  const products = data?.products ?? [];
  const categories = data?.productCategories ?? [];

  // 自動清除提示訊息
  useEffect(() => {
    if (!message) return;
    const tmr = setTimeout(() => setMessage(""), 1500);
    return () => clearTimeout(tmr);
  }, [message]);

  // －－－ 新增分類：從既有分類複製 －－－
  const handleCategorySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setSelectedCategoryToCopy(selectedId);
    if (!selectedId) {
      setSelectedProductIds([]);
      return;
    }
    const src = categories.find((c) => c.id === selectedId);
    if (src) setSelectedProductIds([...src.productIds]);
  };

  // －－－ 新增分類：送出 －－－
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) {
      setMessage(t.nameRequired);
      return;
    }
    if (categories.some((c) => c.name === categoryName.trim())) {
      setMessage(t.duplicateNameError);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/product-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: categoryName.trim(), productIds: selectedProductIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setCategoryName("");
      setSelectedCategoryToCopy("");
      setSelectedProductIds([]);
      setMessage(t.addSuccess);
      mutate("/api/product-categories");
    } catch (e: any) {
      setMessage(t.addFailed + (e?.message ? `: ${e.message}` : ""));
    } finally {
      setSaving(false);
    }
  };

  // －－－ 編輯：開始 －－－
  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditProductIds([...cat.productIds]);
    setOriginalCategory(cat);
    setSearchAll("");
    setSearchCat("");
    setShowChanges(false);
  };

  // －－－ 編輯：取消 －－－
  const cancelEdit = () => {
    setShowChanges(false);
    setEditingId(null);
    setEditName("");
    setEditProductIds([]);
    setOriginalCategory(null);
  };

  // －－－ 編輯：儲存（兩段式：先顯示差異，再確認送出） －－－
  const saveEdit = async () => {
    if (!editingId || !originalCategory) return;
    if (!editName.trim()) {
      setMessage(t.nameRequired);
      return;
    }
    if (editName.trim() !== originalCategory.name && categories.some((c) => c.name === editName.trim() && c.id !== editingId)) {
      setMessage(t.duplicateNameError);
      return;
    }
    if (!showChanges) {
      setShowChanges(true);
      return;
    }
    setSaving(true);
    try {
      const updated = { id: editingId, name: editName.trim(), productIds: editProductIds };
      const res = await fetch("/api/product-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setMessage(t.updateSuccess);
      cancelEdit();
      mutate("/api/product-categories");
    } catch (e: any) {
      setMessage(t.updateFailed + (e?.message ? `: ${e.message}` : ""));
    } finally {
      setSaving(false);
    }
  };

  // －－－ 刪除分類 －－－
  const removeCategory = async (id: string) => {
    if (!window.confirm(t.removeConfirm)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/product-categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setMessage(t.removeSuccess);
      mutate("/api/product-categories");
    } catch (e: any) {
      setMessage(t.removeFailed + (e?.message ? `: ${e.message}` : ""));
    } finally {
      setSaving(false);
    }
  };

  // －－－ 編輯：左右移動 －－－
  const moveToCat = (id: string) => {
    if (!editProductIds.includes(id)) setEditProductIds((prev) => [...prev, id]);
  };
  const moveToAll = (id: string) => {
    setEditProductIds((prev) => prev.filter((pid) => pid !== id));
  };

  // －－－ 新增表單：左右移動 －－－
  const addToSelection = (id: string) => {
    if (!selectedProductIds.includes(id)) setSelectedProductIds((prev) => [...prev, id]);
  };
  const removeFromSelection = (id: string) => {
    setSelectedProductIds((prev) => prev.filter((pid) => pid !== id));
  };

  // －－－ 編輯差異（memo） －－－
  const computeChanges = useMemo(() => {
    if (!originalCategory || !editingId) return null;
    const addedIds = editProductIds.filter((id) => !originalCategory.productIds.includes(id));
    const removedIds = originalCategory.productIds.filter((id) => !editProductIds.includes(id));
    const addedProducts = products.filter((p) => addedIds.includes(p.id));
    const removedProducts = products.filter((p) => removedIds.includes(p.id));
    const nameChanged = originalCategory.name !== editName.trim();
    const hasDuplicateName =
      nameChanged &&
      categories.some((c) => c.name === editName.trim() && c.id !== editingId);
    return {
      nameChanged,
      hasDuplicateName,
      original: originalCategory.name,
      next: editName.trim(),
      addedProducts,
      removedProducts,
      hasChanges: nameChanged || addedProducts.length > 0 || removedProducts.length > 0,
    };
  }, [editingId, editName, editProductIds, originalCategory, products, categories]);

  const renderChanges = () => {
    const changes = computeChanges;
    if (!changes || !changes.hasChanges) {
      return <div className="text-gray-500 italic">{t.noChanges}</div>;
    }
    if (changes.hasDuplicateName) {
      return (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900 rounded border border-red-500">
          <h4 className="font-bold mb-2 text-red-600">{t.duplicateNameError}</h4>
        </div>
      );
    }
    return (
      <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded border">
        <h4 className="font-bold mb-2">{t.changes}</h4>
        {changes.nameChanged && (
          <div className="mb-3">
            <div className="text-gray-600 dark:text-gray-400">{t.beforeEdit}: {changes.original}</div>
            <div className="text-blue-600 dark:text-blue-400">{t.afterEdit}: {changes.next}</div>
          </div>
        )}
        {changes.addedProducts.length > 0 && (
          <div className="mb-3">
            <div className="font-semibold text-green-600">{t.addedProducts}:</div>
            {changes.addedProducts.map((p) => (
              <div key={p.id} className="ml-4">• {p.name} ({p.model})</div>
            ))}
          </div>
        )}
        {changes.removedProducts.length > 0 && (
          <div className="mb-3">
            <div className="font-semibold text-red-600">{t.removedProducts}:</div>
            {changes.removedProducts.map((p) => (
              <div key={p.id} className="ml-4">• {p.name} ({p.model})</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // －－－ 各區清單（搜尋過濾） －－－
  const filteredProducts = products.filter(
    (p) =>
      !selectedProductIds.includes(p.id) &&
      (p.name.toLowerCase().includes(addProductSearch.toLowerCase()) ||
        p.model?.toLowerCase().includes(addProductSearch.toLowerCase()) ||
        p.brand?.toLowerCase().includes(addProductSearch.toLowerCase()) ||
        p.specifications?.toLowerCase().includes(addProductSearch.toLowerCase()))
  );
  const selectedProducts = products.filter(
    (p) =>
      selectedProductIds.includes(p.id) &&
      (p.name.toLowerCase().includes(selectedSearch.toLowerCase()) ||
        p.model?.toLowerCase().includes(selectedSearch.toLowerCase()) ||
        p.brand?.toLowerCase().includes(selectedSearch.toLowerCase()) ||
        p.specifications?.toLowerCase().includes(selectedSearch.toLowerCase()))
  );
  const allNotInCat = products.filter(
    (p) =>
      !editProductIds.includes(p.id) &&
      (p.name.toLowerCase().includes(searchAll.toLowerCase()) ||
        p.model?.toLowerCase().includes(searchAll.toLowerCase()) ||
        p.brand?.toLowerCase().includes(searchAll.toLowerCase()) ||
        p.specifications?.toLowerCase().includes(searchAll.toLowerCase()))
  );
  const inCat = products.filter(
    (p) =>
      editProductIds.includes(p.id) &&
      (p.name.toLowerCase().includes(searchCat.toLowerCase()) ||
        p.model?.toLowerCase().includes(searchCat.toLowerCase()) ||
        p.brand?.toLowerCase().includes(searchCat.toLowerCase()) ||
        p.specifications?.toLowerCase().includes(searchCat.toLowerCase()))
  );

  if (isLoading) return <div className="p-6">{t.loading}</div>;
  if (error) return <div className="p-6 text-red-600">{t.error}{(error as Error).message}</div>;

  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      <h1 className="text-3xl font-bold mb-6">
        <span className="text-3xl font-bold mb-6">📁</span> {t.pageTitle}
        {saving && <span className="ml-2 text-sm text-gray-500">({t.saving ?? "儲存中"})</span>}
      </h1>

      {/* 新增分類 */}
      <div className="mb-8">
        <div
          className="flex items-center cursor-pointer bg-white dark:bg-gray-800 p-4 rounded-t border-b border-blue-200 dark:border-gray-600 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200"
          onClick={() => setIsAddFormExpanded((v) => !v)}
          role="button"
          aria-expanded={isAddFormExpanded}
        >
          <span className="mr-3 text-blue-500 dark:text-blue-400">
            {isAddFormExpanded ? <IoChevronDown size={20} /> : <IoChevronForward size={20} />}
          </span>
          <span className="font-semibold text-lg text-gray-700 dark:text-gray-200">
            {t.addCategory}
          </span>
        </div>

        {isAddFormExpanded && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-b p-6 shadow-lg">
            <form onSubmit={handleAddCategory} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t.categoryName}
                </label>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-2">
                  {t.categoryNamePlaceholder}
                </div>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  placeholder={t.categoryNamePlaceholder}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t.copyFromExisting}
                </label>
                <select
                  value={selectedCategoryToCopy}
                  onChange={handleCategorySelect}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 dark:text-white"
                >
                  <option value="">{t.selectSourceCategory}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 可加入 */}
                <div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 mb-2 flex justify-between">
                    <span>{t.availableProducts}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{filteredProducts.length} items</span>
                  </div>
                  <input
                    type="text"
                    value={addProductSearch}
                    onChange={(e) => setAddProductSearch(e.target.value)}
                    placeholder={tProduct.search_placeholder}
                    className="w-full mb-3 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  />
                  <div className="border border-gray-200 dark:border-gray-600 rounded-lg h-[360px] overflow-y-auto bg-white dark:bg-gray-700 shadow-inner">
                    {filteredProducts.length > 0 ? (
                      filteredProducts.map((p) => (
                        <div key={p.id} className="flex justify-between items-center border-b border-gray-200 dark:border-gray-600 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-600">
                          <div className="flex-1 min-w-0">
                            <b>{p.name}</b>
                            <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                              {[p.model, p.brand, p.specifications].filter(Boolean).join(" • ")}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => addToSelection(p.id)}
                            className="ml-4 p-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/50 rounded-full"
                            disabled={saving}
                            title={t.add ?? "加入"}
                          >
                            <GoArrowRight size={20} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-gray-400 p-2">{tProduct.no_matching_products}</div>
                    )}
                  </div>
                </div>

                {/* 已選 */}
                <div>
                  <div className="font-semibold text-gray-700 dark:text-gray-200 mb-2 flex justify-between">
                    <span>{t.categoryProducts}</span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">{selectedProducts.length} items</span>
                  </div>
                  <input
                    type="text"
                    value={selectedSearch}
                    onChange={(e) => setSelectedSearch(e.target.value)}
                    placeholder={tProduct.search_placeholder}
                    className="w-full mb-3 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  />
                  <div className="border border-gray-200 dark:border-gray-600 rounded-lg h-[360px] overflow-y-auto bg-white dark:bg-gray-700 shadow-inner">
                    {selectedProducts.length > 0 ? (
                      selectedProducts.map((p) => (
                        <div key={p.id} className="flex justify-between items-center border-b border-gray-200 dark:border-gray-600 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-600">
                          <span className="truncate">
                            <b>{p.name}</b>
                            <span className="ml-2 text-gray-500">{p.model}</span>
                            <span className="ml-2 text-gray-500">{p.brand}</span>
                            <span className="ml-2 text-gray-500">{p.specifications}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFromSelection(p.id)}
                            className="ml-4 p-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-full"
                            disabled={saving}
                            title={t.remove ?? "移除"}
                          >
                            <GoArrowLeft />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-gray-400 p-2">{tProduct.no_matching_products}</div>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                disabled={saving}
              >
                {t.addCategory}
              </button>
            </form>
          </div>
        )}
      </div>

      {/* 訊息 */}
      {message && <div className="text-green-600 mb-4">{message}</div>}

      {/* 既有分類列表 */}
      <h3 className="text-xl font-semibold mb-2">{t.existingCategories}</h3>
      <div className="space-y-6">
        {categories.length === 0 && <div>{t.noCategories}</div>}

        {categories.map((cat) => (
          <div key={cat.id} className="border rounded p-4 bg-gray-50 dark:bg-gray-800">
            {editingId === cat.id ? (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <label>{t.categoryName}:</label>
                  <input
                    className="border p-1 rounded w-1/2"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={t.categoryNamePlaceholder}
                    disabled={showChanges || saving}
                  />
                </div>

                {!showChanges && (
                  <div className="mb-4">
                    <label>{t.importFromCategory}:</label>
                    <select
                      className="ml-2 px-2 py-1 border rounded"
                      onChange={(e) => {
                        const srcId = e.target.value;
                        if (!srcId) return;
                        const src = categories.find((c) => c.id === srcId);
                        if (!src) return;
                        const newIds = src.productIds.filter((id) => !editProductIds.includes(id));
                        if (newIds.length === 0) {
                          setMessage(t.noNewProducts);
                        } else {
                          setEditProductIds((prev) => [...prev, ...newIds]);
                          setMessage(t.productsImported.replace("{count}", String(newIds.length)));
                        }
                        e.currentTarget.value = "";
                      }}
                      defaultValue=""
                      disabled={saving}
                    >
                      <option value="">{t.selectSourceCategory}</option>
                      {categories.filter((c) => c.id !== editingId).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {!showChanges ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="font-semibold mb-1">{t.availableProducts}</div>
                        <input
                          className="border p-1 rounded w-full mb-2"
                          placeholder={tProduct.search_placeholder}
                          value={searchAll}
                          onChange={(e) => setSearchAll(e.target.value)}
                        />
                        <div className="border rounded-lg h-[360px] overflow-y-auto bg-white dark:bg-gray-700">
                          {allNotInCat.length ? (
                            allNotInCat.map((p) => (
                              <div key={p.id} className="flex justify-between items-center border-b px-4 py-3">
                                <span className="truncate">
                                  <b>{p.name}</b>
                                  <span className="ml-2 text-gray-500">{p.model}</span>
                                  <span className="ml-2 text-gray-500">{p.brand}</span>
                                  <span className="ml-2 text-gray-500">{p.specifications}</span>
                                </span>
                                <button
                                  className="ml-4 p-2 text-blue-600 hover:text-blue-700 rounded-full"
                                  type="button"
                                  onClick={() => moveToCat(p.id)}
                                  disabled={saving}
                                >
                                  <GoArrowRight />
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-400 p-2">{tProduct.no_matching_products}</div>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="font-semibold mb-1">{t.categoryProducts}</div>
                        <input
                          className="border p-1 rounded w-full mb-2"
                          placeholder={tProduct.search_placeholder}
                          value={searchCat}
                          onChange={(e) => setSearchCat(e.target.value)}
                        />
                        <div className="border rounded-lg h-[360px] overflow-y-auto bg-white dark:bg-gray-700">
                          {inCat.length ? (
                            inCat.map((p) => (
                              <div key={p.id} className="flex justify-between items-center border-b px-4 py-3">
                                <span className="truncate">
                                  <b>{p.name}</b>
                                  <span className="ml-2 text-gray-500">{p.model}</span>
                                  <span className="ml-2 text-gray-500">{p.brand}</span>
                                  <span className="ml-2 text-gray-500">{p.specifications}</span>
                                </span>
                                <button
                                  className="ml-4 p-2 text-red-600 hover:text-red-700 rounded-full"
                                  type="button"
                                  onClick={() => moveToAll(p.id)}
                                  disabled={saving}
                                >
                                  <GoArrowLeft />
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="text-gray-400 p-2">{tProduct.no_matching_products}</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        className="bg-green-600 text-white px-4 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                        type="button"
                        onClick={saveEdit}
                        disabled={saving}
                      >
                        {t.save}
                      </button>
                      <button
                        className="bg-gray-400 text-white px-4 py-1 rounded hover:bg-gray-500"
                        type="button"
                        onClick={cancelEdit}
                        disabled={saving}
                      >
                        {t.cancel}
                      </button>
                    </div>
                  </>
                ) : (
                  <div>
                    {renderChanges()}
                    <div className="mt-4 text-center font-semibold">{t.confirmSave}</div>
                    <div className="mt-4 flex gap-2 justify-center">
                      <button
                        className="bg-green-600 text-white px-4 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                        type="button"
                        onClick={saveEdit}
                        disabled={saving}
                      >
                        {t.save}
                      </button>
                      <button
                        className="bg-gray-400 text-white px-4 py-1 rounded hover:bg-gray-500"
                        type="button"
                        onClick={() => setShowChanges(false)}
                        disabled={saving}
                      >
                        {t.cancel}
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <b>{cat.name}</b>: {cat.productIds.length} {t.items}
                </div>
                <div className="space-x-2">
                  <button
                    className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600"
                    type="button"
                    onClick={() => startEdit(cat)}
                    disabled={saving}
                  >
                    {t.edit}
                  </button>
                  <button
                    className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 disabled:opacity-50"
                    type="button"
                    onClick={() => removeCategory(cat.id)}
                    disabled={saving}
                  >
                    {t.remove}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
