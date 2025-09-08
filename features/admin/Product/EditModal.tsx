// pages/admin/Product/EditModal.tsx
"use client";

import React, { useMemo } from "react";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

/** 僅供此 Modal 使用的嚴謹型別（不要從 lib/db 匯入，避免編譯錯） */
export type AdminProduct = {
  id: string;
  name: string;
  brand: string;
  model: string;
  specifications: string;
  price: number;
  imageLink: string;         // 後端會嘗試下載
  localImage: string | null; // 下載成功就有路徑，失敗維持 null
};

export type ProductForm = {
  name: string;
  brand: string;
  model: string;
  specifications: string;
  price: number;
  imageLink: string;
  localImage: string | null; // 唯讀顯示，由後端決定
};

export interface EditModalProps {
  edit: AdminProduct;
  draft: ProductForm;
  setDraft: React.Dispatch<React.SetStateAction<ProductForm>>;
  onClose: () => void;
  onSave: () => void;
}

export const EditModal: React.FC<EditModalProps> = ({
  edit,
  draft,
  setDraft,
  onClose,
  onSave,
}) => {
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, de: deDE };
  const t = (tMap[language] || zhTW).Admin.EditModal;

  const priceError = useMemo(() => {
    const n = Number(draft.price);
    if (!Number.isFinite(n)) return t.price_invalid ?? "價格格式不正確";
    if (n < 0) return t.price_non_negative ?? "價格不可為負值";
    return "";
  }, [draft.price, t]);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl w-full max-w-xl shadow-xl" onClick={stop}>
        <div className="px-6 py-4 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold">
            {(t.title ?? "編輯產品")}：{edit.brand} {edit.model}
          </h2>
        </div>

        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* name */}
          <div>
            <label className="block text-sm mb-1">{t.name ?? "名稱"}</label>
            <input
              className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700"
              value={draft.name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDraft((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </div>

          {/* brand */}
          <div>
            <label className="block text-sm mb-1">{t.brand ?? "品牌"}</label>
            <input
              className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700"
              value={draft.brand}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDraft((prev) => ({ ...prev, brand: e.target.value }))
              }
            />
          </div>

          {/* model */}
          <div>
            <label className="block text-sm mb-1">{t.model ?? "型號"}</label>
            <input
              className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700"
              value={draft.model}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDraft((prev) => ({ ...prev, model: e.target.value }))
              }
            />
          </div>

          {/* price */}
          <div>
            <label className="block text-sm mb-1">{t.price ?? "價格"}</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className={`w-full border rounded p-2 bg-gray-50 dark:bg-gray-700 ${priceError ? "border-red-400" : ""}`}
              value={Number.isFinite(draft.price) ? draft.price : 0}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const n = Number(e.target.value);
                const safe = Number.isFinite(n) ? Math.max(0, n) : 0;
                setDraft((prev) => ({ ...prev, price: safe }));
              }}
            />
            {priceError && <p className="mt-1 text-xs text-red-600">{priceError}</p>}
          </div>

          {/* specifications */}
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">{t.specifications ?? "規格"}</label>
            <input
              className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700"
              value={draft.specifications}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDraft((prev) => ({ ...prev, specifications: e.target.value }))
              }
            />
          </div>

          {/* imageLink */}
          <div>
            <label className="block text-sm mb-1">{t.imageLink ?? "圖片網址"}</label>
            <input
              type="url"
              className="w-full border rounded p-2 bg-gray-50 dark:bg-gray-700"
              value={draft.imageLink}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setDraft((prev) => ({ ...prev, imageLink: e.target.value }))
              }
              placeholder="https://example.com/image.jpg"
            />
          </div>

          {/* localImage (唯讀) */}
          <div>
            <label className="block text-sm mb-1">{t.imageLink ?? "本地圖片"}</label>
            <input
              className="w-full border rounded p-2 bg-gray-100 dark:bg-gray-800"
              value={draft.localImage ?? ""}
              readOnly
            />
            <p className="mt-1 text-xs text-gray-500">
              {t.localImage_hint ?? "儲存後，系統會嘗試下載 imageLink；失敗則保持為 null。"}
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t dark:border-gray-700 flex justify-end gap-2">
          <button className="border px-4 py-2 rounded" onClick={onClose}>
            {t.cancel ?? "取消"}
          </button>
          <button
            className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
            onClick={onSave}
            disabled={!!priceError}
          >
            {t.save ?? "儲存"}
          </button>
        </div>
      </div>
    </div>
  );
};
