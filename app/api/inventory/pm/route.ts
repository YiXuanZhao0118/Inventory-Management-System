// app/api/inventory/pm/route.ts (fixed)
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const status = (url.searchParams.get("status") ?? "in_stock") as Status;
  const qRaw = (url.searchParams.get("q") ?? "").trim();
  const page = intOr(url.searchParams.get("page"), 1);
  const limit = intOr(url.searchParams.get("limit"), 20);
  const debug = url.searchParams.get("debug") === "1";

  const map = await buildLocationPathMap();

  // Match locations by label/path text -> list of locationIds
  const locIds =
    qRaw.length > 0
      ? Object.entries(map)
          .filter(([, p]) =>
            p.join("/").toLowerCase().includes(qRaw.toLowerCase())
          )
          .map(([id]) => id)
      : undefined;

  // ===== Keyword OR (any hit qualifies) =====
  const keywordOr: Prisma.StockWhereInput[] = [];
  if (qRaw.length > 0) {
    // Product string fields
    keywordOr.push({
      product: {
        is: {
          OR: [
            { name: { contains: qRaw, mode: "insensitive" } },
            { model: { contains: qRaw, mode: "insensitive" } },
            { brand: { contains: qRaw, mode: "insensitive" } },
          ],
        },
      },
    });

    // IAMS (string)
    keywordOr.push({
      iams: { is: { iamsId: { contains: qRaw, mode: "insensitive" } } },
    });

    // Location by label/path -> turn into locationId IN [...]
    if (locIds?.length) keywordOr.push({ locationId: { in: locIds } });

    // If q is a full UUID, allow equality on UUID columns (NO contains on UUID)
    if (UUID_RE.test(qRaw)) {
      const v = qRaw.toLowerCase();
      keywordOr.push({ id: v });
      keywordOr.push({ locationId: v });
      // Add more as needed:
      // keywordOr.push({ productId: v });
    }
  }

  // ===== Status clause =====
  const statusClause: Prisma.StockWhereInput =
    status === "discarded"
      ? { OR: [{ discarded: true }, { currentStatus: "discarded" }] }
      : { currentStatus: status };

  // ===== Final where: AND + (keyword OR) =====
  const where: Prisma.StockWhereInput = {
    AND: [
      { product: { is: { isPropertyManaged: true } } }, // PM-only
      statusClause,
      ...(keywordOr.length ? [{ OR: keywordOr }] : []),
    ],
  };

  if (debug) {
    const counts = {
      totalStocks: await prisma.stock.count(),
      pm_total: await prisma.stock.count({
        where: { product: { is: { isPropertyManaged: true } } },
      }),
      pm_discarded_any: await prisma.stock.count({
        where: {
          product: { is: { isPropertyManaged: true } },
          OR: [{ discarded: true }, { currentStatus: "discarded" }],
        },
      }),
      q_iams_match:
        qRaw.length > 0
          ? await prisma.iamsMapping.count({
              where: { iamsId: { contains: qRaw, mode: "insensitive" } },
            })
          : 0,
      final_rows: await prisma.stock.count({ where }),
      q_locIds: locIds?.length ?? 0,
    };
    return NextResponse.json({ debug: counts, where, status, q: qRaw, page, limit });
  }

  // Query
  const [total, itemsRaw] = await Promise.all([
    prisma.stock.count({ where }),
    prisma.stock.findMany({
      where,
      include: {
        product: {
          select: { id: true, name: true, model: true, brand: true },
        },
        iams: { select: { iamsId: true } },
      },
      orderBy: [{ id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const items = itemsRaw.map((s) => ({
    stockId: s.id,
    product: s.product!,
    locationId: s.locationId,
    locationPath: map[s.locationId] ?? [],
    currentStatus: s.currentStatus as Status,
    iamsId: s.iams?.iamsId ?? null,
  }));

  return NextResponse.json({
    items,
    page: {
      page,
      pageSize: limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}
