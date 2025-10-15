// lib/locationPath.ts
import "server-only";
import { prisma } from "@/lib/prisma";

/** 每個 locationId 對應一條從 root 到自己的標籤路徑 */
export type LocationPathMap = Record<string, string[]>;

type Row = {
  id: string;
  parentId: string | null;
  label: string; // 如果你的欄位叫 name，請把這行與下方對應處改成 name
};

// 簡單快取，避免同一次請求內重複查 DB
let _cache: { at: number; map: LocationPathMap } | null = null;
const TTL_MS = 60_000;

/**
 * 取出所有 Location，建立 {id -> [path labels]} 對照表
 * 不依賴 Prisma 的 self relation；只要有 id / parentId / label 即可
 */
export async function buildLocationPathMap(force = false): Promise<LocationPathMap> {
  if (!force && _cache && Date.now() - _cache.at < TTL_MS) return _cache.map;

  // 如果你的欄位叫 name：請把 select 改成 { id: true, parentId: true, name: true }
  const rows = await prisma.location.findMany({
    select: { id: true, parentId: true, label: true },
  }) as unknown as Row[];

  const byId = new Map<string, Row>(rows.map((r) => [r.id, r]));
  const memo: LocationPathMap = {};

  const pathOf = (id: string | null): string[] => {
    if (!id) return [];
    if (memo[id]) return memo[id];
    const node = byId.get(id);
    if (!node) return [];
    const p = [...pathOf(node.parentId), node.label];
    memo[id] = p;
    return p;
  };

  for (const r of rows) pathOf(r.id);

  _cache = { at: Date.now(), map: memo };
  return memo;
}

/**
 * 取得所有「葉節點」的 locationId（沒有任何子節點）
 * 不依賴 Prisma 的 children 關聯：直接用 parentId 集合計算
 */
export async function getLeafLocationIds(): Promise<Set<string>> {
  // 如果欄位叫 name：同上改 select
  const rows = await prisma.location.findMany({
    select: { id: true, parentId: true, label: true },
  }) as unknown as Row[];

  const allIds = new Set<string>(rows.map((r) => r.id));
  const parentIds = new Set<string>(rows.map((r) => r.parentId).filter(Boolean) as string[]);
  // 葉節點 = 不是任何人的 parentId
  for (const pid of parentIds) {
    allIds.delete(pid);
  }
  return allIds;
}

/** 需求變更時可手動清快取 */
export function invalidateLocationPathCache() {
  _cache = null;
}
