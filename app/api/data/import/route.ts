// app/api/data/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import path from "path";
import fs from "fs/promises";
import AdmZip from "adm-zip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---------- Paths ----------
const CWD = process.cwd();
const PUBLIC_DIR = path.join(CWD, "public");
const PRODUCT_IMAGES_PREFIX = "product_images/";
const PRODUCT_FILES_PREFIX = "product_files/";
const QA_PREFIX = "qa/";
const IMAGES_DIR = path.join(PUBLIC_DIR, "product_images");
const PFILES_DIR = path.join(PUBLIC_DIR, "product_files");
const QA_DIR = path.join(PUBLIC_DIR, "qa");

// ---------- Helpers ----------
function toPosix(p: string) { return p.replace(/\\/g, "/"); }
function stripLeadingSlash(p: string) { return p.replace(/^[/\\]+/, ""); }
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
async function ensureDirs() {
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  await fs.mkdir(PFILES_DIR, { recursive: true });
  await fs.mkdir(QA_DIR, { recursive: true });
}
async function cleanDirs() {
  await fs.rm(IMAGES_DIR, { recursive: true, force: true }).catch(() => {});
  await fs.rm(PFILES_DIR, { recursive: true, force: true }).catch(() => {});
  await fs.rm(QA_DIR, { recursive: true, force: true }).catch(() => {});
  await ensureDirs();
}

// 與 export 對齊的路徑規則
function makeProductImageRel(localImage: string) {
  let rel = normalizePublicRel(localImage);
  if (!rel) return "";
  if (!rel.startsWith(PRODUCT_IMAGES_PREFIX)) rel = PRODUCT_IMAGES_PREFIX + rel;
  return rel; // 不含前導斜線
}
function makeProductFilesBase(pfPath: string | null | undefined) {
  let rel = normalizePublicRel(pfPath);
  if (rel.startsWith(PRODUCT_FILES_PREFIX)) rel = rel.slice(PRODUCT_FILES_PREFIX.length);
  rel = rel.replace(/^\/+|\/+$/g, "");
  return rel ? PRODUCT_FILES_PREFIX + rel : PRODUCT_FILES_PREFIX;
}
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

// ---------- QA helpers ----------
function extractQaRelsFromMd(md: string | null | undefined): string[] {
  if (!md) return [];
  const rels = new Set<string>();

  // markdown links/images: ![...]() / [...]()
  for (const m of md.matchAll(/\]\(([^)]+)\)/g)) {
    const url = (m[1] || "").trim();
    if (url.startsWith("/" + QA_PREFIX)) rels.add(url.slice(1));
    else if (url.startsWith(QA_PREFIX)) rels.add(url);
    else {
      const idx = url.indexOf("/" + QA_PREFIX);
      if (idx >= 0) rels.add(url.slice(idx + 1));
    }
  }
  // html: src="..."
  for (const m of md.matchAll(/\bsrc=["']([^"']+)["']/gi)) {
    const url = (m[1] || "").trim();
    if (url.startsWith("/" + QA_PREFIX)) rels.add(url.slice(1));
    else if (url.startsWith(QA_PREFIX)) rels.add(url);
  }
  // fallback: 任一 /qa/xxx
  for (const m of md.matchAll(/\/qa\/[^\s)"'>]+/g)) {
    const url = (m[0] || "").trim();
    rels.add(url.slice(1));
  }

  // 標準化
  return Array.from(rels).map((r) => normalizePublicRel(r));
}

// ---------- ZIP helpers ----------
type ZipEntry = { entryName: string; isDirectory?: boolean; getData(): Buffer; };
function buildZipMap(buffer: Buffer, subPrefix: "product_images/" | "product_files/" | "qa/") {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries() as unknown as ZipEntry[];
  const map = new Map<string, ZipEntry>(); // key: product_images/... / product_files/... / qa/...
  for (const e of entries) {
    if ((e as any).isDirectory) continue;
    const raw = normalizePublicRel(e.entryName);
    const idx = raw.indexOf(subPrefix);
    const tail = idx >= 0 ? raw.slice(idx + subPrefix.length) : raw; // 容忍壓縮內已含前綴
    const rel = subPrefix + stripLeadingSlash(tail);
    if (!map.has(rel)) map.set(rel, e);
  }
  return map;
}
async function extractSelected(zipMap: Map<string, ZipEntry>, rels: Set<string>) {
  for (const rel of rels) {
    const e = zipMap.get(rel);
    if (!e) continue;
    const abs = safePublicAbs(rel);
    if (!abs) continue;
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, e.getData());
  }
}

type ExportBundle = {
  meta?: any;
  data: {
    locations: any[];
    products: any[];
    stocks: any[];
    rentals: any[];
    transfers: any[];
    discarded: any[];
    iams: any[]; // IamsMapping
    devices?: any[];
    users?: any[]; // ← 要包含 passwordHash
    productCategories?: any[];
    productCategoryItems?: any[];
    productFiles?: any[];
    qaItems?: any[]; // ← 新增
  };
};

// ---------- Data cleaning utilities ----------
function uniqueBy<T>(arr: T[], keyFn: (x: T) => string) {
  const seen = new Set<string>(); const out: T[] = [];
  for (const x of arr) { const k = keyFn(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}
function dropAllDuplicates<T>(arr: T[], keyFn: (x: T) => string) {
  const cnt = new Map<string, number>();
  for (const x of arr) { const k = keyFn(x); cnt.set(k, (cnt.get(k) || 0) + 1); }
  return arr.filter((x) => (cnt.get(keyFn(x)) || 0) === 1);
}
const looksLikeHash = (s: string) => typeof s === "string" && s.length > 0 && s.startsWith("$"); // bcrypt/argon2 前綴
function nid() { return "qa_" + Date.now().toString(36) + "_" + cryptoRandomUUID().slice(0, 8); }

// ---------- Normalize & verify with ZIP ----------
async function rebuildFromBundleUsingZip(
  raw: ExportBundle,
  imagesZipMap: Map<string, ZipEntry>,
  pfilesZipMap: Map<string, ZipEntry>,
  qaZipMap: Map<string, ZipEntry>
) {
  // 1) 正規化
  const src = {
    locations: Array.isArray(raw.data.locations) ? raw.data.locations : [],
    products: Array.isArray(raw.data.products) ? raw.data.products : [],
    stocks: Array.isArray(raw.data.stocks) ? raw.data.stocks : [],
    rentals: Array.isArray(raw.data.rentals) ? raw.data.rentals : [],
    transfers: Array.isArray(raw.data.transfers) ? raw.data.transfers : [],
    discarded: Array.isArray(raw.data.discarded) ? raw.data.discarded : [],
    iams: Array.isArray(raw.data.iams) ? raw.data.iams : [],
    devices: Array.isArray(raw.data.devices) ? raw.data.devices : [],
    users: Array.isArray(raw.data.users) ? raw.data.users : [],
    productCategories: Array.isArray(raw.data.productCategories) ? raw.data.productCategories : [],
    productCategoryItems: Array.isArray(raw.data.productCategoryItems) ? raw.data.productCategoryItems : [],
    productFiles: Array.isArray(raw.data.productFiles) ? raw.data.productFiles : [],
    qaItems: Array.isArray(raw.data.qaItems) ? raw.data.qaItems : [],
  };

  // 2) Location：label 重複 -> 全部丟棄該 label
  const locLabelKey = (x: any) => String(x.label ?? "").trim();
  const locationsUnique = dropAllDuplicates(
    src.locations.map((x) => ({ ...x, parentId: x.parentId ?? null })),
    locLabelKey
  ).filter((x) => locLabelKey(x).length > 0);

  // parentId 若不存在就設為 null
  const locIds = new Set(locationsUnique.map((x) => String(x.id)));
  const locations = locationsUnique.map((x) => ({
    ...x,
    parentId: x.parentId && locIds.has(String(x.parentId)) ? String(x.parentId) : null,
  }));

  // 3) Product：brand+model 去重 → 只留第一筆
  const brandModelKey = (x: any) => `${String(x.brand ?? "").trim()}|${String(x.model ?? "").trim()}`;
  const products = uniqueBy(src.products, brandModelKey);

  const productIdSet = new Set(products.map((x) => String(x.id)));
  const locationIdSet = new Set(locations.map((x) => String(x.id)));

  // 4) 檢查 localImage 是否在 ZIP；不存在則清空 & imageLink=null；存在則存成 "/product_images/.."
  const usedImageRels = new Set<string>();
  const cleanedProducts: any[] = [];
  for (const p of products) {
    let localImage = p.localImage ?? null;
    if (typeof localImage === "string" && localImage.length > 0) {
      const rel = makeProductImageRel(localImage); // "product_images/xxx.jpg"
      if (imagesZipMap.has(rel)) {
        localImage = "/" + rel;
        usedImageRels.add(rel);
      } else {
        localImage = null;
        p.imageLink = null;
      }
    }
    cleanedProducts.push({ ...p, localImage });
  }

  // 5) 依 Product/Location 存活篩選 Stocks
  const stocks = src.stocks.filter((s) =>
    productIdSet.has(String(s.productId)) && locationIdSet.has(String(s.locationId))
  );
  const stockIdSet = new Set(stocks.map((x) => String(x.id)));

  // 6) 依存活關係清理 Rental/Transfer/Discarded（含 stockId）
  const rentals = src.rentals.filter(
    (r) => stockIdSet.has(String(r.stockId)) && productIdSet.has(String(r.productId)) && locationIdSet.has(String(r.locationId))
  );
  const transfers = src.transfers.filter(
    (t) => stockIdSet.has(String(t.stockId)) && locationIdSet.has(String(t.fromLocation)) && locationIdSet.has(String(t.toLocation))
  );
  const discarded = src.discarded.filter(
    (d) => stockIdSet.has(String(d.stockId)) && productIdSet.has(String(d.productId)) && locationIdSet.has(String(d.locationId))
  );

  // 7) Category 與 Items（Items 要 product/category 都存在）
  const productCategories = src.productCategories;
  const categoryIdSet = new Set(productCategories.map((x) => String(x.id)));
  const productCategoryItems = src.productCategoryItems.filter(
    (i) => productIdSet.has(String(i.productId)) && categoryIdSet.has(String(i.categoryId))
  );

  // 8) ProductFile：productId 必須存在；files 僅保留 zip 中存在的檔案；重算 sizeBytes
  const productFiles: any[] = [];
  const usedPFileRels = new Set<string>();
  let productFilesKept = 0;
  let productFilesDropped = 0;

  for (const pf of src.productFiles) {
    if (!productIdSet.has(String(pf.productId))) { productFilesDropped += 1; continue; }

    const orig = (pf.files ?? {}) as Record<string, unknown>;
    const cleaned: Record<string, string[]> = {};
    let totalBytes = 0;

    for (const [cat, arr] of Object.entries(orig)) {
      const kept: string[] = [];
      if (Array.isArray(arr)) {
        for (const s of arr as any[]) {
          if (typeof s !== "string") continue;

          const candidates = candidatePathsForEntry(
            { id: String(pf.id), productId: String(pf.productId), path: pf.path },
            s
          );

          let chosenRel: string | null = null;
          for (const rel of candidates) {
            if (pfilesZipMap.has(rel)) { chosenRel = rel; break; }
          }

          if (chosenRel) {
            kept.push(s);
            usedPFileRels.add(chosenRel);
            try {
              const buf = pfilesZipMap.get(chosenRel)!.getData();
              totalBytes += buf.length;
            } catch {}
          }
        }
      }
      if (kept.length) cleaned[cat] = kept;
    }

    const hasFiles = Object.values(cleaned).some((arr) => Array.isArray(arr) && arr.length > 0);
    if (!hasFiles) { productFilesDropped += 1; continue; }

    productFiles.push({ ...pf, files: cleaned, sizeBytes: totalBytes || null });
    productFilesKept += 1;
  }

  // 9) IamsMapping：stockId 必須存在
  const iams = src.iams.filter((x) => stockIdSet.has(String(x.stockId)));

  // 10) Users：**必須**帶 passwordHash（或帶已雜湊的 password）
  const usersCleaned = src.users.map((u: any) => {
    let passwordHash: string | null = null;
    if (typeof u.passwordHash === "string" && u.passwordHash.length > 0) passwordHash = u.passwordHash;
    else if (typeof u.password === "string" && looksLikeHash(u.password)) passwordHash = u.password;
    else passwordHash = null;

    return {
      id: String(u.id ?? cryptoRandomUUID()),
      username: String(u.username ?? "").trim(),
      email: u.email == null ? null : String(u.email).trim(),
      passwordHash,
      createdAt: u.createdAt ? new Date(u.createdAt) : new Date(),
    };
  });

  const usersMissingHash = usersCleaned.filter((u) => !u.passwordHash || u.passwordHash.length === 0);
  if (usersMissingHash.length > 0) {
    const names = usersMissingHash.map((u) => u.username || u.id).slice(0, 10).join(", ");
    throw new Error(`import/users 缺少 passwordHash（或提供的 password 不是雜湊）。請修正 export.json 後重試。樣本: [${names}${usersMissingHash.length > 10 ? "..." : ""}]`);
  }
  const users = uniqueBy(usersCleaned.filter((u) => u.username.length > 0), (u) => u.username.toLowerCase());

  // 11) QA：清洗 + 找到被引用的 qa/* 檔案（僅解壓 zip 中存在的）
  const usedQaRels = new Set<string>();
  const qaItems = (src.qaItems || []).map((q: any) => {
    const id = String(q.id ?? nid());
    const title = String(q.title ?? "").trim();
    const order = Number.isFinite(q.order) ? Number(q.order) : 0;
    const tags = Array.isArray(q.tags) ? q.tags.map((t: any) => String(t).trim()).filter(Boolean) : [];
    const contentMd = typeof q.contentMd === "string" ? q.contentMd : "";

    for (const rel of extractQaRelsFromMd(contentMd)) {
      if (rel.startsWith(QA_PREFIX) && qaZipMap.has(rel)) usedQaRels.add(rel);
    }

    return {
      id, title, tags, order,
      createdAt: q.createdAt ? new Date(q.createdAt) : new Date(),
      updatedAt: q.updatedAt ? new Date(q.updatedAt) : new Date(),
      contentMd,
    };
  });

  return {
    data: {
      locations, products: cleanedProducts, stocks, rentals, transfers, discarded,
      iams, devices: src.devices, users,
      productCategories, productCategoryItems, productFiles, qaItems,
    },
    usedImageRels, usedPFileRels, usedQaRels,
    stats: { productFilesKept, productFilesDropped },
  };
}

// ---------- DB reset & insert ----------
async function resetAllAndInsert(
  data: ReturnType<typeof rebuildFromBundleUsingZip> extends Promise<infer R> ? (R & any)["data"] : never
) {
  await prisma.$transaction(async (tx) => {
    // 刪子表→父表（清空）
    await tx.rental.deleteMany({});
    await tx.transfer.deleteMany({});
    await tx.discarded.deleteMany({});
    await tx.iamsMapping.deleteMany({});
    await tx.productCategoryItem.deleteMany({});
    await tx.productFile.deleteMany({});
    await tx.stock.deleteMany({});
    await tx.productCategory.deleteMany({});
    await tx.product.deleteMany({});
    await tx.location.deleteMany({});
    await tx.device.deleteMany({});
    await tx.qAItem.deleteMany({});
    await tx.user.deleteMany({});

    // 父表
    if (data.locations.length) await tx.location.createMany({ data: data.locations as any });
    if (data.devices.length)   await tx.device.createMany({ data: data.devices as any });
    if (data.users.length)     await tx.user.createMany({ data: data.users as any });
    if (data.productCategories.length)
      await tx.productCategory.createMany({ data: data.productCategories as any });

    // Product
    if (data.products.length)  await tx.product.createMany({ data: data.products as any });

    // 次層
    if (data.productFiles.length)        await tx.productFile.createMany({ data: data.productFiles as any });
    if (data.stocks.length)              await tx.stock.createMany({ data: data.stocks as any });
    if (data.productCategoryItems.length)
      await tx.productCategoryItem.createMany({ data: data.productCategoryItems as any });

    // 依賴 stock 的
    if (data.rentals.length)   await tx.rental.createMany({ data: data.rentals as any });
    if (data.transfers.length) await tx.transfer.createMany({ data: data.transfers as any });
    if (data.discarded.length) await tx.discarded.createMany({ data: data.discarded as any });
    if (data.iams.length)      await tx.iamsMapping.createMany({ data: data.iams as any });

    // QA
    if (data.qaItems.length)   await tx.qAItem.createMany({ data: data.qaItems as any });
  });
}

// ---------- Route ----------
export async function POST(req: NextRequest) {
  try {
    if (!(req.headers.get("content-type") || "").includes("multipart/form-data")) {
      return new NextResponse("請用 multipart/form-data 上傳 export.json、product_images.zip、product_files.zip、qa.zip", { status: 400 });
    }

    const form = await req.formData();

    const exportFile = form.get("export") as unknown as Blob | null;
    const imagesZip  = (form.get("product_images") || form.get("images")) as unknown as Blob | null;
    const pfilesZip  = (form.get("product_files")  || form.get("files"))  as unknown as Blob | null;

    // ★ 支援多種 QA 欄位名
    const qaZip = (
      form.get("qa") ||
      form.get("qa_zip") ||
      form.get("qaZip") ||
      form.get("qa.zip") ||
      form.get("qaFiles") ||
      form.get("qa_files")
    ) as unknown as Blob | null;

    if (!exportFile || !imagesZip || !pfilesZip) {
      return new NextResponse("缺少必要檔案：export、product_images、product_files（若 export.json 含 qaItems 則需一併提供 qa）", { status: 400 });
    }

    // 解析 export.json
    const exportText = Buffer.from(new Uint8Array(await exportFile.arrayBuffer())).toString("utf8");
    let bundle: ExportBundle;
    try { bundle = JSON.parse(exportText); }
    catch { return new NextResponse("export.json 不是合法 JSON", { status: 400 }); }

    const hasQa = Array.isArray(bundle?.data?.qaItems) && bundle.data.qaItems.length > 0;
    if (hasQa && !qaZip) {
      return new NextResponse("export.json 含有 qaItems，但未提供 qa.zip（欄位名 qa/qa_zip/qaZip/qa.zip/qaFiles/qa_files 其一）。", { status: 400 });
    }

    // 建立 zip 目錄對照（不解壓）
    const imgBuf = Buffer.from(new Uint8Array(await imagesZip.arrayBuffer()));
    const pfBuf  = Buffer.from(new Uint8Array(await pfilesZip.arrayBuffer()));
    const imagesZipMap = buildZipMap(imgBuf, PRODUCT_IMAGES_PREFIX);
    const pfilesZipMap = buildZipMap(pfBuf, PRODUCT_FILES_PREFIX);
    const qaZipMap: Map<string, ZipEntry> = hasQa
      ? buildZipMap(Buffer.from(new Uint8Array(await (qaZip as Blob).arrayBuffer())), QA_PREFIX)
      : new Map<string, ZipEntry>();

    // 依規則清理資料，並取得「實際需要用到的檔案清單」
    const { data, usedImageRels, usedPFileRels, usedQaRels, stats } =
      await rebuildFromBundleUsingZip(bundle, imagesZipMap, pfilesZipMap, qaZipMap);

    // 1) 清空 public
    await cleanDirs();

    // 2) 只解壓需要的檔案
    await extractSelected(imagesZipMap, usedImageRels);
    await extractSelected(pfilesZipMap, usedPFileRels);
    if (hasQa) await extractSelected(qaZipMap, usedQaRels);

    // 3) 重建 DB
    await resetAllAndInsert(data);

    return NextResponse.json({
      ok: true,
      counts: {
        locations: data.locations.length,
        products: data.products.length,
        stocks: data.stocks.length,
        rentals: data.rentals.length,
        transfers: data.transfers.length,
        discarded: data.discarded.length,
        iams: data.iams.length,
        devices: data.devices.length,
        users: data.users.length,
        productCategories: data.productCategories.length,
        productCategoryItems: data.productCategoryItems.length,
        productFiles: data.productFiles.length,
        qaItems: data.qaItems.length,
      },
      files: {
        images_extracted: usedImageRels.size,
        product_files_extracted: usedPFileRels.size,
        qa_extracted: usedQaRels?.size ?? 0,
      },
      pruned: {
        productFilesDropped: stats?.productFilesDropped ?? 0,
        productFilesKept: stats?.productFilesKept ?? data.productFiles.length,
      },
      notes: {
        product_dedup: "brand+model 相同只保留第一筆",
        location_dedup: "label 重複的全部丟棄",
        users: "需要提供 passwordHash；若只有 password 但看起來像雜湊（以 $ 開頭）也可接受；否則報錯。",
        files_checked: "僅解壓 export.json 仍引用、且壓縮檔中存在的檔案；Product.localImage 存為 /product_images/...",
        qa: "從 contentMd 萃取 /qa/... 引用並解壓；若 export.json 含 qaItems 則必須提供 qa.zip。",
      },
    });
  } catch (e: any) {
    console.error("POST /api/data/import error:", e);
    return new NextResponse(e?.message || "Import failed", { status: 500 });
  }
}

// 簡單 polyfill（Node 18+ 也可用 crypto.randomUUID）
function cryptoRandomUUID() {
  if (typeof (globalThis as any).crypto?.randomUUID === "function") {
    return (globalThis as any).crypto.randomUUID();
  }
  // 極簡替代：非安全用途，只為補齊 id
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
