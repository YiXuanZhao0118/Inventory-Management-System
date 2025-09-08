// pages/admin/Location/LocationTree.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import type { LocationNode } from "@/lib/database";
import {
  ArrowUp, ArrowDown, ArrowRight, ArrowLeft,
  PlusCircle, Trash2, ChevronDown, ChevronRight,
} from "lucide-react";
import { fetcher } from "@/services/apiClient";

import { useLanguage } from "@/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

const LOCKED_ID = "1";                // 固定節點 id
const LOCKED_NAME = "Container Area"; // 僅用於訊息顯示

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o));
const genId = () => Date.now().toString(36) + Math.random().toString(16).slice(2);

// 清理空 children；對 LOCKED_ID 永遠移除 children
function cleanTree(nodes: LocationNode[]): LocationNode[] {
  return nodes.map(({ id, label, children }) => {
    if (id === LOCKED_ID) return { id, label };
    return {
      id,
      label,
      ...(children && children.length > 0 ? { children: cleanTree(children) } : {}),
    };
  });
}
function collectLabels(nodes: LocationNode[], acc = new Set<string>()) {
  for (const n of nodes) {
    acc.add(n.label);
    if (n.children?.length) collectLabels(n.children, acc);
  }
  return acc;
}
function getNodeAtPath(arr: LocationNode[], path: number[]): LocationNode {
  let cur: any = arr;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]].children!;
  return cur[path[path.length - 1]];
}
function collectSubtreeIds(node: LocationNode): string[] {
  const ids: string[] = [];
  const dfs = (n: LocationNode) => {
    ids.push(n.id);
    n.children?.forEach(dfs);
  };
  dfs(node);
  return ids;
}

export default function LocationTreeEditor() {
  const { language } = useLanguage();
  const tMap: Record<string, any> = { "zh-TW": zhTW, "en-US": enUS, "hi-IN": hiIN, de: deDE };
  const t = (tMap[language] || zhTW).Admin.LocationTree;

  // 載入樹
  const { data: treeData, error, mutate } = useSWR<LocationNode[]>("/api/location-tree", fetcher);
  // 位置使用統計（哪個節點有庫存 / 次數）
  const { data: usageData } = useSWR<{ counts: Record<string, number> }>("/api/location-tree/usage", fetcher);

  const [localTree, setLocalTree] = useState<LocationNode[]>([]);
  const [openSet, setOpenSet] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const usage = usageData?.counts ?? {};
  const hasActiveStock = (id?: string) => (id ? (usage[id] ?? 0) > 0 : false);

  function showMessage(text: string, type: "success" | "error", ms = 1400) {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), ms);
  }

  useEffect(() => {
    if (!treeData) return;
    // 確保每個節點都有 id；LOCKED_ID 保留原樣
    const attachId = (arr: any[]): LocationNode[] =>
      arr.map((n) => ({
        id: n.id || genId(),
        label: n.label,
        children: n.children ? attachId(n.children) : undefined,
      }));
    setLocalTree(attachId(treeData));
  }, [treeData]);

  // 基本陣列操作
  function removeAtPath(arr: LocationNode[], path: number[]): [LocationNode[], LocationNode] {
    const copy = clone(arr);
    let parent: any = copy;
    for (let i = 0; i < path.length - 1; i++) parent = parent[path[i]].children!;
    const idx = path[path.length - 1];
    const [node] = parent.splice(idx, 1);
    return [copy, node];
  }
  function insertAtPath(arr: LocationNode[], path: number[], node: LocationNode) {
    const copy = clone(arr);
    let parent: any = copy;
    for (let i = 0; i < path.length - 1; i++) parent = parent[path[i]].children!;
    parent.splice(path[path.length - 1], 0, node);
    return copy;
  }

  // ↑↓ 移動：LOCKED_ID 禁止
  const move = (path: number[], d: 1 | -1) =>
    setLocalTree((prev) => {
      const node = getNodeAtPath(prev, path);
      if (node.id === LOCKED_ID) {
        showMessage(`${LOCKED_NAME} 不能移動。`, "error");
        return prev;
      }
      const idx = Math.max(0, path[path.length - 1] + d);
      const [without, moved] = removeAtPath(prev, path);
      return insertAtPath(without, [...path.slice(0, -1), idx], moved);
    });

  // → 縮排：LOCKED_ID 自身不可縮排；且不可將任何節點縮排到 LOCKED_ID 底下
  const indent = (path: number[]) => {
    const idx = path[path.length - 1];
    if (idx === 0) return; // 沒有前兄弟，不能縮排
    const node = getNodeAtPath(localTree, path);
    if (node.id === LOCKED_ID) {
      showMessage(`${LOCKED_NAME} 只能在最上層，不能縮排。`, "error");
      return;
    }
    const parentPath = path.slice(0, -1);
    const wouldBeParent = getNodeAtPath(localTree, [...parentPath, idx - 1]);

    if (wouldBeParent.id === LOCKED_ID) {
      showMessage(`${LOCKED_NAME} 不可有下層。`, "error");
      return;
    }
    if (hasActiveStock(wouldBeParent.id)) {
      showMessage(
        (t.cannotIndentParenthasActiveStock ?? "此節點正要成為父節點，但它已有庫存。庫存只能掛在葉節點，請先移走庫存或改別處。"),
        "error"
      );
      return;
    }

    setLocalTree((prev) => {
      const [without, n] = removeAtPath(prev, path);
      const copy = clone(without);
      let arr: any = copy;
      for (let k of parentPath) arr = arr[k].children!;
      arr[idx - 1].children = arr[idx - 1].children || [];
      return insertAtPath(copy, [...parentPath, idx - 1, arr[idx - 1].children.length], n);
    });
  };

  // ← 反縮排：LOCKED_ID 禁止
  const outdent = (path: number[]) => {
    if (path.length < 2) return;
    const node = getNodeAtPath(localTree, path);
    if (node.id === LOCKED_ID) {
      showMessage(`${LOCKED_NAME} 只能在最上層。`, "error");
      return;
    }
    setLocalTree((prev) => {
      const [without, n] = removeAtPath(prev, path);
      const parentIdx = path[path.length - 2];
      const grandPath = path.slice(0, -2);
      return insertAtPath(without, [...grandPath, parentIdx + 1], n);
    });
  };

  // 重新命名（允許；ID 不變）
  const rename = (path: number[], newLabel: string) => {
    const copy: any = clone(localTree);
    const allLabels = collectLabels(copy);
    let target: any = copy;
    for (let i = 0; i < path.length - 1; i++) target = target[path[i]].children!;
    const node = target[path[path.length - 1]];
    if (node.label === newLabel) return;
    if (allLabels.has(newLabel)) {
      showMessage(`${t.Alert1Part1} "${newLabel}" ${t.Alert1Part2}`, "error");
      return;
    }
    node.label = newLabel;
    setLocalTree(copy);
  };

  // 新增兄弟：LOCKED_ID 禁止
  const addSibling = (path: number[]) => {
    const node = getNodeAtPath(localTree, path);
    if (node.id === LOCKED_ID) {
      showMessage(`${LOCKED_NAME} 僅可改名稱，不可新增同層節點（請在其他節點上操作）。`, "error");
      return;
    }
    const lab = prompt(t.newLabel ?? "新名稱");
    if (!lab) return;
    setLocalTree((prev) => {
      const copy: any = clone(prev);
      const allLabels = collectLabels(copy);
      if (allLabels.has(lab)) {
        showMessage(`${t.Alert1Part1} "${lab}" ${t.Alert1Part2}`, "error");
        return prev;
      }
      let parent: any = copy;
      const sibPath = path.slice(0, -1);
      for (let k of sibPath) parent = parent[k].children!;
      parent.splice(path[path.length - 1] + 1, 0, { id: genId(), label: lab });
      return copy;
    });
  };

  // 刪除節點：LOCKED_ID 禁止；其餘若自己或子孫有庫存禁止
  const deleteNode = (path: number[]) => {
    const node = getNodeAtPath(localTree, path);
    if (node.id === LOCKED_ID) {
      showMessage(`${LOCKED_NAME} 不能刪除。`, "error");
      return;
    }
    const ids = collectSubtreeIds(node);
    const hit = ids.filter((id) => hasActiveStock(id));
    if (hit.length > 0) {
      showMessage(
        (t.cannotDeletehasActiveStock ?? "此節點或其子節點仍有庫存，無法刪除。請先調整庫存位置。"),
        "error"
      );
      return;
    }
    if (!confirm(t.confirmDelete ?? "確定刪除這個節點？")) return;
    setLocalTree((prev) => removeAtPath(prev, path)[0]);
  };

  // 展開/收合（LOCKED_ID 無子層，不顯示切換）
  const toggle = (path: number[]) => {
    const key = path.join("-");
    setOpenSet((s) => {
      const ns = new Set(s);
      ns.has(key) ? ns.delete(key) : ns.add(key);
      return ns;
    });
  };

  const renderNodes = (nodes: LocationNode[], base: number[] = []): React.ReactNode =>
    nodes.map((n, i) => {
      const path = [...base, i];
      const key = path.join("-");
      const isLocked = n.id === LOCKED_ID;
      const hasChild = !isLocked && !!n.children?.length;
      const isOpen = hasChild && openSet.has(key);
      const count = usage[n.id] ?? 0;

      return (
        <div key={key} className="mb-2">
          <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded shadow">
            {hasChild ? (
              <button onClick={() => toggle(path)} className="p-1">
                {isOpen
                  ? <ChevronDown size={16} className="text-gray-600 dark:text-gray-300" />
                  : <ChevronRight size={16} className="text-gray-600 dark:text-gray-300" />}
              </button>
            ) : <div className="w-4" />}

            <span
              contentEditable
              suppressContentEditableWarning
              className={`flex-1 px-2 py-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-2 ${isLocked ? "focus:ring-amber-400" : "focus:ring-sky-400"}`}
              title={isLocked ? `${LOCKED_NAME} 只能更名` : ""}
              onBlur={(e) => rename(path, e.currentTarget.textContent || "")}
            >
              {n.label}
            </span>

            {/* 使用數量徽章 */}
            {count > 0 && (
              <span className="px-2 py-0.5 text-xs rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                {count}
              </span>
            )}

            <div className="flex gap-1">
              {!isLocked && (
                <>
                  <button onClick={() => move(path, -1)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                    <ArrowUp size={16} />
                  </button>
                  <button onClick={() => move(path, 1)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                    <ArrowDown size={16} />
                  </button>
                  <button onClick={() => indent(path)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                    <ArrowRight size={16} />
                  </button>
                  <button onClick={() => outdent(path)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                    <ArrowLeft size={16} />
                  </button>
                  <button onClick={() => addSibling(path)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                    <PlusCircle size={16} className="text-blue-600" />
                  </button>
                  <button onClick={() => deleteNode(path)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                    <Trash2 size={16} className="text-red-600" />
                  </button>
                </>
              )}
            </div>
          </div>

          {hasChild && isOpen && (
            <div className="ml-6 border-l border-gray-300 dark:border-gray-700 pl-4">
              {renderNodes(n.children!, path)}
            </div>
          )}
        </div>
      );
    });

  const handleSave = async () => {
    try {
      const payload = cleanTree(localTree);
      const res = await fetch("/api/location-tree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tree: payload }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = j?.code || "";
        if (code === "LEAF_RULE_VIOLATION") {
          showMessage(t.ServerLeafRule ?? "有庫存的節點必須是葉節點。", "error", 2200);
        } else if (code === "DELETE_BLOCKED_STOCK") {
          showMessage(t.ServerDeleteBlocked ?? "部分節點仍有庫存，無法刪除。", "error", 2200);
        } else if (code === "CONTAINER_REQUIRED") {
          showMessage(`${LOCKED_NAME} 不可移除。`, "error", 2200);
        } else if (code === "CONTAINER_MUST_BE_ROOT") {
          showMessage(`${LOCKED_NAME} 必須位於最上層。`, "error", 2200);
        } else if (code === "CONTAINER_NO_CHILDREN") {
          showMessage(`${LOCKED_NAME} 不可有下層。`, "error", 2200);
        } else {
          showMessage((t.Alert2Part2 ?? "儲存失敗") + (j?.error ? `：${j.error}` : ""), "error", 2200);
        }
        return;
      }
      showMessage(`${t.Alert2Part1 ?? "已儲存"} 🎉`, "success");
      mutate();
    } catch (err: any) {
      showMessage((t.Alert2Part2 ?? "儲存失敗") + `：${err.message}`, "error", 2200);
    }
  };

  if (error) {
    return (
      <div className="p-6 text-red-600">
        {t.LoadingFailed}：{(error as Error).message}
      </div>
    );
  }
  if (!treeData) return <div className="p-6">{t.Loading}…</div>;

  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      {message && (
        <div
          className={`mb-4 p-2 rounded ${
            message.type === "success"
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
          }`}
        >
          {message.text}
        </div>
      )}

      <h1 className="text-3xl font-bold mb-6">📍 {t.title}</h1>

      {renderNodes(localTree)}

      <button
        onClick={handleSave}
        className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
      >
        💾 {t.Save}
      </button>
    </div>
  );
}
