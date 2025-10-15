// app/product_files/[pfId]/[...file]/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import mime from "mime"; // npm i mime

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLIC_ROOT = path.join(process.cwd(), "public");

// RFC5987：下載檔名編碼
function encodeRFC5987(str: string) {
  return encodeURIComponent(str).replace(/['()]/g, escape).replace(/\*/g, "%2A");
}

// Next 15：第二參數的 params 是 Promise，要 await
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ pfId: string; file: string[] }> }
) {
  const { pfId, file } = await context.params;

  // 逐段 decode，安全拼接
  const rel = path.posix.join("product_files", pfId, ...file.map(decodeURIComponent));
  if (rel.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const abs = path.join(PUBLIC_ROOT, rel);

  try {
    const stat = await fsp.stat(abs);
    const stream = fs.createReadStream(abs);
    const type = mime.getType(abs) || "application/octet-stream";

    const headers = new Headers({
      "Content-Type": type,
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      "Accept-Ranges": "bytes",
    });

    // ?dl=1 → 另存下載
    if (req.nextUrl.searchParams.get("dl") === "1") {
      const filename = file[file.length - 1];
      headers.set(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeRFC5987(filename)}`
      );
    }

    return new NextResponse(stream as any, { headers });
  } catch {
    // dev 時給你更好除錯
    if (process.env.NODE_ENV !== "production") {
      let dirList = "";
      try {
        const dir = path.dirname(abs);
        const items = await fsp.readdir(dir);
        dirList = `\n\nDirectory of ${dir}:\n- ` + items.join("\n- ");
      } catch {}
      return new NextResponse(`Not found: ${abs}\n(decoded: ${rel})${dirList}`, {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export const HEAD = GET;
