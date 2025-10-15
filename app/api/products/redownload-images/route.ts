//app\api\products\redownload-images\route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { downloadAndSaveProductImage } from "@/app/api/products/_image";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const PRODUCT_DIR = path.join(PUBLIC_DIR, "product_images");

export async function POST() {
  try {
    await fs.promises.rm(PRODUCT_DIR, { recursive: true, force: true });
    await fs.promises.mkdir(PRODUCT_DIR, { recursive: true });

    const products = await prisma.product.findMany({
      select: { id: true, imageLink: true },
      orderBy: { createdAt: "asc" },
    });

    let total = 0, tried = 0, downloaded = 0, failed = 0;

    for (const p of products) {
      total++;
      const url = (p.imageLink || "").trim();
      if (!/^https?:\/\//i.test(url)) {
        tried++;
        await prisma.product.update({ where: { id: p.id }, data: { localImage: null } });
        continue;
      }
      tried++;
      try {
        const { localImageRel } = await downloadAndSaveProductImage(p.id, url);
        await prisma.product.update({ where: { id: p.id }, data: { localImage: localImageRel } });
        downloaded++;
      } catch {
        await prisma.product.update({ where: { id: p.id }, data: { localImage: null } });
        failed++;
      }
    }

    return NextResponse.json({ ok: true, images: { total, tried, downloaded, failed } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? "rebuild failed" }, { status: 500 });
  }
}
