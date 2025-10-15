import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LoanType } from "@prisma/client";

export const dynamic = "force-dynamic";
const DEFAULT_HOURS = 3;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as
      | { rentedItemId?: string; addHours?: number }
      | null;

    const rentedItemId = (body?.rentedItemId || "").trim();
    const addHours = Number.isFinite(body?.addHours)
      ? Math.max(1, Math.floor(body!.addHours!))
      : DEFAULT_HOURS;

    // 允許 cookie 與 header 兩種來源
    const cookieDeviceId = req.cookies.get("deviceId")?.value || "";
    const headerDeviceId = (req.headers.get("x-device-id") || "").trim();
    const effectiveDeviceId = cookieDeviceId || headerDeviceId;

    if (!rentedItemId) {
      return NextResponse.json(
        { success: false, error: "rentedItemId is required" },
        { status: 400 },
      );
    }
    if (!effectiveDeviceId) {
      return NextResponse.json(
        { success: false, error: "deviceId cookie is required" },
        { status: 403 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const rental = await tx.rental.findUnique({ where: { id: rentedItemId } });
      if (!rental) throw new Error("Rental not found");
      if (rental.returnDate) throw new Error("Already returned");
      if (rental.loanType !== LoanType.short_term) throw new Error("Not a short-term rental");

      // 只有本人可延長
      if (rental.borrower !== effectiveDeviceId) throw new Error("Forbidden");

      // ★ 新增規則：逾時就不允許延長
      const now = new Date();
      if (rental.dueDate && rental.dueDate.getTime() < now.getTime()) {
        throw new Error("Overdue: cannot extend");
      }

      const base = rental.dueDate ?? now;
      const newDue = new Date(base.getTime() + addHours * 3600_000);

      const res = await tx.rental.update({
        where: { id: rentedItemId },
        data: { dueDate: newDue },
        select: { id: true, dueDate: true },
      });

      return res;
    });

    return NextResponse.json({ success: true, data: { dueDate: updated.dueDate } });
  } catch (e: any) {
    const msg = e?.message || "Server error";
    // 將 Overdue 視為 400，以便前端可讀
    const status = /not found|already returned|Forbidden|Not a short-term|Overdue/i.test(msg)
      ? 400
      : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
