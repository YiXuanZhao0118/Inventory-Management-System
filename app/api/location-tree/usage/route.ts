// app/api/location-tree/usage/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getStock } from "@/lib/db";

export async function GET() {
  const counts: Record<string, number> = {};
  function isActiveStock(s: any) {
    return !s?.discarded && s?.currentStatus !== "discarded";
  }

  const stock = getStock().filter(isActiveStock);
  for (const s of stock) {
    counts[s.locationId] = (counts[s.locationId] ?? 0) + 1;
  }
  return NextResponse.json({ counts });
}
