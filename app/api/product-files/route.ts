// app/api/product-files/route.ts
import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ===== 副檔名分類 =====
const imageExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".tiff",
  ".tif",
  ".webp",
  ".heic",
  ".svg",
  ".raw",
  ".cr2",
  ".nef",
  ".arw",
  ".ico",
  ".psd",
  ".ai",
  ".eps",
];
const pdfExtensions = [
  ".pdf",
  ".docx",
  ".doc",
  ".txt",
  ".rtf",
  ".odt",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".csv",
  ".md",
  ".html",
  ".xml",
  ".json",
  ".epub",
  ".tex",
];
const videoExtensions = [
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".flv",
  ".wmv",
  ".webm",
  ".mpeg",
  ".mpg",
  ".3gp",
  ".ts",
  ".m4v",
  ".ogv",
];

function categorize(filename: string) {
  const ext = path.extname(filename).toLowerCase();
  if (imageExtensions.includes(ext)) return "image";
  if (pdfExtensions.includes(ext)) return "pdf";
  if (videoExtensions.includes(ext)) return "video";
  return "other";
}
function safeName(name: string) {
  return name.replace(/[^\w.\-()\[\] ]+/g, "_");
}
async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

const PUBLIC_ROOT = path.join(process.cwd(), "public");

// ========================= GET =========================
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");
    if (!productId) {
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 }
      );
    }

    const items = await prisma.productFile.findMany({
      where: { productId },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        path: true,
        partNumber: true,
        description: true,
        files: true,
        sizeBytes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ items });
  } catch (err: any) {
    console.error("GET /api/product-files error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

// ========================= POST（新增 / 附加） =========================
// multipart/form-data: productId, partNumber, description?, files[]
export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "multipart/form-data required" },
        { status: 415 }
      );
    }

    const form = await req.formData();
    const productId = String(form.get("productId") || "").trim();
    const partNumber = String(form.get("partNumber") || "").trim();
    const description = String(form.get("description") || "").trim();
    const fileEntries = form.getAll("files").filter(Boolean) as File[];

    if (!productId)
      return NextResponse.json(
        { error: "productId is required" },
        { status: 400 }
      );
    if (!partNumber)
      return NextResponse.json(
        { error: "partNumber is required" },
        { status: 400 }
      );
    if (!fileEntries.length)
      return NextResponse.json({ error: "No files" }, { status: 400 });

    const prod = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!prod)
      return NextResponse.json({ error: "Product not found" }, { status: 404 });

    // 找是否已有相同 P/N 的資料，若有 → 附加，否則新建
    let pf = await prisma.productFile.findFirst({
      where: { productId, partNumber },
      select: { id: true, path: true, files: true },
    });

    if (!pf) {
      const created = await prisma.productFile.create({
        data: {
          productId,
          path: "",
          partNumber,
          description: description || null,
          files: {},
          sizeBytes: 0,
        },
        select: { id: true },
      });
      const dirRel = path.posix.join("product_files", created.id);
      const dirAbs = path.join(PUBLIC_ROOT, dirRel);
      await fs.mkdir(dirAbs, { recursive: true });
      await prisma.productFile.update({
        where: { id: created.id },
        data: { path: dirRel },
      });
      pf = { id: created.id, path: dirRel, files: {} };
    } else {
      // 確保資料夾存在；若這次有帶描述就更新（非空）
      if (!pf.path) {
        const dirRel = path.posix.join("product_files", pf.id);
        const dirAbs = path.join(PUBLIC_ROOT, dirRel);
        await fs.mkdir(dirAbs, { recursive: true });
        await prisma.productFile.update({
          where: { id: pf.id },
          data: { path: dirRel },
        });
        pf.path = dirRel;
      }
      if (description) {
        await prisma.productFile.update({
          where: { id: pf.id },
          data: { description },
        });
      }
    }

    const dirAbs = path.join(PUBLIC_ROOT, pf.path);
    const buckets: Record<"image" | "pdf" | "video" | "other", string[]> = {
      image: [],
      pdf: [],
      video: [],
      other: [],
    };

    // 寫檔（同名改名）
    for (const webFile of fileEntries) {
      const base = safeName(webFile.name || "unnamed");
      let finalName = base;
      let i = 1;
      while (await exists(path.join(dirAbs, finalName))) {
        const b = path.basename(base, path.extname(base));
        const e = path.extname(base);
        finalName = `${b}_${i++}${e}`;
      }
      const buf = Buffer.from(await webFile.arrayBuffer());
      await fs.writeFile(path.join(dirAbs, finalName), buf);
      const cat = categorize(finalName);
      (buckets[cat as keyof typeof buckets] ||= []).push(finalName);
    }

    // 合併 files JSON 後計算總大小
    const current = (
      await prisma.productFile.findUnique({
        where: { id: pf.id },
        select: { files: true },
      })
    )?.files as any;

    const filesJson = {
      image: Array.from(new Set([...(current?.image || []), ...buckets.image])),
      pdf: Array.from(new Set([...(current?.pdf || []), ...buckets.pdf])),
      video: Array.from(new Set([...(current?.video || []), ...buckets.video])),
    } as any;
    if ((buckets.other || []).length) {
      filesJson.other = Array.from(
        new Set([...(current?.other || []), ...buckets.other])
      );
    } else if (current?.other?.length) {
      filesJson.other = current.other;
    }

    // 計算大小
    let total = 0;
    for (const cat of ["image", "pdf", "video", "other"] as const) {
      const arr = (filesJson as any)[cat] as string[] | undefined;
      if (!arr) continue;
      for (const name of arr) {
        try {
          const st = await fs.stat(path.join(dirAbs, name));
          total += st.size;
        } catch {}
      }
    }

    const updated = await prisma.productFile.update({
      where: { id: pf.id },
      data: { files: filesJson, sizeBytes: total },
      select: {
        id: true,
        path: true,
        files: true,
        sizeBytes: true,
        partNumber: true,
        description: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ ok: true, ...updated });
  } catch (err: any) {
    console.error("POST /api/product-files error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}

// ========================= PATCH（編輯） =========================
// multipart/form-data: id, partNumber?, description?, remove(json[]), order(json: {image/pdf/video}), files[]
export async function PATCH(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json({ error: "multipart/form-data required" }, { status: 415 });
    }

    const form = await req.formData();

    // --- 必要欄位 ---
    const id = String(form.get("id") || "").trim();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    // --- 可選欄位 ---
    const partNumber = form.get("partNumber");
    const description = form.get("description");
    const removeRaw = form.get("remove"); // JSON: string[]
    const orderRaw  = form.get("order");  // JSON: { image?: string[], pdf?: string[], video?: string[] }
    const renamesRaw = form.get("renames"); // JSON: Array<{from:string,to:string}>

    // 查 DB
    const pf = await prisma.productFile.findUnique({
      where: { id },
      select: { id: true, productId: true, path: true, files: true }
    });
    if (!pf) return NextResponse.json({ error: "ProductFile not found" }, { status: 404 });

    if (!pf.path || !pf.path.startsWith("product_files/") || pf.path.includes("..")) {
      return NextResponse.json({ error: "Invalid stored path" }, { status: 500 });
    }

    const dirAbs = path.join(PUBLIC_ROOT, pf.path);

    // 目前 files JSON 深拷貝
    const filesJson: { image: string[]; pdf: string[]; video: string[]; other?: string[] } = {
      image: Array.isArray((pf as any).files?.image) ? [...(pf as any).files.image] : [],
      pdf:   Array.isArray((pf as any).files?.pdf)   ? [...(pf as any).files.pdf]   : [],
      video: Array.isArray((pf as any).files?.video) ? [...(pf as any).files.video] : [],
      ...(Array.isArray((pf as any).files?.other) ? { other: [...(pf as any).files.other] } : {}),
    };

    const listAllNames = () =>
      new Set([
        ...filesJson.image,
        ...filesJson.pdf,
        ...filesJson.video,
        ...(filesJson.other || []),
      ]);

    // 生成在同資料夾下不重複的檔名（若衝突就加 (1) (2) ...）
    async function nextAvailableName(desiredBase: string, extWithDot: string, fromName?: string) {
      let base = desiredBase.trim();
      // 去除末尾的 .ext（保險；避免使用者把整個檔名傳進來）
      if (base.toLowerCase().endsWith(extWithDot.toLowerCase())) {
        base = base.slice(0, -extWithDot.length);
      }
      // 清理字元（不處理副檔名）
      base = safeName(base).replace(/\s+/g, " ").trim();

      let candidate = `${base}${extWithDot}`;
      const all = listAllNames();
      let i = 1;
      while (
        (candidate !== fromName) &&
        (all.has(candidate) || (await exists(path.join(dirAbs, candidate))))
      ) {
        candidate = `${base} (${i++})${extWithDot}`;
      }
      return candidate;
    }

    // -------- 0) 改名（可選）— 禁止更改副檔名；重名自動 (1)(2)… --------
    if (renamesRaw) {
      let renames: Array<{ from: string; to: string }>;
      try {
        renames = JSON.parse(String(renamesRaw));
      } catch {
        return NextResponse.json({ error: "renames: invalid JSON" }, { status: 400 });
      }
      if (!Array.isArray(renames)) {
        return NextResponse.json({ error: "renames must be an array" }, { status: 400 });
      }

      for (const r of renames) {
        if (!r || typeof r.from !== "string" || typeof r.to !== "string") {
          return NextResponse.json({ error: "renames items must have string from/to" }, { status: 400 });
        }

        const from = path.basename(r.from.trim());
        let toName = path.basename(r.to.trim());
        if (!from || !toName) continue;

        const fromExt = path.extname(from) || "";  // with dot
        const toExt   = path.extname(toName) || "";

        // 強制保留原副檔名：若使用者傳進來不同副檔名，就換回 fromExt
        // 也避免使用者把整個檔名含副檔名傳進來時改變類別
        if (fromExt.toLowerCase() !== toExt.toLowerCase()) {
          const toBaseOnly = toName.slice(0, toName.length - toExt.length);
          toName = `${toBaseOnly}${fromExt}`;
        }

        // 找到它原本在哪個類別
        let catFound: "image" | "pdf" | "video" | "other" | null = null;
        for (const cat of ["image","pdf","video","other"] as const) {
          const arr = (filesJson as any)[cat] as string[] | undefined;
          if (arr?.includes(from)) { catFound = cat; break; }
        }
        if (!catFound) {
          // JSON 沒記錄但實體存在時，推測類別
          try {
            await fs.stat(path.join(dirAbs, from));
            catFound = categorize(from) as any;
          } catch {
            return NextResponse.json({ error: `Source not found: ${from}` }, { status: 404 });
          }
        }

        // 取 base 後，找到「不重複」的最終檔名（可能自動加 (1)(2)…）
        const toBaseOnly = toName.slice(0, toName.length - fromExt.length);
        const finalName = await nextAvailableName(toBaseOnly, fromExt, from);

        // 如果目標與來源相同（不變），略過
        if (finalName === from) continue;

        // 真正改名（檔案系統）
        await fs.rename(path.join(dirAbs, from), path.join(dirAbs, finalName));

        // 更新 JSON：在原類別陣列中把 from 換成 finalName
        const arr = (filesJson as any)[catFound] as string[] | undefined;
        if (arr) {
          const idx = arr.indexOf(from);
          if (idx >= 0) arr[idx] = finalName;
        } else {
          // 理論上不會走到這裡，保險起見仍放回推測類別
          const guessed = categorize(finalName) as any;
          (filesJson as any)[guessed] = Array.isArray((filesJson as any)[guessed]) ? (filesJson as any)[guessed] : [];
          (filesJson as any)[guessed].push(finalName);
        }
      }
    }

    // -------- 1) 移除檔案 --------
    const toRemove: string[] = removeRaw ? JSON.parse(String(removeRaw)) : [];
    if (toRemove.length) {
      for (const cat of ["image","pdf","video","other"] as const) {
        const arr = (filesJson as any)[cat] as string[] | undefined;
        if (!arr) continue;
        (filesJson as any)[cat] = arr.filter((n) => !toRemove.includes(n));
      }
      // 刪實體檔案
      for (const name of toRemove) {
        const target = path.join(dirAbs, name);
        const rel = path.relative(dirAbs, target);
        if (!rel.startsWith("..")) await fs.rm(target, { force: true }).catch(() => {});
      }
    }

    // -------- 2) 新增檔案（自動分類；保留原副檔名） --------
    const newFiles = form.getAll("files").filter(Boolean) as File[];
    for (const webFile of newFiles) {
      const original = webFile.name || "unnamed";
      const safe = safeName(original); // 只清理字元，不改副檔名
      let finalName = safe; let i = 1;

      // 衝突解決：加 _1, _2…（保持副檔名不變）
      while (
        (filesJson.image?.includes(finalName) || false) ||
        (filesJson.pdf?.includes(finalName) || false) ||
        (filesJson.video?.includes(finalName) || false) ||
        (filesJson.other?.includes(finalName) || false) ||
        (await exists(path.join(dirAbs, finalName)))
      ) {
        const base = path.basename(safe, path.extname(safe));
        const ext  = path.extname(safe);
        finalName  = `${base}_${i++}${ext}`;
      }

      const buf = Buffer.from(await webFile.arrayBuffer());
      await fs.writeFile(path.join(dirAbs, finalName), buf);

      const cat = categorize(finalName);
      if (cat === "image" || cat === "pdf" || cat === "video") {
        (filesJson as any)[cat].push(finalName);
      } else {
        (filesJson as any).other = Array.isArray(filesJson.other) ? filesJson.other : [];
        (filesJson as any).other!.push(finalName);
      }
    }

    // -------- 3) 排序（僅依現有名單；新檔在最後） --------
    if (orderRaw) {
      const order = JSON.parse(String(orderRaw)) as Partial<Record<"image"|"pdf"|"video", string[]>>;
      (["image","pdf","video"] as const).forEach((cat) => {
        const ord = order?.[cat];
        if (Array.isArray(ord) && ord.length) {
          const set = new Set(ord);
          const current = (filesJson as any)[cat] as string[];
          const rest = current.filter((n) => !set.has(n));
          (filesJson as any)[cat] = ord.filter((n) => current.includes(n)).concat(rest);
        }
      });
    }

    // -------- 4) 重新計算 size --------
    let total = 0;
    for (const cat of ["image","pdf","video","other"] as const) {
      const arr = (filesJson as any)[cat] as string[] | undefined;
      if (!arr) continue;
      for (const name of arr) {
        try { const st = await fs.stat(path.join(dirAbs, name)); total += st.size; } catch {}
      }
    }

    // -------- 5) 更新 P/N / 描述 + files/size --------
    const data: any = { files: filesJson, sizeBytes: total, updatedAt: new Date() };

    if (typeof partNumber === "string" && partNumber.trim()) {
      const pn = partNumber.trim();
      // 確保同產品下 P/N 不重複
      const dup = await prisma.productFile.findFirst({
        where: { id: { not: pf.id }, productId: pf.productId, partNumber: pn },
        select: { id: true }
      });
      if (dup) return NextResponse.json({ error: "partNumber already exists for this product" }, { status: 409 });
      data.partNumber = pn;
    }
    if (typeof description === "string") {
      data.description = description.trim() || null;
    }

    const updated = await prisma.productFile.update({
      where: { id: pf.id },
      data,
      select: { id: true, partNumber: true, description: true, files: true, sizeBytes: true, updatedAt: true }
    });

    return NextResponse.json({ ok: true, ...updated });
  } catch (err: any) {
    console.error("PATCH /api/product-files error:", err);
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}


// ========================= DELETE（整筆刪除 + 資料夾） =========================
// query: ?id=...
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id)
      return NextResponse.json({ error: "id is required" }, { status: 400 });

    const pf = await prisma.productFile.findUnique({
      where: { id },
      select: { path: true },
    });
    if (!pf)
      return NextResponse.json(
        { error: "ProductFile not found" },
        { status: 404 }
      );

    // 刪實體資料夾（安全檢查）
    if (
      pf.path &&
      pf.path.startsWith("product_files/") &&
      !pf.path.includes("..")
    ) {
      const dirAbs = path.join(PUBLIC_ROOT, pf.path);
      await fs.rm(dirAbs, { recursive: true, force: true }).catch(() => {});
    }

    await prisma.productFile.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE /api/product-files error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
