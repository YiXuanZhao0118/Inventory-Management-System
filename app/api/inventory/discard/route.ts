//app\api\inventory\discard\route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PMRow = { stockId: string };
type NonRow = { ProductId: string; LocationId: string; quantity: number };

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const pmRows = Array.isArray(body?.PropertyManaged) ? (body.PropertyManaged as PMRow[]) : [];
  const nonRows = Array.isArray(body?.nonPropertyManaged) ? (body.nonPropertyManaged as NonRow[]) : [];
  const reason: string | undefined = body?.reason || undefined;
  const operator: string | undefined = body?.operator || undefined;
  const dateStr: string | undefined = body?.date || undefined;

  const discardDate =
    dateStr && typeof dateStr === "string"
      ? new Date(dateStr) // yyyy-MM-dd
      : new Date();

  if (isNaN(discardDate.getTime())) {
    return NextResponse.json({ ok: false, message: "Invalid date" }, { status: 400 });
  }

  if (pmRows.length === 0 && nonRows.length === 0) {
    return NextResponse.json({ ok: false, message: "Nothing to discard" }, { status: 400 });
  }

  const details: Array<{ stockId: string; ok: boolean; message?: string }> = [];
  let successCount = 0;

  // -------- PM: discard by stockId (ONLY allow in_stock) --------
  for (const row of pmRows) {
    const stockId = String(row.stockId || "").trim();
    if (!stockId) {
      details.push({ stockId: "", ok: false, message: "Missing stockId" });
      continue;
    }
    try {
      await prisma.$transaction(async (tx) => {
        const s = await tx.stock.findUnique({
          where: { id: stockId },
          include: { product: { select: { id: true, isPropertyManaged: true } } },
        });
        if (!s) throw new Error("Stock not found");
        if (s.discarded) throw new Error("Already discarded");
        if (!s.product.isPropertyManaged) throw new Error("Not a PM item");

        // ✅ Only allow in_stock to be discarded (as requested)
        if (s.currentStatus !== "in_stock") {
          throw new Error(`Status "${s.currentStatus}" not allowed to discard (only in_stock).`);
        }

        await tx.stock.update({
          where: { id: stockId },
          data: { discarded: true, currentStatus: "discarded" },
        });

        await tx.discarded.create({
          data: {
            stockId,
            productId: s.productId,
            locationId: s.locationId,
            discardReason: reason,
            discardOperator: operator,
            discardDate,
          },
        });
      });

      details.push({ stockId, ok: true });
      successCount += 1;
    } catch (e: any) {
      details.push({ stockId, ok: false, message: e?.message || String(e) });
    }
  }

  // -------- Non-PM: discard N items by product+location (only in_stock) --------
  for (const row of nonRows) {
    const productId = String((row as any).ProductId || "").trim();
    const locationId = String((row as any).LocationId || "").trim();
    const qty = Math.max(0, Math.floor(Number(row.quantity || 0)));
    const groupKey = `${productId}@${locationId}`;

    if (!productId || !locationId || qty <= 0) {
      details.push({ stockId: groupKey, ok: false, message: "Invalid non-PM row" });
      continue;
    }

    try {
      // candidate non-PM stocks to discard (in_stock only)
      const candidates = await prisma.stock.findMany({
        where: {
          productId,
          locationId,
          discarded: false,
          currentStatus: "in_stock",
          product: { is: { isPropertyManaged: false } },
        },
        orderBy: { createdAt: "asc" },
        take: qty,
      });

      if (candidates.length === 0) {
        details.push({ stockId: groupKey, ok: false, message: "No available stock to discard" });
        continue;
      }

      for (const s of candidates) {
        try {
          await prisma.$transaction(async (tx) => {
            await tx.stock.update({
              where: { id: s.id },
              data: { discarded: true, currentStatus: "discarded" },
            });
            await tx.discarded.create({
              data: {
                stockId: s.id,
                productId: s.productId,
                locationId: s.locationId,
                discardReason: reason,
                discardOperator: operator,
                discardDate,
              },
            });
          });
          details.push({ stockId: s.id, ok: true });
          successCount += 1;
        } catch (e: any) {
          details.push({ stockId: s.id, ok: false, message: e?.message || String(e) });
        }
      }

      if (candidates.length < qty) {
        details.push({
          stockId: groupKey,
          ok: false,
          message: `Requested ${qty}, discarded ${candidates.length}`,
        });
      }
    } catch (e: any) {
      details.push({ stockId: groupKey, ok: false, message: e?.message || String(e) });
    }
  }

  return NextResponse.json({ ok: true, discarded: successCount, details });
}
