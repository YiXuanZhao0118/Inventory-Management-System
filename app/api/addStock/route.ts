// app/api/addStock/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  addStockItem,
  getProductById,
  getProducts,
  getLocationTree,
} from "@/lib/db";

type AddItemInput = {
  productId: string;
  locationId: string;
  quantity?: number; // 預設 1，僅非財產可 >1
};

type PreparedItem = {
  productId: string;
  locationId: string;
  quantity: number;
};

export async function GET() {
  const products = getProducts();
  const locations = getLocationTree();

  return NextResponse.json({
    products,
    locations,
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  // 同時支援單筆物件與陣列
  const items: AddItemInput[] = Array.isArray(body)
    ? body
    : body && typeof body === "object"
    ? [body]
    : [];

  if (items.length === 0) {
    return NextResponse.json(
      { error: "請傳入單筆物件或物件陣列。" },
      { status: 400 }
    );
  }

  const errors: Array<{ index: number; message: string; item: unknown }> = [];
  const prepared: PreparedItem[] = [];

  // 前置驗證（全通過才真的寫入）
  items.forEach((raw, index) => {
    const productId = raw?.productId;
    const locationId = raw?.locationId;
    const qRaw = raw?.quantity;
    const quantity =
      Number.isFinite(qRaw as number) && (qRaw as number) > 0
        ? Math.floor(qRaw as number)
        : 1;

    if (!productId) {
      errors.push({ index, message: "缺少 productId", item: raw });
      return;
    }
    if (!locationId || locationId.trim() === "" || locationId === "???") {
      errors.push({ index, message: "缺少或無效的 locationId", item: raw });
      return;
    }

    const product = getProductById(productId);
    if (!product) {
      errors.push({ index, message: "找不到對應的產品", item: raw });
      return;
    }
    if (product.isPropertyManaged && quantity > 1) {
      errors.push({
        index,
        message: "此產品屬財產管理，一次只能新增 1 個（quantity 必須為 1）",
        item: raw,
      });
      return;
    }

    prepared.push({ productId, locationId, quantity });
  });

  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  // 全部合法，開始建立
  const createdAt = new Date().toISOString();
  const created: any[] = [];

  for (const it of prepared) {
    for (let i = 0; i < it.quantity; i++) {
      const item = addStockItem(it.productId, it.locationId, createdAt);
      created.push(item);
    }
  }

  return NextResponse.json(created, { status: 201 });
}
