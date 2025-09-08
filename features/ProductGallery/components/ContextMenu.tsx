"use client";
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export default function ContextMenu({
  ctx, onClose, items,
}: {
  ctx: { x: number; y: number; id: string } | null;
  onClose: () => void;
  items: { label: string; action: () => void }[];
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ctx) return;
    const el = document.createElement("div");
    document.body.appendChild(el);
    ref.current = el;

    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEsc);

    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.removeChild(el);
      ref.current = null;
    };
  }, [ctx, onClose]);

  if (!ctx || !ref.current) return null;

  // 防出界
  const pad = 8;
  const width = 220;
  const height = items.length * 40 + 12;
  let left = ctx.x, top = ctx.y;
  if (left + width > window.innerWidth - pad) left = window.innerWidth - width - pad;
  if (top + height > window.innerHeight - pad) top = window.innerHeight - height - pad;

  return createPortal(
    <div
      className="fixed bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg z-[1000]"
      style={{ top, left, width }}
      role="menu"
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((it, i) => (
        <button
          key={i}
          role="menuitem"
          className="block w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none"
          onClick={() => { it.action(); onClose(); }}
        >
          {it.label}
        </button>
      ))}
    </div>,
    ref.current
  );
}
