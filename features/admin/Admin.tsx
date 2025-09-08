// pages/admin/Admin.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
import useSWR from "swr";

import AllRentalStatuses from "./AllRentalStatuses/AllRentalStatuses";
import AddProduct from "./Product/AddProduct";
import EditProducts from "./Product/EditProducts";
import ProductCategoriesPage from "./productCategories/productCategories";
import EditProperty from "./Product/EditProperty";
import LocationTreeEditor from "./Location/LocationTree";
import CreateAccount from "./password/CreateAccount";
import ChangePasswordPage from "./password/ChangePassword";

import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

import { fetcher } from "@/services/apiClient";

/* ---------- 補：型別 ---------- */
type ProductLite = {
  id: string;
  name: string;
  model: string;
  brand: string;
  specifications: string;
  imageLink?: string | null;
  localImage?: string | null;
  // 如果你的後端有 price，就加上：
  // price?: number;
};

type AdminProduct = ProductLite;

// 用來限制排序/搜尋欄位
type ProductForm = {
  name?: string;
  model?: string;
  brand?: string;
  specifications?: string;
};

/* ---------- 原本程式 ---------- */
type Section =
  | "LoanState"
  | "product"
  | "productCategories"
  | "editproperty"
  | "location"
  | "password";

export default function Admin() {
  const { language } = useLanguage();
  const translationMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const translations = translationMap[language] || zhTW;
  const t = translations.Admin.Main;

  // 這裡 data 可能為 undefined，給個預設 []
  const { data } = useSWR<ProductLite[]>("/api/products", fetcher);
  const products = data ?? [];

  const adminProducts: AdminProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    model: p.model,
    brand: p.brand,
    specifications: p.specifications,
    imageLink: p.imageLink ?? null,
    localImage: p.localImage ?? null,
  }));

  const normalize = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<keyof ProductForm>("name");
  const [sortAsc, setSortAsc] = useState(true);

  const filteredProducts = adminProducts
    .filter((p) =>
      (["name", "model", "brand", "specifications"] as (keyof ProductForm)[])
        .some((field) => normalize(p[field] as string).includes(normalize(search)))
    )
    .sort((a, b) =>
      sortAsc
        ? String(a[sortField] ?? "").localeCompare(String(b[sortField] ?? ""))
        : String(b[sortField] ?? "").localeCompare(String(a[sortField] ?? ""))
    );

  const [activeSection, setActiveSection] = useState<Section>("LoanState");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!sidebarOpen) return;
      const w = e.clientX;
      if (w >= 64 && w <= 400) setSidebarWidth(w);
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };
    const resizer = sidebarRef.current?.querySelector(".resizer");
    resizer?.addEventListener("mousedown", onMouseDown as any);
    return () => resizer?.removeEventListener("mousedown", onMouseDown as any);
  }, [sidebarOpen]);

  const menuItems: { key: Section; label: string; icon: string }[] = [
    { key: "LoanState", label: t.menu_all_loan_records, icon: "📋" },
    { key: "product", label: t.menu_product, icon: "🛠️" },
    { key: "productCategories", label: t.menu_productCategories, icon: "📁" },
    { key: "editproperty", label: t.menu_edit_property, icon: "🔧" },
    { key: "location", label: t.menu_location, icon: "🌳" },
    { key: "password", label: t.menu_password, icon: "🔑" },
  ];

  return (
    <div>
      {/* 側邊欄 */}
      <div
        className="fixed top-14 left-0 bottom-0 z-50 flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 transition-width duration-150"
        style={{ width: sidebarOpen ? sidebarWidth : 64 }}
        ref={sidebarRef}>
        <div className="p-2 flex top-0 left-full ml-2">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="flex flex-col justify-between w-6 h-5 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <span className="block h-0.5 bg-current rounded" />
            <span className="block h-0.5 bg-current rounded" />
            <span className="block h-0.5 bg-current rounded" />
          </button>
        </div>
        {sidebarOpen && (
          <div className="resizer w-1 h-full cursor-col-resize absolute right-0 top-0" />
        )}
        {sidebarOpen && (
          <nav className="flex-1 overflow-auto">
            {menuItems.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setActiveSection(key)}
                className={`w-full flex items-center px-4 py-3 gap-3 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  activeSection === key
                    ? "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                    : ""
                }`}>
                <span className="text-lg">{icon}</span>
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>

      <div style={{ marginLeft: sidebarOpen ? sidebarWidth : 64 }}>
        <main className="p-6 overflow-auto px-4">
          {activeSection === "LoanState" && <AllRentalStatuses />}
          {activeSection === "product" && (
            <>
              <AddProduct />
              <hr className="my-4 border-t-2 border-gray-200 dark:border-gray-700" />
              <EditProducts />
            </>
          )}
          {activeSection === "productCategories" && <ProductCategoriesPage />}
          {activeSection === "editproperty" && <EditProperty />}
          {activeSection === "location" && <LocationTreeEditor />}
          {activeSection === "password" && (
            <>
              <CreateAccount />
              <hr className="my-4 border-t-2 border-gray-200 dark:border-gray-700" />
              <ChangePasswordPage />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
