//app\api\inventory\add\route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StockStatus, Prisma } from "@prisma/client";
import { ROOT_LOCATION_ID, UUID_RE } from "@/src/lib/config";

export const dynamic = "force-dynamic";

type PMRow = { productId: string };
type NonPMRow = { productId: string; quantity: number };

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const pmRows: PMRow[] = Array.isArray(body?.PropertyManaged) ? body.PropertyManaged : [];
  const nonRows: NonPMRow[] = Array.isArray(body?.nonPropertyManaged) ? body.nonPropertyManaged : [];

  if (pmRows.length === 0 && nonRows.length === 0) {
    return NextResponse.json({ ok: false, message: "Nothing to add" }, { status: 400 });
  }

  // 先驗 ROOT 是否存在
  const root = await prisma.location.findUnique({ where: { id: ROOT_LOCATION_ID }, select: { id: true } });
  if (!root) {
    return NextResponse.json(
      { ok: false, message: "ROOT_LOCATION_ID does not exist in Location table." },
      { status: 500 }
    );
  }

  // 收集與驗證 productId
  const allIds = Array.from(
    new Set<string>([
      ...pmRows.map((r) => r?.productId).filter(Boolean),
      ...nonRows.map((r) => r?.productId).filter(Boolean),
    ])
  );

  if (allIds.length === 0) {
    return NextResponse.json({ ok: false, message: "No valid productId provided" }, { status: 400 });
  }

  // UUID 檢查
  const invalidIds = allIds.filter((id) => !UUID_RE.test(id));
  if (invalidIds.length) {
    return NextResponse.json(
      { ok: false, message: "Invalid UUID in productId", invalidIds },
      { status: 400 }
    );
  }

  // 讀產品 isPropertyManaged
  const products = await prisma.product.findMany({
    where: { id: { in: allIds } },
    select: { id: true, isPropertyManaged: true },
  });
  const map = new Map(products.map((p) => [p.id, p.isPropertyManaged]));

  const errors: Array<{ productId: string; message: string }> = [];

  for (const id of allIds) {
    if (!map.has(id)) errors.push({ productId: id, message: "Product not found" });
  }

  for (const r of pmRows) {
    const isPM = map.get(r.productId);
    if (isPM === false) errors.push({ productId: r.productId, message: "Product is NOT property-managed" });
  }
  for (const r of nonRows) {
    const isPM = map.get(r.productId);
    if (isPM === true) errors.push({ productId: r.productId, message: "Product is property-managed" });
    const qty = Math.max(0, Math.floor(Number(r.quantity)));
    if (!qty) errors.push({ productId: r.productId, message: "Invalid quantity" });
  }

  if (errors.length) {
    return NextResponse.json({ ok: false, message: "Validation failed", errors }, { status: 400 });
  }

  // 準備 Stock rows（全部固定落到 ROOT_LOCATION_ID）
  const pmData: Prisma.StockCreateManyInput[] = pmRows.map((r) => ({
    productId: r.productId,
    locationId: ROOT_LOCATION_ID,
    currentStatus: StockStatus.in_stock,
    discarded: false,
  }));

  const nonData: Prisma.StockCreateManyInput[] = [];
  for (const r of nonRows) {
    const qty = Math.max(0, Math.floor(Number(r.quantity)));
    for (let i = 0; i < qty; i++) {
      nonData.push({
        productId: r.productId,
        locationId: ROOT_LOCATION_ID,
        currentStatus: StockStatus.in_stock,
        discarded: false,
      });
    }
  }

  // 交易寫入（大批量切塊）
  let createdPM = 0;
  let createdNon = 0;

  await prisma.$transaction(async (tx) => {
    if (pmData.length) {
      const res = await tx.stock.createMany({ data: pmData, skipDuplicates: false });
      createdPM = res.count;
    }
    if (nonData.length) {
      const CHUNK = 1000;
      for (let i = 0; i < nonData.length; i += CHUNK) {
        const chunk = nonData.slice(i, i + CHUNK);
        const res = await tx.stock.createMany({ data: chunk, skipDuplicates: false });
        createdNon += res.count;
      }
    }
  });

  return NextResponse.json({
    ok: true,
    created: { pm: createdPM, nonPM: createdNon },
    total: createdPM + createdNon,
  });
}
