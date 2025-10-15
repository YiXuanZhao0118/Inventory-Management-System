// app/api/locations/leaves/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await prisma.location.findMany({
    select: { id: true, parentId: true, label: true },
    orderBy: { label: "asc" },
  });

  // 判斷哪些節點有子節點
  const hasChild = new Set(rows.filter(r => r.parentId !== null).map(r => r.parentId!));
  const leaves = rows.filter(r => !hasChild.has(r.id));

  // 建 labelPath
  const byId = new Map(rows.map(r => [r.id, r]));
  const pathCache = new Map<string, string[]>();
  const buildPath = (id: string): string[] => {
    if (pathCache.has(id)) return pathCache.get(id)!;
    const node = byId.get(id);
    if (!node) return [];
    const cur = node.label ?? id;
    const arr = node.parentId ? [...buildPath(node.parentId), cur] : [cur];
    pathCache.set(id, arr);
    return arr;
  };

  const items = leaves.map(l => ({
    id: l.id,
    label: l.label ?? l.id,
    labelPath: buildPath(l.id),
  }));

  return NextResponse.json({ items });
}
