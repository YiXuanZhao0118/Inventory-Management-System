// lib/locationPath.ts
import { prisma } from "@/lib/prisma";

export type LocLite = { id: string; label: string; parentId: string | null };

// 讀取全部 Location（輕量欄位）
export async function fetchAllLocationsLite(): Promise<LocLite[]> {
  const rows = await prisma.location.findMany({
    select: { id: true, label: true, parentId: true },
    orderBy: { label: "asc" },
  });
  return rows;
}

// 建 path map：id -> labels[]
export function buildPathMap(rows: LocLite[]): Record<string, string[]> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const memo = new Map<string, string[]>();

  function pathOf(id: string): string[] {
    if (memo.has(id)) return memo.get(id)!;
    const node = byId.get(id);
    if (!node) return [];
    if (!node.parentId) {
      const p = [node.label];
      memo.set(id, p);
      return p;
    }
    const p = [...pathOf(node.parentId), node.label];
    memo.set(id, p);
    return p;
  }

  for (const r of rows) pathOf(r.id);
  return Object.fromEntries(memo.entries());
}

// 算每個節點的 children 數（方便前端判斷是否 leaf）
export function buildChildCount(rows: LocLite[]): Record<string, number> {
  const cnt: Record<string, number> = {};
  for (const r of rows) cnt[r.id] = 0;
  for (const r of rows) if (r.parentId) cnt[r.parentId] = (cnt[r.parentId] ?? 0) + 1;
  return cnt;
}

// 取 subtree（含自己）
export function subtreeIds(rows: LocLite[], rootId: string): string[] {
  const children = new Map<string, string[]>();
  for (const r of rows) {
    if (r.parentId) {
      if (!children.has(r.parentId)) children.set(r.parentId, []);
      children.get(r.parentId)!.push(r.id);
    }
  }
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    out.push(id);
    const ch = children.get(id) || [];
    for (const c of ch) stack.push(c);
  }
  return out;
}
