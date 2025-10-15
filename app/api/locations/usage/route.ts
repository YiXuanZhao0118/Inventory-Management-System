// app/api/locations/usage/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const grouped = await prisma.stock.groupBy({
    by: ["locationId"],
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.locationId] = g._count._all;
  return NextResponse.json({ ok: true, counts });
}
