//app\api\products\usage\route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, items: [] });
  }

  // 依 productId、currentStatus 聚合
  const grouped = await prisma.stock.groupBy({
    by: ["productId", "currentStatus"],
    where: { productId: { in: ids } },
    _count: true,
  });

  const totalByProduct = new Map<string, number>();
  const hasShortTerm = new Set<string>();

  for (const row of grouped) {
    totalByProduct.set(
      row.productId,
      (totalByProduct.get(row.productId) ?? 0) + row._count
    );
    if (row.currentStatus === "short_term") {
      hasShortTerm.add(row.productId);
    }
  }

  const items = ids.map((id) => {
    const total = totalByProduct.get(id) ?? 0;
    return {
      id,
      stockCount: total,
      canDelete: total === 0,
      hasShortTerm: hasShortTerm.has(id),
    };
  });

  return NextResponse.json({ ok: true, items });
}
