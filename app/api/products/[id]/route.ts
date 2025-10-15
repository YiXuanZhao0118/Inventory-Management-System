// app/api/products/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { downloadAndSaveProductImage, removeLocalImageIfExists } from "../_image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 從請求 URL 解析動態段的 id（避免使用第二個參數的 params）
function getIdFromUrl(req: NextRequest): string | null {
  const { pathname } = new URL(req.url);
  const parts = pathname.split("/").filter(Boolean); // 避免空字串
  // 期望路徑形如 /api/products/:id
  const id = parts[parts.length - 1] || null;
  return id;
}

export async function GET(req: NextRequest) {
  const id = getIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ ok: false, message: "Missing id" }, { status: 400 });
  }

  const item = await prisma.product.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, data: item });
}

export async function PUT(req: NextRequest) {
  const id = getIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ ok: false, message: "Missing id" }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const { name, model, brand, isPropertyManaged, imageUrl } = body || {};

  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });

  const updated = await prisma.product.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(brand !== undefined ? { brand } : {}),
      ...(isPropertyManaged !== undefined ? { isPropertyManaged: !!isPropertyManaged } : {}),
    },
  });

  if (imageUrl) {
    try {
      // 若你的 schema 有儲存本地圖片欄位，再自行加上 DB 更新；現在只處理檔案與回傳欄位
      const prevRel = (before as any).imageLocalRel as string | null | undefined;
      if (prevRel) await removeLocalImageIfExists(prevRel);

      const { localImageRel } = await downloadAndSaveProductImage(id, imageUrl);
      (updated as any).imageLocalRel = localImageRel; // 僅附在回應
    } catch (e: any) {
      console.warn("Image update failed:", e?.message || e);
    }
  }

  return NextResponse.json({ ok: true, data: updated });
}

export async function DELETE(req: NextRequest) {
  const id = getIdFromUrl(req);
  if (!id) {
    return NextResponse.json({ ok: false, message: "Missing id" }, { status: 400 });
  }

  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ ok: false, message: "Not found" }, { status: 404 });

  const prevRel = (before as any).imageLocalRel as string | null | undefined;
  if (prevRel) {
    try {
      await removeLocalImageIfExists(prevRel);
    } catch {}
  }

  try {
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || "Delete failed" }, { status: 400 });
  }
}
