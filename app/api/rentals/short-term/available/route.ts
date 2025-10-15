import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  try {
    const stocks = await prisma.stock.findMany({
      where: {
        discarded: false,
        currentStatus: "in_stock",
        product: { isPropertyManaged: true },
      },
      include: { product: true, location: true },
      orderBy: { createdAt: "desc" },
    });

    // 為可借清單同樣附上完整的 location 路徑
    const allLocations = await prisma.location.findMany({
      select: { id: true, parentId: true, label: true },
    });
    const locById = new Map(allLocations.map((l) => [l.id, l]));
    const pathCache = new Map<string, string>();
    const buildPath = (id: string): string => {
      if (pathCache.has(id)) return pathCache.get(id)!;
      const chain: string[] = [];
      let cur = locById.get(id);
      const guard = new Set<string>();
      while (cur && !guard.has(cur.id)) {
        guard.add(cur.id);
        chain.push(cur.label);
        cur = cur.parentId ? locById.get(cur.parentId) : undefined;
      }
      const path = chain.reverse().join(" / ");
      pathCache.set(id, path);
      return path;
    };

    return NextResponse.json({
      items: stocks.map((s) => ({
        stockId: s.id,
        product: {
          id: s.productId,
          name: s.product.name,
          brand: s.product.brand,
          model: s.product.model,
        },
        location: {
          id: s.locationId,
          label: s.location.label,     // 保留
          path: buildPath(s.locationId) // 新增：完整路徑
        },
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 },
    );
  }
}
