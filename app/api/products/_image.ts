// app/api/products/_image.ts
import fs from "fs";
import path from "path";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const PRODUCT_DIR = path.join(PUBLIC_DIR, "product_images");

const CT_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  // 可能會出現但瀏覽器不一定支援的：
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "image/tiff": "tiff",
};

function extFromUrl(url: string) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\.(jpe?g|png|webp|gif|bmp|svg|heic|heif|avif|tiff)$/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    const m = url.match(/\.(jpe?g|png|webp|gif|bmp|svg|heic|heif|avif|tiff)$/i);
    return m ? m[1].toLowerCase() : null;
  }
}

// 需要轉檔的格式
const NEEDS_CONVERT = new Set(["heic", "heif", "avif", "tiff"]);

// 動態載入 sharp（若沒裝會回 null）
async function loadSharp() {
  try {
    const mod = await import("sharp");
    return (mod as any).default || (mod as any);
  } catch {
    return null;
  }
}

// 版本化檔名；寫檔一定走 PRODUCT_DIR
function buildVersionedFile(productId: string, ext: string) {
  const ver = Date.now().toString(36);
  const fileName = `${productId}.${ver}.${ext}`;
  const urlRel = `/product_images/${fileName}`;     // 提供給前端
  const fileAbs = path.join(PRODUCT_DIR, fileName); // 真正寫入的位置
  return { urlRel, fileAbs };
}

async function ensureDir() {
  await fs.promises.mkdir(PRODUCT_DIR, { recursive: true });
}

async function maybeConvertToWebp(buf: Buffer, inputExt: string) {
  if (!NEEDS_CONVERT.has(inputExt)) {
    return { out: buf, ext: inputExt };
  }
  const sharp = await loadSharp();
  if (!sharp) {
    // 無法轉檔就直接拒絕，避免存成瀏覽器看不懂的格式
    throw new Error(
      "Unsupported image format (needs conversion). Please upload PNG/JPG, or install 'sharp' to enable HEIC/AVIF/TIFF conversion."
    );
  }
  const out = await sharp(buf).rotate().webp({ quality: 85 }).toBuffer();
  return { out, ext: "webp" as const };
}

export async function downloadAndSaveProductImage(productId: string, imageUrl: string) {
  await ensureDir();

  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`);

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const byCT = CT_TO_EXT[ct] || null;
  const byURL = extFromUrl(imageUrl);
  const rawExt = (byCT || byURL || "jpg").replace("jpeg", "jpg");

  const arr = await res.arrayBuffer();
  const raw = Buffer.from(arr);
  const { out, ext } = await maybeConvertToWebp(raw, rawExt);

  const { urlRel, fileAbs } = buildVersionedFile(productId, ext);
  await fs.promises.writeFile(fileAbs, out);
  return { localImageRel: urlRel, absPath: fileAbs };
}

export async function saveUploadedProductImage(productId: string, file: Blob, filename?: string) {
  await ensureDir();

  const mime = (file as any)?.type ? String((file as any).type).toLowerCase() : "";
  const byCT = CT_TO_EXT[mime] || null;

  let byName: string | null = null;
  if (filename) {
    const m = filename.match(/\.(jpe?g|png|webp|gif|bmp|svg|heic|heif|avif|tiff)$/i);
    byName = m ? m[1].toLowerCase() : null;
  }

  const rawExt = (byCT || byName || "jpg").replace("jpeg", "jpg");
  const buf = Buffer.from(await file.arrayBuffer());

  const { out, ext } = await maybeConvertToWebp(buf, rawExt);

  const { urlRel, fileAbs } = buildVersionedFile(productId, ext);
  await fs.promises.writeFile(fileAbs, out);

  return { localImageRel: urlRel, absPath: fileAbs };
}

export async function removeLocalImageIfExists(localImageRel?: string | null) {
  if (!localImageRel) return;
  try {
    // 移除開頭斜線，避免把 PUBLIC_DIR 吃掉
    const rel = localImageRel.replace(/^[/\\]+/, "");
    const abs = path.join(PUBLIC_DIR, rel);
    await fs.promises.unlink(abs);
  } catch {
    /* ignore if not exists */
  }
}
