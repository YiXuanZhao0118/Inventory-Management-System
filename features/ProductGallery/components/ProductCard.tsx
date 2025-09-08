"use client";
import React, { useEffect, useRef, useState } from "react";
import { ProductLiteWithLocal } from "@/lib/types";
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";
import Upload from "@/features/ProductGallery/components/Upload";          // ← 修正路徑與名稱
import ViewSpec from "@/features/ProductGallery/components/ViewSpec";      // ← 修正路徑

const isValid = (s?: string | null) => !!s && /^(https?:\/\/|\/)\S+/.test(s);

export default function ProductCard({
  p, onContextMenu,
}: {
  p: ProductLiteWithLocal;
  onContextMenu: (e: React.MouseEvent | React.TouchEvent, id: string) => void;
}) {
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, de: deDE };
  const t = (tMap[language] || zhTW).Product;

  const sources = [p.localImage, p.imageLink].filter(isValid) as string[];
  const [srcIdx, setSrcIdx] = useState(0);
  const [error, setError] = useState(false);
  const [specOpen, setSpecOpen] = useState(false);

  const onImgErr = () => {
    if (srcIdx < sources.length - 1) setSrcIdx(srcIdx + 1);
    else setError(true);
  };

  // iOS 長按—用 ref 保存 timer
  const ref = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    ref.current?.style.setProperty("-webkit-touch-callout", "none");
    ref.current?.style.setProperty("-webkit-user-select", "none");
    ref.current?.style.setProperty("user-select", "none");
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    pressTimer.current = setTimeout(() => onContextMenu(e, p.id), 600);
  };
  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  return (
    <div
      ref={ref}
      className="bg-gray-50 dark:bg-gray-800 rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition"
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, p.id); }}
      onTouchStart={onTouchStart}
      onTouchEnd={clearPress}
      onTouchCancel={clearPress}
    >
      <div className="relative w-full h-48 md:h-56 lg:h-64 bg-white">
        {!error && sources.length > 0 ? (
          <img
            src={sources[srcIdx]}
            alt={p.name}
            className="w-full h-full object-contain"
            onError={onImgErr}
            onContextMenu={(e) => e.preventDefault()}
            loading="lazy"
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-gray-400">
            {t.no_image}
          </div>
        )}
        <button
          className="absolute top-2 left-2 bg-indigo-600 text-white w-8 h-8 flex items-center justify-center rounded-full opacity-80 hover:opacity-100"
          onClick={() => setSpecOpen(true)}
          title={t.view_spec}
          aria-label={t.view_spec}
        >
          📄
        </button>
        <Upload productId={p.id} />
      </div>

      <div className="p-4 space-y-1">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{p.name}</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300">{t.model}: {p.model}</p>
        <p className="text-sm text-gray-700 dark:text-gray-300">{t.brand}: {p.brand}</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
          {t.specifications}: {p.specifications}
        </p>
      </div>

      {specOpen && <ViewSpec productId={p.id} onClose={() => setSpecOpen(false)} />}
    </div>
  );
}
