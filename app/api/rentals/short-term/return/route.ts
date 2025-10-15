import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StockStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * body: { rentedItemId: string, returnDate?: string }
 * rule: only borrower (by cookie deviceId) can return
 * admin override: if query ?admin=1 => skip borrower check
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const isAdminOverride = searchParams.get("admin") === "1";

    const body = await req.json().catch(() => null) as { rentedItemId?: string; returnDate?: string } | null;
    const rentedItemId = (body?.rentedItemId || "").trim();
    const returnDate = body?.returnDate ? new Date(body.returnDate) : new Date();

    const cookieDeviceId = req.cookies.get("deviceId")?.value || "";
    const headerDeviceId = (req.headers.get("x-device-id") || "").trim();
    const effectiveDeviceId = cookieDeviceId || headerDeviceId; // ← 新增備援

    if (!rentedItemId) {
      return NextResponse.json({ success: false, error: "rentedItemId is required" }, { status: 400 });
    }
    if (!isAdminOverride && !effectiveDeviceId) {
      return NextResponse.json({ success: false, error: "deviceId cookie is required" }, { status: 403 });
    }

    await prisma.$transaction(async (tx) => {
      const rental = await tx.rental.findUnique({ where: { id: rentedItemId } });
      if (!rental) throw new Error("Rental not found");
      if (rental.returnDate) throw new Error("Already returned");

      // 非 admin 僅本人可歸還（用 effectiveDeviceId）
      if (!isAdminOverride && rental.borrower !== effectiveDeviceId) {
        throw new Error("Forbidden");
      }

      await tx.rental.update({
        where: { id: rentedItemId },
        data: { returnDate },
      });

      await tx.stock.update({
        where: { id: rental.stockId },
        data: { currentStatus: StockStatus.in_stock },
      });
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    const status = /not found|already returned|Forbidden/i.test(msg) ? 400 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
