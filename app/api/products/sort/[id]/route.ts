//app\api\products\sort\[id]\route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  downloadAndSaveProductImage,
  removeLocalImageIfExists,
} from "../../_image";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const {
    name,
    brand,
    model,
    specifications,
    price,
    imageLink,
    isPropertyManaged,
  } = body || {};

  // 先找舊資料（用來做重複檢查、圖片處理、以及 fallback）
  const prev = await prisma.product.findUnique({ where: { id } });
  if (!prev) {
    return NextResponse.json(
      { ok: false, message: "Product not found" },
      { status: 404 }
    );
  }

  // ── 檢查 brand+model 重複（以傳入值優先，未傳入則沿用舊值） ──
  const newBrand = brand !== undefined ? brand : prev.brand;
  const newModel = model !== undefined ? model : prev.model;
  if (newBrand == null || newModel == null) {
    return NextResponse.json(
      { ok: false, message: "Brand & Model are required" },
      { status: 400 }
    );
  }
  const dup = await prisma.product.findFirst({
    where: { brand: newBrand, model: newModel, NOT: { id } },
  });
  if (dup) {
    return NextResponse.json(
      { ok: false, message: "Duplicated brand & model" },
      { status: 400 }
    );
  }

  // ── 關鍵規則：若此 product 仍有 short_term 庫存，isPM 必為 true，且不可改成 false ──
  const shortTermCount = await prisma.stock.count({
    where: { productId: id, currentStatus: "short_term" },
  });
  const hasShortTerm = shortTermCount > 0;

  if (hasShortTerm && isPropertyManaged === false) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "This product has short-term stock; isPropertyManaged must be true.",
      },
      { status: 400 }
    );
  }

  // 組合更新資料
  const data: any = {
    ...(name !== undefined ? { name } : {}),
    ...(brand !== undefined ? { brand } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(specifications !== undefined ? { specifications } : {}),
    ...(price !== undefined
      ? { price: price == null ? null : Number(price) }
      : {}),
    ...(imageLink !== undefined
      ? { imageLink: imageLink?.trim() || null }
      : {}),
  };

  // 強制規則套用到 isPropertyManaged
  if (hasShortTerm) {
    data.isPropertyManaged = true; // 有短借 ⇒ 一律 true（即使前端未送 isPM，也會矯正）
  } else if (isPropertyManaged !== undefined) {
    data.isPropertyManaged = !!isPropertyManaged; // 無短借 ⇒ 可照前端請求修改
  }

  const updated = await prisma.product.update({
    where: { id },
    data,
  });

  // ── 圖片處理：若 imageLink 有變更，嘗試下載，並維護 localImage 檔案 ──
  if (imageLink !== undefined && imageLink !== prev.imageLink) {
    if (imageLink) {
      try {
        const { localImageRel } = await downloadAndSaveProductImage(
          id,
          imageLink
        );
        if (prev.localImage && prev.localImage !== localImageRel) {
          await removeLocalImageIfExists(prev.localImage);
        }
        await prisma.product.update({
          where: { id },
          data: { localImage: localImageRel },
        });
      } catch {
        // 下載失敗：移除舊有本地圖並清空
        if (prev.localImage) await removeLocalImageIfExists(prev.localImage);
        await prisma.product.update({
          where: { id },
          data: { localImage: null },
        });
      }
    } else {
      // 清空 imageLink：一併清空 localImage
      if (prev.localImage) await removeLocalImageIfExists(prev.localImage);
      await prisma.product.update({
        where: { id },
        data: { localImage: null },
      });
    }
  }

  return NextResponse.json({ ok: true, id: updated.id });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const prod = await prisma.product.findUnique({ where: { id } });
  if (!prod) {
    return NextResponse.json(
      { ok: false, message: "Product not found" },
      { status: 404 }
    );
  }

  const stockCount = await prisma.stock.count({ where: { productId: id } });
  if (stockCount > 0) {
    return NextResponse.json(
      { ok: false, message: "Cannot delete: product is referenced by Stock" },
      { status: 409 }
    );
  }

  await prisma.product.delete({ where: { id } });
  if (prod.localImage) {
    await removeLocalImageIfExists(prod.localImage);
  }

  return NextResponse.json({ ok: true });
}
