// components/LocationField.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/services/apiClient';
import { ChevronDown, ChevronRight, X } from 'lucide-react';

// ✅ 新增語言切換
import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

type LocationNode = { id: string; label: string; children?: LocationNode[] };

function useOutsideClick<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return ref;
}

/** 從「原始樹」收集所有非葉節點（有子節點者）的 id */
function collectNonLeafIds(roots: LocationNode[]): Set<string> {
  const s = new Set<string>();
  const dfs = (n: LocationNode) => {
    const hasChildren = !!(n.children && n.children.length > 0);
    if (hasChildren) s.add(n.id);
    n.children?.forEach(dfs);
  };
  roots.forEach(dfs);
  return s;
}

/** 依關鍵字過濾，但不影響「原始是否為父節點」的判定 */
function filterTreeByQuery(
  roots: LocationNode[],
  q: string
): { tree: LocationNode[]; autoOpen: Set<string> } {
  if (!q.trim()) return { tree: roots, autoOpen: new Set() };
  const qq = q.trim().toLowerCase();
  const autoOpen = new Set<string>();

  const walk = (node: LocationNode): LocationNode | null => {
    const selfMatch = node.label.toLowerCase().includes(qq);
    const children = (node.children ?? [])
      .map(walk)
      .filter(Boolean) as LocationNode[];
    if (selfMatch || children.length > 0) {
      if (children.length > 0) autoOpen.add(node.id); // 有子命中則自動展開
      return { ...node, children };
    }
    return null;
  };

  const filtered = roots.map(walk).filter(Boolean) as LocationNode[];
  return { tree: filtered, autoOpen };
}

export function LocationPickerPanel({
  value,
  onChange,
  exclude = [],
  onlyLeaf = true,
}: {
  value: string | '';
  onChange: (v: string) => void;
  exclude?: string[];
  onlyLeaf?: boolean;
}) {
  const { data: rawTree = [] } = useSWR<LocationNode[]>('/api/locations', fetcher);

  const nonLeafIds = useMemo(() => collectNonLeafIds(rawTree), [rawTree]);

  const [openSet, setOpenSet] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const { tree, autoOpen } = useMemo(
    () => filterTreeByQuery(rawTree, query),
    [rawTree, query]
  );

  useEffect(() => {
    if (autoOpen.size > 0) {
      setOpenSet(s => new Set([...s, ...autoOpen]));
    }
  }, [autoOpen]);

  const toggle = (id: string) =>
    setOpenSet(s => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ✅ 加入多語言
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, de: deDE };
  const t = (tMap[language] || zhTW).LocationField;

  const renderNodes = (nodes: LocationNode[], depth = 0): React.ReactNode =>
    nodes.map(n => {
      const origHasChildren = nonLeafIds.has(n.id);
      const isOpen = openSet.has(n.id);
      const disabled = exclude.includes(n.id);
      const canSelectThis = !onlyLeaf || !origHasChildren;

      return (
        <div key={n.id} style={{ marginLeft: depth * 16 }} className="mb-1">
          <div className="flex items-center space-x-1">
            {origHasChildren ? (
              <button onClick={() => toggle(n.id)} className="p-1">
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-4 inline-block" />
            )}

            <button
              onClick={() => {
                if (!canSelectThis) {
                  toggle(n.id);
                  return;
                }
                if (!disabled) onChange(n.id);
              }}
              className={`flex-1 text-left px-1 ${
                value === n.id ? 'font-semibold text-sky-600' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
              } ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${
                !canSelectThis ? 'text-gray-700' : ''
              }`}
              title={!canSelectThis ? t.nonLeafTooltip : undefined}
            >
              {n.label}
              {!canSelectThis && (
                <span className="ml-2 text-xs text-gray-400">{t.nonLeafHint}</span>
              )}
            </button>
          </div>

          {origHasChildren && isOpen && n.children?.length ? renderNodes(n.children, depth + 1) : null}
        </div>
      );
    });

  return (
    <div className="w-[320px] max-h-[340px] flex flex-col">
      <div className="p-2 border-b dark:border-gray-700 flex items-center gap-2">
        <input
          className="flex-1 px-2 py-1 border rounded dark:bg-gray-900 dark:border-gray-700"
          placeholder={t.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="p-1 text-gray-500 hover:text-gray-700"
            onClick={() => setQuery('')}
            title={t.clearSearch}
          >
            <X size={16} />
          </button>
        )}
      </div>
      <div className="p-2 overflow-auto">{renderNodes(tree)}</div>
    </div>
  );
}

export function LocationField({
  value,
  onChange,
  placeholder,
  buttonClassName = 'min-w-[14rem] max-w-[22rem] px-2 py-1 border rounded dark:bg-gray-900 dark:border-gray-700',
  panelClassName = 'absolute z-50 mt-2 bg-white dark:bg-gray-900 rounded-xl shadow-xl border dark:border-gray-700',
  exclude = [],
  onlyLeaf = true,
  getLabelById,
}: {
  value: string | '';
  onChange: (v: string) => void;
  placeholder?: string;
  buttonClassName?: string;
  panelClassName?: string;
  exclude?: string[];
  onlyLeaf?: boolean;
  getLabelById?: (id: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useOutsideClick<HTMLDivElement>(() => setOpen(false));

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, []);

  // ✅ 語言
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, de: deDE };
  const t = (tMap[language] || zhTW).LocationField;

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button className={buttonClassName} onClick={() => setOpen(o => !o)}>
        {value ? (getLabelById ? getLabelById(value) : value) : (placeholder || t.placeholder)}
      </button>
      {open && (
        <div className={panelClassName}>
          <LocationPickerPanel
            value={value}
            onChange={(v) => { onChange(v); setOpen(false); }}
            exclude={exclude}
            onlyLeaf={onlyLeaf}
          />
        </div>
      )}
    </div>
  );
}
