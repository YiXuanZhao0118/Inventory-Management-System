// app/api/location-tree/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  getLocationTree,
  saveLocationTree,
  getStock,
  type LocationNode,
} from "@/lib/db";

const LOCKED_ID = "1";               // 固定節點 id（Container Area）
const LOCATION_ID_RE = /^\d{13}[0-9a-f]{13}$/; // 一般節點規則（LOCKED_ID 例外）

function isActiveStock(s: any) {
  return !s?.discarded && s?.currentStatus !== "discarded";
}

function generateLocationId(): string {
  const ts = Date.now().toString();                // 13 digits
  const randHex = crypto.randomBytes(7).toString("hex").slice(0, 13);
  return ts + randHex;                              // total 26 chars
}

function flattenIds(nodes: LocationNode[]): string[] {
  const ids: string[] = [];
  const dfs = (arr: LocationNode[]) => {
    for (const n of arr) {
      ids.push(n.id);
      if (n.children?.length) dfs(n.children);
    }
  };
  dfs(nodes);
  return ids;
}

function buildChildMap(nodes: LocationNode[]): Map<string, number> {
  const m = new Map<string, number>();
  const dfs = (arr: LocationNode[]) => {
    for (const n of arr) {
      const cnt = n.children?.length ?? 0;
      m.set(n.id, cnt);
      if (cnt) dfs(n.children!);
    }
  };
  dfs(nodes);
  return m;
}

function collectSubtreeIds(root: LocationNode): string[] {
  const acc: string[] = [];
  const dfs = (n: LocationNode) => {
    acc.push(n.id);
    n.children?.forEach(dfs);
  };
  dfs(root);
  return acc;
}

/**
 * 僅替換「新節點」(不在 prevIds 內) 且 id 缺失、重複或格式不符的情況。
 * LOCKED_ID 永遠保留原 id，不參與正則規範化。
 */
function normalizeNewNodeIds(
  nodes: LocationNode[],
  prevIds: Set<string>
): Record<string, string> {
  const replaced: Record<string, string> = {};
  const used = new Set<string>(prevIds);

  const dfs = (arr: LocationNode[]) => {
    for (const n of arr) {
      if (n.id === LOCKED_ID) { // 保留
        used.add(n.id);
      } else {
        const isNew = !prevIds.has(n.id);
        if (isNew) {
          const needsNew = !n.id || !LOCATION_ID_RE.test(n.id) || used.has(n.id);
          if (needsNew) {
            const old = n.id;
            let id: string;
            do {
              id = generateLocationId();
            } while (used.has(id));
            n.id = id;
            if (old && old !== id) replaced[old] = id;
          }
        }
        used.add(n.id);
      }
      if (n.children?.length) dfs(n.children);
    }
  };

  dfs(nodes);
  return replaced;
}

// 幫助函式：搜尋某 id 是否存在於 root 層以外
function existsOutsideRoot(nodes: LocationNode[], targetId: string): boolean {
  // 先檢查 root 層
  if (nodes.some(n => n.id === targetId)) return false;
  // 再檢查子孫
  const stack = [...nodes];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.children) {
      for (const c of n.children) {
        if (c.id === targetId) return true;
        if (c.children?.length) stack.push(c);
      }
    }
  }
  return false;
}

export async function GET() {
  try {
    const tree = getLocationTree();
    return NextResponse.json(tree);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "GET failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const nextTree = (body?.tree ?? []) as LocationNode[];

    // 舊樹與舊 ID
    const prevTree = getLocationTree();
    const prevIds = new Set(flattenIds(prevTree));

    // （關鍵1）規範化新節點 ID（LOCKED_ID 例外）
    const replaced = normalizeNewNodeIds(nextTree, prevIds);

    // （關鍵2）後端強制驗證
    const nextIds = new Set(flattenIds(nextTree));
    const childMap = buildChildMap(nextTree);

    // 2-1) Container Area 不可被刪除
    if (prevIds.has(LOCKED_ID) && !nextIds.has(LOCKED_ID)) {
      return NextResponse.json(
        { error: "Container Area must not be removed.", code: "CONTAINER_REQUIRED" },
        { status: 400 }
      );
    }

    // 2-2) Container Area 必須位於最上層
    if (existsOutsideRoot(nextTree, LOCKED_ID)) {
      return NextResponse.json(
        { error: "Container Area must stay at the root level.", code: "CONTAINER_MUST_BE_ROOT" },
        { status: 400 }
      );
    }

    // 2-3) Container Area 不可有子節點
    const rootLocked = nextTree.find(n => n.id === LOCKED_ID);
    if (rootLocked && rootLocked.children && rootLocked.children.length > 0) {
      return NextResponse.json(
        { error: "Container Area cannot have children.", code: "CONTAINER_NO_CHILDREN" },
        { status: 400 }
      );
    }

    // 2-4) 刪除驗證：被刪掉的節點若尚有庫存，禁止
    const removedIds = [...prevIds].filter((id) => !nextIds.has(id));
    const activeStock = getStock().filter(isActiveStock);
    const removedInUse = new Set(
      activeStock.filter(s => removedIds.includes(s.locationId)).map(s => s.locationId)
    );
    // 若有庫存的節點被刪除，回傳錯誤`
    if (removedInUse.size > 0) {
      return NextResponse.json(
        {
          error: "Some locations still have stock and cannot be removed.",
          blockedLocationIds: [...removedInUse],
          code: "DELETE_BLOCKED_STOCK",
        },
        { status: 400 }
      );
    }

    // 2-5) 葉節點驗證：持有庫存的位置，必須為葉節點
    const badLeaf = new Set<string>();
    for (const s of activeStock) {
      if (!nextIds.has(s.locationId)) {
        badLeaf.add(s.locationId);
      } else {
        const childCount = childMap.get(s.locationId) ?? 0;
        if (childCount > 0) badLeaf.add(s.locationId);
      }
    }

    if (badLeaf.size > 0) {
      return NextResponse.json(
        {
          error:
            "Locations that hold stock must be leaf nodes (no children). Please adjust the hierarchy.",
          nonLeafWithStock: [...badLeaf],
          code: "LEAF_RULE_VIOLATION",
        },
        { status: 400 }
      );
    }

    // 都 OK 才儲存
    saveLocationTree(nextTree);

    return NextResponse.json({ success: true, tree: nextTree, replaced });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "POST failed" }, { status: 400 });
  }
}
