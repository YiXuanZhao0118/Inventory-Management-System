// app/api/inventory/pm/iams/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/inventory/pm/iams
 * body: { stockId: string; iamsId: string }  // iamsId 可為空字串 => 代表清除
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { stockId?: string; iamsId?: string }
      | null;

    const stockId = (body?.stockId ?? "").trim();
    const iamsIdRaw = (body?.iamsId ?? "").trim();

    if (!stockId) {
      return NextResponse.json({ error: "stockId is required" }, { status: 400 });
    }

    // 只允許 PM 的庫存
    const stock = await prisma.stock.findUnique({
      where: { id: stockId },
      select: { product: { select: { isPropertyManaged: true } } },
    });
    if (!stock) return NextResponse.json({ error: "stock not found" }, { status: 404 });
    if (!stock.product.isPropertyManaged) {
      return NextResponse.json({ error: "only PM stock can set iamsId" }, { status: 400 });
    }

    // 清除 iamsId => 直接刪掉對應列
    if (iamsIdRaw === "") {
      await prisma.iamsMapping.deleteMany({ where: { stockId } });
      return NextResponse.json({ ok: true, cleared: true });
    }

    // upsert（需確保 Prisma schema 對 IamsMapping.stockId 有唯一約束）
    await prisma.iamsMapping.upsert({
      where: { stockId }, // stockId 必須是唯一鍵或主鍵
      create: { stockId, iamsId: iamsIdRaw },
      update: { iamsId: iamsIdRaw },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
