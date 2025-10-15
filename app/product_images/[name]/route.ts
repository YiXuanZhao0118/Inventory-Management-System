// app/product_images/[name]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ROOT = path.join(process.cwd(), "public", "product_images");

const MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ name: string }> }
) {
  const { name } = await ctx.params;

  // 防路徑穿越
  if (name.includes("/") || name.includes("\\")) {
    return NextResponse.json({ error: "bad name" }, { status: 400 });
  }

  const abs = path.join(ROOT, name);

  try {
    const buf = await fs.readFile(abs); // Node Buffer

    // ⭐ 明確複製成 ArrayBuffer，避免出現 ArrayBuffer | SharedArrayBuffer 聯集
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);

    const ext = (name.split(".").pop() || "").toLowerCase();
    const ct = MIME[ext] || "application/octet-stream";

    const blob = new Blob([ab], { type: ct });

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": ct,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
