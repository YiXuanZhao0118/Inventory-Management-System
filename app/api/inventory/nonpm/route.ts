// app/api/inventory/nonpm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildLocationPathMap } from "@/lib/locationPath";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type Status = "in_stock" | "short_term" | "long_term" | "discarded";
const intOr = (s: string | null, d: number) => {
  const n = s ? parseInt(s, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : d;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = (url.searchParams.get("status") ?? "in_stock") as Status;
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = intOr(url.searchParams.get("page"), 1);
  const limit = intOr(url.searchParams.get("limit"), 20);
  const debug = url.searchParams.get("debug") === "1";

  const map = await buildLocationPathMap();

  // 把「位置路徑文字」轉成可能的 locationId 清單
  const locIds =
    q.length > 0
      ? Object.entries(map)
          .filter(([, p]) => p.join("/").toLowerCase().includes(q.toLowerCase()))
          .map(([id]) => id)
      : undefined;

  // 產品欄位（name/model/brand）
  const productOr =
    q.length > 0
      ? [
          { product: { is: { name:  { contains: q, mode: "insensitive" as const } } } },
          { product: { is: { model: { contains: q, mode: "insensitive" as const } } } },
          { product: { is: { brand: { contains: q, mode: "insensitive" as const } } } },
        ] satisfies Prisma.StockWhereInput[]
      : [];

  // 位置條件（用 locIds 命中）
  const locationOr: Prisma.StockWhereInput[] =
    q.length > 0 && locIds?.length ? [{ locationId: { in: locIds } }] : [];

  // 關鍵字 OR（任一命中即可：產品欄位 或 位置）
  const keywordOr: Prisma.StockWhereInput[] = [...productOr, ...locationOr];

  // 狀態條件（discarded 放寬 OR）
  const statusClause: Prisma.StockWhereInput =
    status === "discarded"
      ? { OR: [{ discarded: true }, { currentStatus: "discarded" }] }
      : { currentStatus: status };

  // 最終 where：AND 外層 + (關鍵字 OR)
  const where: Prisma.StockWhereInput = {
    AND: [
      { product: { is: { isPropertyManaged: false } } }, // 只查 Non-PM
      statusClause,
      ...(keywordOr.length ? [{ OR: keywordOr }] : []),
    ],
  };

  // ---------- Debug ----------
  if (debug) {
    const counts = {
      totalStocks: await prisma.stock.count(),
      nonpm_total: await prisma.stock.count({ where: { product: { is: { isPropertyManaged: false } } } }),
      nonpm_discarded_any: await prisma.stock.count({
        where: { product: { is: { isPropertyManaged: false } }, OR: [{ discarded: true }, { currentStatus: "discarded" }] },
      }),
      with_q_locIds: locIds?.length ?? 0,
      with_q_products: q.length
        ? await prisma.product.count({
            where: {
              isPropertyManaged: false,
              OR: [
                { name:  { contains: q, mode: "insensitive" } },
                { model: { contains: q, mode: "insensitive" } },
                { brand: { contains: q, mode: "insensitive" } },
              ],
            },
          })
        : 0,
      final_group_count: (
        await prisma.stock.groupBy({
          where,
          by: ["productId", "locationId"],
          _count: { _all: true },
        })
      ).length,
    };
    return NextResponse.json({ debug: counts, where, status, q, page, limit });
  }
  // ---------------------------

  // 先算總群組數
  const allGroups = await prisma.stock.groupBy({
    where,
    by: ["productId", "locationId"],
    _count: { _all: true },
  });
  const total = allGroups.length;

  // 分頁群組
  const groups = await prisma.stock.groupBy({
    where,
    by: ["productId", "locationId"],
    _count: { _all: true },
    orderBy: [{ productId: "asc" }, { locationId: "asc" }],
    skip: (page - 1) * limit,
    take: limit,
  });

  const productIds = Array.from(new Set(groups.map((g) => g.productId)));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, model: true, brand: true },
  });
  const prodMap = new Map(products.map((p) => [p.id, p]));

  const items = groups.map((g) => ({
    product: prodMap.get(g.productId) ?? { id: g.productId, name: "", model: "", brand: "" },
    locationId: g.locationId,
    locationPath: map[g.locationId] ?? [],
    quantity: g._count._all,
    currentStatus: status,
  }));

  return NextResponse.json({
    items,
    page: { page, pageSize: limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}
