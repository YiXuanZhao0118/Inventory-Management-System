// app/api/products/sort/[id]/image/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  saveUploadedProductImage,
  removeLocalImageIfExists,
} from "../../../_image";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  // 確認產品存在
  const prod = await prisma.product.findUnique({ where: { id } });
  if (!prod) {
    return NextResponse.json(
      { ok: false, message: "Product not found" },
      { status: 404 }
    );
  }

  // 解析 multipart
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid multipart/form-data" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { ok: false, message: "Missing 'file' field" },
      { status: 400 }
    );
  }

  // 取檔名（瀏覽器會帶 .name）
  const filename =
    typeof (file as any).name === "string" ? (file as any).name : undefined;

  try {
    const { localImageRel } = await saveUploadedProductImage(
      id,
      file,
      filename
    );

    // 如果有舊圖，且路徑不同，刪除舊檔
    if (prod.localImage && prod.localImage !== localImageRel) {
      await removeLocalImageIfExists(prod.localImage);
    }

    await prisma.product.update({
      where: { id },
      data: { localImage: localImageRel },
    });

    return NextResponse.json({ ok: true, localImage: localImageRel });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message || "Upload failed" },
      { status: 500 }
    );
  }
}
