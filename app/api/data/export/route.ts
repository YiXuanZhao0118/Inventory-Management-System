// app/api/data/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";
import fs from "fs/promises";
import { PassThrough, Readable as NodeReadable } from "stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DataKeys =
  | "locations"
  | "products"
  | "stocks"
  | "rentals"
  | "transfers"
  | "discarded"
  | "iams"
  | "devices"
  | "users"
  | "productCategories"
  | "productCategoryItems"
  | "productFiles"
  | "qaItems"; // ← 新增

const CWD = process.cwd();
const PUBLIC_DIR = path.join(CWD, "public");
const PRODUCT_IMAGES_PREFIX = "product_images/";
const PRODUCT_FILES_PREFIX = "product_files/";
const QA_PREFIX = "qa/"; // ← 新增

function toPosix(p: string) {
  return p.replace(/\\/g, "/");
}
function stripLeadingSlash(p: string) {
  return p.replace(/^[/\\]+/, "");
}
function normalizePublicRel(p: string | null | undefined) {
  let rel = toPosix(String(p ?? ""));
  rel = stripLeadingSlash(rel);
  if (rel.startsWith("public/")) rel = rel.slice("public/".length);
  return rel;
}
function safePublicAbs(relFromPublic: string) {
  const rel = stripLeadingSlash(toPosix(relFromPublic));
  const abs = path.resolve(PUBLIC_DIR, rel);
  if (!abs.startsWith(PUBLIC_DIR)) return null;
  return abs;
}
async function existsFile(abs: string) {
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}
function isNonEmptyArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.length > 0;
}
function deepEqual(a: any, b: any) {
  return JSON.stringify(a) === JSON.stringify(b);
}
async function loadArchiver() {
  const mod = await import("archiver");
  return (mod as any).default || (mod as any);
}

/** 讓 ProductFile.path 正規化成 "product_files" 或 "product_files/子路徑"（不重複前綴） */
function makeProductFilesBase(pfPath: string | null | undefined) {
  let rel = normalizePublicRel(pfPath);
  if (rel.startsWith(PRODUCT_FILES_PREFIX)) {
    rel = rel.slice(PRODUCT_FILES_PREFIX.length);
  }
  rel = rel.replace(/^\/+|\/+$/g, "");
  return rel ? PRODUCT_FILES_PREFIX + rel : PRODUCT_FILES_PREFIX;
}
/** 讓 Product.localImage 變成 "product_images/..."，容忍 public/ 或缺前綴 */
function makeProductImageRel(localImage: string) {
  let rel = normalizePublicRel(localImage);
  if (!rel) return "";
  if (!rel.startsWith(PRODUCT_IMAGES_PREFIX)) rel = PRODUCT_IMAGES_PREFIX + rel;
  return rel;
}

/** 針對單一 files 條目，產生多個候選路徑（依序嘗試） */
function candidatePathsForEntry(
  pf: { id: string; productId: string; path: string | null | undefined },
  s: string
) {
  const out = new Set<string>();
  const entry = normalizePublicRel(s);

  if (entry.startsWith(PRODUCT_FILES_PREFIX)) {
    out.add(entry);
    return Array.from(out);
  }

  const baseByPath = makeProductFilesBase(pf.path);
  out.add(toPosix(path.posix.join(baseByPath, entry)));
  out.add(toPosix(path.posix.join(PRODUCT_FILES_PREFIX + pf.productId, entry)));
  out.add(toPosix(path.posix.join(PRODUCT_FILES_PREFIX + pf.id, entry)));

  return Array.from(out);
}

async function walkAllFilesUnder(relRoot: string): Promise<string[]> {
  const rootAbs = safePublicAbs(relRoot);
  if (!rootAbs) return [];
  const acc: string[] = [];
  async function walk(abs: string, relBase: string) {
    let entries: any[] = [];
    try {
      entries = await fs.readdir(abs, { withFileTypes: true } as any);
    } catch {
      return;
    }
    for (const ent of entries) {
      const entAbs = path.join(abs, ent.name);
      const entRel = toPosix(path.posix.join(relBase, ent.name));
      if ((ent as any).isDirectory?.()) {
        await walk(entAbs, entRel);
      } else {
        acc.push(entRel);
      }
    }
  }
  await walk(rootAbs, stripLeadingSlash(toPosix(relRoot)));
  return acc;
}

/** 從 QA Markdown/HTML 內容萃取被引用的 qa/* 檔案相對路徑 */
function extractQaRelsFromMd(md: string | null | undefined): string[] {
  if (!md) return [];
  const rels = new Set<string>();

  // 1) Markdown: ![...](.../qa/xxx) 或普通連結 [...](.../qa/xxx)
  const mdLink = /\]\(([^)]+)\)/g;
  for (const m of md.matchAll(mdLink)) {
    const url = (m[1] || "").trim();
    const idx = url.indexOf("/qa/");
    if (idx >= 0) {
      const tail = url.slice(idx + 1); // 去掉前導 '/'
      rels.add(tail);
    } else if (url.startsWith("qa/")) {
      rels.add(url);
    }
  }

  // 2) HTML <img src="/qa/xxx">、<video src="/qa/xxx">、<source src="qa/xxx">
  const htmlSrc = /\bsrc=["']([^"']+)["']/gi;
  for (const m of md.matchAll(htmlSrc)) {
    const url = (m[1] || "").trim();
    if (url.startsWith("/qa/")) rels.add(url.slice(1));
    else if (url.startsWith("qa/")) rels.add(url);
  }

  // 3) 保底：任何出現 /qa/... 的片段
  const anyQa = /\/qa\/[^\s)"'>]+/g;
  for (const m of md.matchAll(anyQa)) {
    const url = (m[0] || "").trim();
    rels.add(url.slice(1)); // 去掉 '/'
  }

  // 正規化
  return Array.from(rels).map((r) => stripLeadingSlash(normalizePublicRel(r)));
}

/** 讀取完整快照（不改 DB）。→ 永遠包含 User.passwordHash 與 QA 資料 */
async function readSnapshot() {
  const [
    locations,
    products,
    stocks,
    rentals,
    transfers,
    discarded,
    iams,
    devices,
    users,
    productCategories,
    productCategoryItems,
    productFiles,
    qaItems, // ← 新增
  ] = await prisma.$transaction([
    prisma.location.findMany({
      select: { id: true, label: true, parentId: true },
      orderBy: [{ label: "asc" }, { id: "asc" }],
    }),
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        brand: true,
        model: true,
        specifications: true,
        price: true,
        imageLink: true,
        localImage: true,
        isPropertyManaged: true,
        createdAt: true,
      },
      orderBy: [{ id: "asc" }],
    }),
    prisma.stock.findMany({
      select: {
        id: true,
        productId: true,
        locationId: true,
        currentStatus: true,
        discarded: true,
        createdAt: true,
      },
      orderBy: [{ id: "asc" }],
    }),
    prisma.rental.findMany({
      select: {
        id: true,
        stockId: true,
        productId: true,
        locationId: true,
        borrower: true,
        renter: true,
        loanType: true,
        loanDate: true,
        dueDate: true,
        returnDate: true,
      },
      orderBy: [{ id: "asc" }],
    }),
    prisma.transfer.findMany({
      select: {
        id: true,
        stockId: true,
        fromLocation: true,
        toLocation: true,
        createdAt: true,
      },
      orderBy: [{ id: "asc" }],
    }),
    prisma.discarded.findMany({
      select: {
        id: true,
        stockId: true,
        productId: true,
        locationId: true,
        discardReason: true,
        discardOperator: true,
        discardDate: true,
      },
      orderBy: [{ id: "asc" }],
    }),
    prisma.iamsMapping.findMany({
      select: { stockId: true, iamsId: true },
      orderBy: [{ stockId: "asc" }],
    }),
    prisma.device.findMany({
      select: { id: true, name: true, createdAt: true },
      orderBy: [{ id: "asc" }],
    }),
    prisma.user.findMany({
      select: { id: true, username: true, email: true, passwordHash: true, createdAt: true },
      orderBy: [{ id: "asc" }],
    }),
    prisma.productCategory.findMany({
      select: { id: true, name: true },
      orderBy: [{ id: "asc" }],
    }),
    prisma.productCategoryItem.findMany({
      select: { categoryId: true, productId: true },
      orderBy: [{ categoryId: "asc" }, { productId: "asc" }],
    }),
    prisma.productFile.findMany({
      select: {
        id: true,
        productId: true,
        path: true,
        partNumber: true,
        description: true,
        files: true,
        sizeBytes: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ id: "asc" }],
    }),
    prisma.qAItem.findMany({
      select: {
        id: true,
        title: true,
        tags: true,
        order: true,
        createdAt: true,
        updatedAt: true,
        contentMd: true,
      },
      orderBy: [{ order: "asc" }, { updatedAt: "desc" }, { id: "asc" }],
    }),
  ]);

  const data: Record<DataKeys, any[]> = {
    locations,
    products,
    stocks,
    rentals,
    transfers,
    discarded,
    iams,
    devices,
    users,
    productCategories,
    productCategoryItems,
    productFiles,
    qaItems, // ← 新增
  };

  return {
    meta: { version: 1 as const, exportedAt: new Date().toISOString() },
    data,
  };
}

/** 修復 DB 並收集「被引用」的檔案路徑（支援以 productId 為資料夾、以及 QA 的引用） */
async function repairAndCollectReferencedFiles() {
  const [productsLite, productFiles, qaLite] = await prisma.$transaction([
    prisma.product.findMany({
      select: { id: true, localImage: true, imageLink: true },
      orderBy: { id: "asc" },
    }),
    prisma.productFile.findMany({
      select: { id: true, productId: true, path: true, files: true, sizeBytes: true },
      orderBy: { id: "asc" },
    }),
    prisma.qAItem.findMany({
      select: { id: true, contentMd: true },
      orderBy: { id: "asc" },
    }),
  ]);

  const usedImageRelSet = new Set<string>();
  const usedPFileRelSet = new Set<string>();
  const usedQaRelSet = new Set<string>(); // ← 新增

  const prodUpdates: any[] = [];
  const pfUpdates: any[] = [];

  // Product.localImage 檢查
  for (const p of productsLite) {
    const localImage = p.localImage ?? "";
    if (!localImage) continue;

    const rel = makeProductImageRel(localImage);
    if (!rel) continue;

    const abs = safePublicAbs(rel);
    if (!abs || !(await existsFile(abs))) {
      prodUpdates.push(
        prisma.product.update({
          where: { id: p.id },
          data: { localImage: null, imageLink: null },
        })
      );
    } else {
      usedImageRelSet.add(rel);
    }
  }

  // ProductFile.files 檢查
  for (const pf of productFiles) {
    const orig = (pf.files ?? {}) as Record<string, unknown>;
    const cleaned: Record<string, string[]> = {};
    let totalBytes = 0;

    for (const [cat, arr] of Object.entries(orig)) {
      const kept: string[] = [];
      if (isNonEmptyArray(arr)) {
        for (const s of arr) {
          const candidates = candidatePathsForEntry(pf, s);
          let foundAbs: string | null = null;
          let foundRel: string | null = null;

          for (const rel of candidates) {
            const abs = safePublicAbs(rel);
            if (abs && (await existsFile(abs))) {
              foundAbs = abs;
              foundRel = rel;
              break;
            }
          }

          if (foundAbs && foundRel) {
            kept.push(s);
            usedPFileRelSet.add(foundRel);
            try {
              const st = await fs.stat(foundAbs);
              if (st.isFile()) totalBytes += st.size;
            } catch {}
          }
        }
      }
      if (kept.length) cleaned[cat] = kept;
    }

    if (!deepEqual(orig, cleaned) || (pf.sizeBytes ?? null) !== totalBytes) {
      pfUpdates.push(
        prisma.productFile.update({
          where: { id: pf.id },
          data: { files: cleaned as any, sizeBytes: totalBytes || null },
        })
      );
    }
  }

  // QA: 只收集被引用的 /qa/* 檔案（不更動 DB）
  for (const q of qaLite) {
    for (const rel of extractQaRelsFromMd(q.contentMd)) {
      if (rel.startsWith(QA_PREFIX)) {
        const abs = safePublicAbs(rel);
        if (abs && (await existsFile(abs))) usedQaRelSet.add(rel);
      }
    }
  }

  if (prodUpdates.length + pfUpdates.length > 0) {
    await prisma.$transaction([...prodUpdates, ...pfUpdates]);
  }

  return {
    usedImageRelSet,
    usedPFileRelSet,
    usedQaRelSet, // ← 新增
    summary: {
      productsFixed: prodUpdates.length,
      productFilesFixed: pfUpdates.length,
      qaReferencedCount: usedQaRelSet.size,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const format = (url.searchParams.get("format") || "json").toLowerCase();

    // 獨立控制打包模式（預設 referenced）
    const imagesMode = (url.searchParams.get("images") || "referenced").toLowerCase();
    const pfilesMode = (
      url.searchParams.get("pfiles") ||
      url.searchParams.get("files") ||
      "referenced"
    ).toLowerCase();
    const qaMode = (url.searchParams.get("qa") || "referenced").toLowerCase(); // ← 新增

    // JSON
    if (format === "json") {
      const snap = await readSnapshot(); // ← 包含 passwordHash 與 QA
      return NextResponse.json(snap, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="lab330-export-${snap.meta.exportedAt.replace(
            /[:.]/g,
            "-"
          )}.json"`,
        },
      });
    }

    // ZIP
    if (format === "zip") {
      const archiver = await loadArchiver();

      const { usedImageRelSet, usedPFileRelSet, usedQaRelSet, summary } =
        await repairAndCollectReferencedFiles();

      const snap = await readSnapshot();
      const exportedAt = snap.meta.exportedAt;

      // 預設：只打被參照
      let imagesToPack: string[] = Array.from(usedImageRelSet);
      let pfilesToPack: string[] = Array.from(usedPFileRelSet);
      let qaToPack: string[] = Array.from(usedQaRelSet);

      if (imagesMode === "all") {
        imagesToPack = await walkAllFilesUnder(PRODUCT_IMAGES_PREFIX);
      }
      if (pfilesMode === "all") {
        pfilesToPack = await walkAllFilesUnder(PRODUCT_FILES_PREFIX);
      }
      if (qaMode === "all") {
        qaToPack = await walkAllFilesUnder(QA_PREFIX);
      }

      const pass = new PassThrough();
      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.on("error", (err: any) => pass.destroy(err));
      archive.pipe(pass);

      // export.json
      archive.append(Buffer.from(JSON.stringify(snap, null, 2), "utf8"), {
        name: "export.json",
      });

      // 報告
      const report = [
        `Lab330 Data Export`,
        `Exported at: ${exportedAt}`,
        ``,
        `Fix summary before export:`,
        `- Products cleared (missing product_images): ${summary.productsFixed}`,
        `- ProductFiles updated (missing product_files removed / sizeBytes recalculated): ${summary.productFilesFixed}`,
        `- QA referenced files detected: ${summary.qaReferencedCount}`,
        ``,
        `Files mode: images=${imagesMode}, pfiles=${pfilesMode}, qa=${qaMode}`,
        `Files included:`,
        `- product_images: ${imagesToPack.length}`,
        `- product_files: ${pfilesToPack.length}`,
        `- qa: ${qaToPack.length}`,
        ``,
        `Tables included:`,
        `- Device, Discarded, IamsMapping, Location, Product, ProductCategory, ProductCategoryItem, ProductFile, Rental, Stock, Transfer, User, QAItem`,
        ``,
        `User.passwordHash is INCLUDED (hashed). Handle with care.`,
      ].join("\n");

      archive.append(Buffer.from(report, "utf8"), { name: "cleanup-report.txt" });

      for (const rel of imagesToPack) {
        const abs = safePublicAbs(rel);
        if (abs) archive.file(abs, { name: rel });
      }
      for (const rel of pfilesToPack) {
        const abs = safePublicAbs(rel);
        if (abs) archive.file(abs, { name: rel });
      }
      for (const rel of qaToPack) {
        const abs = safePublicAbs(rel);
        if (abs) archive.file(abs, { name: rel });
      }

      archive.finalize();
      const webStream = NodeReadable.toWeb(pass) as unknown as ReadableStream;
      const filename = `lab330-export-${exportedAt.replace(/[:.]/g, "-")}.zip`;

      return new NextResponse(webStream, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return new NextResponse("Invalid format. Use ?format=json or ?format=zip", { status: 400 });
  } catch (err: any) {
    console.error(err);
    return new NextResponse(err?.message ?? "Export failed", { status: 500 });
  }
}
