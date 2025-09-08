import { NextResponse } from "next/server";
import {
  getIAMSProperty,
  saveIAMSProperty,   // 確保在 lib/db 有這個方法（見下方備註）
  getStock,
  getProductById,
} from "@/lib/db";

// 既有 GET
export async function GET() {
  const iams = getIAMSProperty();
  return NextResponse.json(iams);
}

// 新增：Upsert / Delete IAMS 對應
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 接受多種欄位寫法
    const stockId = String(body.stockId ?? body.stockid ?? "").trim();
    const raw = body.IAMSID ?? body.iamsId ?? body.iamsid;
    const IAMSID = typeof raw === "string" ? raw.trim() : raw;
    const remove = body.remove === true || IAMSID === "" || IAMSID == null;

    if (!stockId) {
      return NextResponse.json({ error: "Missing stockId" }, { status: 400 });
    }

    // 基本檢查：存貨存在
    const stock = getStock().find((s) => s.id === stockId);
    if (!stock) {
      return NextResponse.json({ error: "Stock not found" }, { status: 404 });
    }

    // 僅允許財產管理的產品設定 IAMS
    const prod = getProductById(stock.productId);
    if (!prod || !prod.isPropertyManaged) {
      return NextResponse.json(
        { error: "This product is not property-managed; cannot set IAMS" },
        { status: 400 }
      );
    }

    // 讀取清單並 upsert / delete
    const list = getIAMSProperty() as Array<{ stockid: string; IAMSID: string }>;
    const idx = list.findIndex((x) => x.stockid === stockId);

    if (remove) {
      if (idx !== -1) {
        list.splice(idx, 1);
        saveIAMSProperty(list);
      }
      return NextResponse.json({
        success: true,
        action: "deleted",
        data: { stockid: stockId },
      });
    }

    // upsert
    if (typeof IAMSID !== "string" || !IAMSID.trim()) {
      return NextResponse.json({ error: "Invalid IAMSID" }, { status: 400 });
    }

    if (idx !== -1) {
      list[idx].IAMSID = IAMSID;
      saveIAMSProperty(list);
      return NextResponse.json({
        success: true,
        action: "updated",
        data: { stockid: stockId, IAMSID },
      });
    } else {
      list.push({ stockid: stockId, IAMSID });
      saveIAMSProperty(list);
      return NextResponse.json({
        success: true,
        action: "created",
        data: { stockid: stockId, IAMSID },
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
