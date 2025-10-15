// app/api/rentals/long-term/return/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// 前端會送這兩個陣列
type PMInput = { stockId: string };
type NonPMInput = {
  productId: string;
  locationId: string;
  borrower: string;
  renter: string;
  quantity: number;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 兼容不同大小寫欄位名
    const PropertyManaged: PMInput[] =
      (Array.isArray(body?.PropertyManaged) && body.PropertyManaged) ||
      (Array.isArray(body?.propertyManaged) && body.propertyManaged) ||
      [];

    const nonPropertyManaged: NonPMInput[] =
      (Array.isArray(body?.nonPropertyManaged) && body.nonPropertyManaged) ||
      (Array.isArray(body?.NonPropertyManaged) && body.NonPropertyManaged) ||
      [];

    if (!Array.isArray(PropertyManaged) || !Array.isArray(nonPropertyManaged)) {
      return NextResponse.json(
        { message: "Invalid payload: PropertyManaged / nonPropertyManaged must be arrays" },
        { status: 400 }
      );
    }

    const now = new Date();
    const tx: any[] = [];
    let pmClosed = 0;
    let nonClosed = 0;
    let nonRequested = 0;

    // === PM：用 stockId 精準關閉一筆「未歸還、長期借出」 ===
    for (const item of PropertyManaged) {
      if (!item?.stockId) continue;

      // 找到該 stockId 尚未歸還的一筆（理論上 1 筆）
      const open = await prisma.rental.findFirst({
        where: {
          loanType: "long_term",
          returnDate: null,
          stockId: item.stockId,
          product: { isPropertyManaged: true },
        },
        select: { id: true, stockId: true },
        orderBy: [{ loanDate: "asc" }, { id: "asc" }],
      });

      if (!open) continue;

      tx.push(
        prisma.rental.update({
          where: { id: open.id },
          data: { returnDate: now },
        }),
        prisma.stock.update({
          where: { id: open.stockId },
          data: { currentStatus: "in_stock" }, // Prisma enum StockStatus
        })
      );
      pmClosed += 1;
    }

    // === Non-PM：依「群組鍵」找到 N 筆 open rentals，FIFO 關閉 ===
    for (const g of nonPropertyManaged) {
      if (!g?.productId || !g?.locationId) continue;
      const qty = Math.max(0, Number(g.quantity) || 0);
      if (qty === 0) continue;

      nonRequested += qty;

      const borrower = (g.borrower ?? "").trim();
      const renter = (g.renter ?? "").trim();

      // 只用群組鍵 + open 條件，不使用 loanDate/dueDate 比對
      const opens = await prisma.rental.findMany({
        where: {
          loanType: "long_term",
          returnDate: null,
          productId: g.productId,
          locationId: g.locationId,
          borrower,
          renter,
          product: { isPropertyManaged: false },
        },
        select: { id: true, stockId: true, loanDate: true },
        orderBy: [{ loanDate: "asc" }, { id: "asc" }],
        take: qty,
      });

      if (opens.length === 0) continue;

      for (const r of opens) {
        tx.push(
          prisma.rental.update({
            where: { id: r.id },
            data: { returnDate: now },
          }),
          prisma.stock.update({
            where: { id: r.stockId },
            data: { currentStatus: "in_stock" },
          })
        );
      }
      nonClosed += opens.length;
    }

    // 事務提交
    if (tx.length > 0) {
      await prisma.$transaction(tx);
    }

    const partial = nonClosed !== nonRequested;
    return NextResponse.json({
      ok: true,
      result: {
        pmClosed,
        nonClosed,
        nonRequested,
        partial, // true 表示 Non-PM 有請求 N 但只找到 M 筆（併發下可發生）
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { message: err?.message ?? "Failed to return rentals" },
      { status: 500 }
    );
  }
}
