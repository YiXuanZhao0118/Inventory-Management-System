// app/api/product-files-rename/route.ts
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { prisma } from "@/lib/prisma";

const PUBLIC_ROOT = path.join(process.cwd(), "public");

export async function PATCH(req: NextRequest) {
  try {
    const { id, from, to } = await req.json();
    if (!id || !from || !to) {
      return NextResponse.json({ error: "id, from, to are required" }, { status: 400 });
    }
    const pf = await prisma.productFile.findUnique({ where: { id }, select: { path: true, files: true } });
    if (!pf || !pf.path) return NextResponse.json({ error: "ProductFile not found" }, { status: 404 });

    const dirAbs = path.join(PUBLIC_ROOT, pf.path);
    const src = path.join(dirAbs, from);
    const dst = path.join(dirAbs, to);

    // 檔案系統改名
    await fs.rename(src, dst).catch((e) => {
      throw new Error(`rename failed: ${String(e?.message || e)}`);
    });

    // 更新 JSON 名稱（image/pdf/video/other 都找）
    const files = pf.files as any;
    (["image", "pdf", "video", "other"] as const).forEach((cat) => {
      if (Array.isArray(files?.[cat])) {
        files[cat] = files[cat].map((n: string) => (n === from ? to : n));
      }
    });

    await prisma.productFile.update({ where: { id }, data: { files } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("PATCH /api/product-files-rename error:", err);
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}
