// app/api/rentals/short-term/extend/route.ts
import { NextResponse } from "next/server";
import { getRentalLogs, saveRentalLogs } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json();
  const rentedItemId = body.rentedItemId as string;
  const addHours = Number(body.addHours ?? 3); // 預設加 3 小時
  const explicitDue = body.dueDate ? new Date(body.dueDate) : null;

  if (!rentedItemId) {
    return NextResponse.json({ success: false, error: "Missing rentedItemId" }, { status: 400 });
  }

  const logs = getRentalLogs();
  const rec = logs.find((r: any) => r.id === rentedItemId);
  if (!rec) return NextResponse.json({ success: false, error: "Rental record not found" }, { status: 404 });
  if (rec.returnDate) return NextResponse.json({ success: false, error: "Already returned" }, { status: 400 });

  const currentDue = new Date(rec.dueDate);
  const newDue = explicitDue instanceof Date && !isNaN(+explicitDue)
    ? explicitDue
    : new Date(currentDue.getTime() + addHours * 3600e3);

  rec.dueDate = newDue.toISOString();
  saveRentalLogs(logs);

  return NextResponse.json({ success: true, data: { id: rec.id, dueDate: rec.dueDate } });
}
