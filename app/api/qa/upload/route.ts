// app/api/qa/upload/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEST = path.join(process.cwd(), "public", "qa");
const MAX_BYTES = 100 * 1024 * 1024; // 100MB
const ALLOWED = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
  ".mp4", ".webm"
]);
const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
};

function extFrom(name?: string, type?: string) {
  const byName = (name && path.extname(name).toLowerCase()) || "";
  if (ALLOWED.has(byName)) return byName;
  const byMime = type ? MIME_TO_EXT[type] : "";
  return ALLOWED.has(byMime) ? byMime : byName || "";
}
function safeBase(name?: string) {
  const base = (name || "file").replace(/\.[^/.]+$/, "");
  return (
    base.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
      .slice(0, 40) || "file"
  );
}
async function saveBuffer(buf: Buffer, filenameHint?: string, mime?: string) {
  if (buf.length > MAX_BYTES) throw new Error("File too large (100MB limit)");
  await fs.mkdir(DEST, { recursive: true });
  const ext = extFrom(filenameHint, mime);
  if (!ALLOWED.has(ext)) {
    throw new Error(`Unsupported file type: ${ext || mime || "unknown"}`);
  }
  const stamp = Date.now().toString(36);
  const rand = crypto.randomBytes(3).toString("hex");
  const final = `${safeBase(filenameHint)}-${stamp}-${rand}${ext}`;
  const abs = path.join(DEST, final);
  await fs.writeFile(abs, buf);
  return { url: `/qa/${final}`, name: final, size: buf.length, type: mime || "" };
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") || "";
  try {
    // JSON: 以 URL 下載
    if (ct.includes("application/json")) {
      const body = await req.json();
      const urls: string[] = body?.urls ?? (body?.url ? [body.url] : []);
      if (!urls.length) {
        return NextResponse.json({ error: "url(s) required" }, { status: 400 });
      }
      const out: any[] = [];
      for (const u of urls) {
        const r = await fetch(u);
        if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
        const ab = await r.arrayBuffer();
        const buf = Buffer.from(ab);
        const type = r.headers.get("content-type") || "";
        const filenameHint = new URL(u).pathname.split("/").pop() || "file";
        out.push(await saveBuffer(buf, filenameHint, type));
      }
      return NextResponse.json({ ok: true, files: out });
    }

    // 表單：直接上傳檔案
    const form = await req.formData();
    const files = form.getAll("file").filter(Boolean) as unknown as File[];
    if (!files.length) return NextResponse.json({ error: "file required" }, { status: 400 });

    const out: any[] = [];
    for (const f of files) {
      const ab = await f.arrayBuffer();
      const buf = Buffer.from(ab);
      const name = (f as any).name as string | undefined;
      out.push(await saveBuffer(buf, name, f.type));
    }
    return NextResponse.json({ ok: true, files: out });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
