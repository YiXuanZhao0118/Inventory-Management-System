// app/api/rentals/short-term/borrow/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StockStatus, LoanType } from "@prisma/client";

export const dynamic = "force-dynamic";

const DEFAULT_HOURS = 3;
const RENTER_NAME = "LabAdmin"; // 依需求固定

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as { stockId?: string; borrowerDeviceId?: string } | null;
    const stockId = (body?.stockId || "").trim();
    const borrowerDeviceId = (body?.borrowerDeviceId || "").trim();
    const cookieDeviceId = req.cookies.get("deviceId")?.value || "";

    if (!stockId) return NextResponse.json({ success: false, error: "stockId is required" }, { status: 400 });
    if (!borrowerDeviceId) return NextResponse.json({ success: false, error: "borrowerDeviceId is required" }, { status: 400 });
    // 確保呼叫者就是本人（避免偽造）
    if (cookieDeviceId && cookieDeviceId !== borrowerDeviceId) {
      return NextResponse.json({ success: false, error: "Device mismatch" }, { status: 403 });
    }

    // 交易內檢查與建立
    const result = await prisma.$transaction(async (tx) => {
      // 檢查裝置存在
      const dev = await tx.device.findUnique({ where: { id: borrowerDeviceId } });
      if (!dev) throw new Error("Device not registered");

      // 檢查可借 Stock（狀態 + 產品屬性）
      const stock = await tx.stock.findFirst({
        where: { id: stockId, discarded: false, currentStatus: "in_stock", product: { isPropertyManaged: true } },
        include: { product: true, location: true },
      });
      if (!stock) throw new Error("Stock not available to borrow");

      // 檢查是否已有未歸還 Rental
      const activeRental = await tx.rental.findFirst({
        where: { stockId, returnDate: null },
      });
      if (activeRental) throw new Error("Stock already borrowed");

      const now = new Date();
      const due = new Date(now.getTime() + DEFAULT_HOURS * 3600_000);

      // 建立 Rental
      const rental = await tx.rental.create({
        data: {
          stockId: stock.id,
          productId: stock.productId,
          locationId: stock.locationId,
          borrower: borrowerDeviceId,
          renter: RENTER_NAME,
          loanType: LoanType.short_term,
          loanDate: now,
          dueDate: due,
        },
        select: { id: true, dueDate: true },
      });

      // 更新 Stock 狀態
      await tx.stock.update({
        where: { id: stock.id },
        data: { currentStatus: StockStatus.short_term },
      });

      return rental;
    });

    return NextResponse.json({ success: true, data: { id: result.id, dueDate: result.dueDate } });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const status = /not available|already borrowed|Device mismatch|Device not registered/i.test(msg) ? 400 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
