// app/api/inventory/transfer/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PMRow = {
  stockId: string;
  fromLocation: string;
  toLocation: string;
};

type NonPMRow = {
  ProductId: string;
  LocationId: string;   // fromLocation
  quantity: number;
  fromLocation?: string; // 兼容舊 payload，若有就用它覆蓋 LocationId
  toLocation: string;
};

type Payload = {
  PropertyManaged?: PMRow[];
  nonPropertyManaged?: NonPMRow[];
  note?: string; // 目前 schema 沒有 note 欄位，先忽略
};

async function isLeafLocation(id: string) {
  const child = await prisma.location.findFirst({
    where: { parentId: id },
    select: { id: true },
  });
  return !child;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Payload;

    const pmRows = Array.isArray(body.PropertyManaged) ? body.PropertyManaged : [];
    const nonRows = Array.isArray(body.nonPropertyManaged) ? body.nonPropertyManaged : [];

    if (pmRows.length === 0 && nonRows.length === 0) {
      return NextResponse.json({ ok: false, message: "No rows to transfer." }, { status: 400 });
    }

    // 蒐集要檢查是否為葉節點的目標位置
    const toIds = new Set<string>();
    pmRows.forEach((r) => r?.toLocation && toIds.add(r.toLocation));
    nonRows.forEach((r) => r?.toLocation && toIds.add(r.toLocation));

    // 快取葉節點檢查結果
    const leafCache = new Map<string, boolean>();
    for (const id of toIds) {
      leafCache.set(id, await isLeafLocation(id));
    }

    const details: Array<{ stockId: string; ok: boolean; message?: string }> = [];
    let moved = 0;

    /* ------------------------- PM：逐件搬 ------------------------- */
    for (const row of pmRows) {
      const stockId = row?.stockId?.trim();
      const toLocation = row?.toLocation?.trim();
      const fromLocation = row?.fromLocation?.trim();

      if (!stockId || !toLocation || !fromLocation) {
        details.push({ stockId: stockId || "(pm:missing)", ok: false, message: "Missing stockId/from/to" });
        continue;
      }
      if (!leafCache.get(toLocation)) {
        details.push({ stockId, ok: false, message: "Destination is not a leaf location" });
        continue;
      }

      const stock = await prisma.stock.findUnique({
        where: { id: stockId },
        select: { id: true, locationId: true, discarded: true, currentStatus: true },
      });
      if (!stock) {
        details.push({ stockId, ok: false, message: "Stock not found" });
        continue;
      }
      if (stock.discarded) {
        details.push({ stockId, ok: false, message: "Stock is discarded" });
        continue;
      }
      if (stock.currentStatus !== "in_stock") {
        details.push({ stockId, ok: false, message: "Stock is not in 'in_stock'" });
        continue;
      }
      if (stock.locationId !== fromLocation) {
        details.push({ stockId, ok: false, message: "Stock not at fromLocation" });
        continue;
      }
      if (fromLocation === toLocation) {
        details.push({ stockId, ok: false, message: "fromLocation equals toLocation" });
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.stock.update({
          where: { id: stockId },
          data: { locationId: toLocation },
        });
        await tx.transfer.create({
          data: {
            stockId,
            fromLocation,
            toLocation,
            // note: body.note ?? undefined, // 如果你之後在 schema 加上 note 欄位
          },
        });
      });

      moved += 1;
      details.push({ stockId, ok: true });
    }

    /* ---------------------- Non-PM：依數量搬 ---------------------- */
    for (const row of nonRows) {
      const productId = row?.ProductId?.trim();
      const fromLocation = (row?.fromLocation || row?.LocationId || "").trim();
      const toLocation = row?.toLocation?.trim();
      const qty = Math.max(0, Math.floor(Number(row?.quantity ?? 0)));

      const groupKey = `${productId}@${fromLocation}`;

      if (!productId || !fromLocation || !toLocation || qty <= 0) {
        details.push({ stockId: groupKey, ok: false, message: "Missing product/from/to or non-positive quantity" });
        continue;
      }
      if (!leafCache.get(toLocation)) {
        details.push({ stockId: groupKey, ok: false, message: "Destination is not a leaf location" });
        continue;
      }
      if (fromLocation === toLocation) {
        details.push({ stockId: groupKey, ok: false, message: "fromLocation equals toLocation" });
        continue;
      }

      // 撈出可搬的 Stock
      const candidates = await prisma.stock.findMany({
        where: {
          productId,
          locationId: fromLocation,
          discarded: false,
          currentStatus: "in_stock",
        },
        select: { id: true, locationId: true },
        orderBy: { createdAt: "asc" },
        take: qty,
      });

      if (candidates.length === 0) {
        details.push({ stockId: groupKey, ok: false, message: "No available stock to move" });
        continue;
      }

      // 逐筆更新 + 寫 Transfer
      for (const s of candidates) {
        await prisma.$transaction(async (tx) => {
          await tx.stock.update({
            where: { id: s.id },
            data: { locationId: toLocation },
          });
          await tx.transfer.create({
            data: {
              stockId: s.id,
              fromLocation: s.locationId,
              toLocation,
              // note: body.note ?? undefined,
            },
          });
        });
        moved += 1;
        details.push({ stockId: s.id, ok: true });
      }

      if (candidates.length < qty) {
        details.push({
          stockId: groupKey,
          ok: false,
          message: `Only moved ${candidates.length}/${qty}`,
        });
      }
    }

    return NextResponse.json({ ok: true, moved, details });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message || "Unexpected error" },
      { status: 500 }
    );
  }
}
