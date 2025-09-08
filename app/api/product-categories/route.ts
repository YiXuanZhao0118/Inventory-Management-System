// app/api/product-categories/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuid } from "uuid";
import { getProducts } from "@/lib/db";
import {
  getProductCategories,
  saveProductCategories,
  type ProductCategory,
} from "@/lib/db/productCategories";

// GET: 回傳 { products, productCategories }
export async function GET() {
  try {
    const products = getProducts();
    const productCategories = getProductCategories();
    return NextResponse.json({ products, productCategories });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "GET failed" }, { status: 500 });
  }
}

// POST: 建立分類  body: { name: string; productIds: string[] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const productIds: string[] = Array.isArray(body?.productIds) ? body.productIds : [];

    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const categories = getProductCategories();
    if (categories.some(c => c.name === name)) {
      return NextResponse.json({ error: "Duplicate category name" }, { status: 400 });
    }

    const created: ProductCategory = { id: uuid(), name, productIds };
    saveProductCategories([...categories, created]);

    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "POST failed" }, { status: 400 });
  }
}

// PUT: 更新分類  body: { id: string; name: string; productIds: string[] }
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body?.id ?? "");
    const name = String(body?.name ?? "").trim();
    const productIds: string[] = Array.isArray(body?.productIds) ? body.productIds : [];

    if (!id || !name) return NextResponse.json({ error: "Missing id or name" }, { status: 400 });

    const categories = getProductCategories();
    const idx = categories.findIndex(c => c.id === id);
    if (idx === -1) return NextResponse.json({ error: "Category not found" }, { status: 404 });

    if (categories.some(c => c.name === name && c.id !== id)) {
      return NextResponse.json({ error: "Duplicate category name" }, { status: 400 });
    }

    const updated: ProductCategory = { id, name, productIds };
    categories[idx] = updated;
    saveProductCategories(categories);

    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "PUT failed" }, { status: 400 });
  }
}

// DELETE: 刪除分類  body: { id: string }
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body?.id ?? "");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const categories = getProductCategories();
    const exists = categories.some(c => c.id === id);
    if (!exists) return NextResponse.json({ error: "Category not found" }, { status: 404 });

    saveProductCategories(categories.filter(c => c.id !== id));
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "DELETE failed" }, { status: 400 });
  }
}
