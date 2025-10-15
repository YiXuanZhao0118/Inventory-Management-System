import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const includeDeviceNames =
      searchParams.get("includeDeviceNames") === "1" ||
      searchParams.get("includeDeviceNames") === "true";

    // 取出所有短租未歸還紀錄，連到 stock.iams
    const rentals = await prisma.rental.findMany({
      where: { loanType: "short_term", returnDate: null },
      include: {
        product: true,
        location: true,
        stock: { include: { iams: true } }, // ← 取 IAMS
      },
      orderBy: { loanDate: "desc" },
    });

    // 構建 location 路徑
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

    // borrower 名稱對照表（可選）
    let deviceNameMap: Record<string, string> = {};
    if (includeDeviceNames) {
      const borrowerIds = Array.from(new Set(rentals.map((r) => r.borrower)));
      if (borrowerIds.length > 0) {
        const devs = await prisma.device.findMany({
          where: { id: { in: borrowerIds } },
          select: { id: true, name: true },
        });
        deviceNameMap = Object.fromEntries(devs.map((d) => [d.id, d.name]));
      }
    }

    return NextResponse.json({
      items: rentals.map((r) => ({
        id: r.id,
        stockId: r.stockId,
        iamsId: r.stock?.iams?.iamsId ?? null, // ← 回傳 IAMS
        borrowerId: r.borrower,
        borrowerName: includeDeviceNames ? deviceNameMap[r.borrower] ?? null : undefined,
        renter: r.renter,
        loanDate: r.loanDate.toISOString(),
        dueDate: r.dueDate ? r.dueDate.toISOString() : null,
        product: {
          id: r.productId,
          name: r.product.name,
          brand: r.product.brand,
          model: r.product.model,
        },
        location: {
          id: r.locationId,
          label: r.location.label,
          path: buildPath(r.locationId),
        },
      })),
      deviceNameMap: includeDeviceNames ? deviceNameMap : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
