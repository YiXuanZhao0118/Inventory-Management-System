// app/api/products/[id]/route.ts
export const runtime = "nodejs";
import { sortProductsInPlace } from "@/components/sortProducts";

import { NextResponse, NextRequest } from "next/server";
import path from "path";
import fs from "fs";
import { getProducts, saveProducts, getStock } from "@/lib/db";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const IMG_DIR = path.join(PUBLIC_DIR, "product_images");
const ALLOWED = ["jpg", "jpeg", "png", "webp", "gif", "svg"] as const;

type Ctx = { params: Promise<{ id: string }> }; // 👈 Next 15: params is async

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function normalizeExt(ext: string) {
  const e = ext.replace(".", "").toLowerCase();
  if (e === "jpeg") return "jpg";
  return ALLOWED.includes(e as any) ? (e as (typeof ALLOWED)[number]) : "jpg";
}
function extFrom(contentType: string | null, urlPath: string) {
  const ct = (contentType || "").toLowerCase();
  if (ct.startsWith("image/")) {
    const t = ct.split("/")[1]?.split(";")[0] || "jpg";
    return normalizeExt(t);
  }
  const urlExt = path.extname(urlPath || "").toLowerCase();
  return normalizeExt(urlExt || "jpg");
}
function relPathFor(productId: string, ext: string) {
  const safeExt = normalizeExt(ext);
  return `/product_images/${productId}.${safeExt}`;
}
function abs(p: string) {
  return path.join(PUBLIC_DIR, p);
}
function purgeOtherImages(productId: string, keepRel: string) {
  ensureDir(IMG_DIR);
  for (const ext of ALLOWED) {
    const rel = relPathFor(productId, ext);
    if (rel === keepRel) continue;
    const fp = abs(rel);
    if (fs.existsSync(fp)) {
      try {
        fs.unlinkSync(fp);
      } catch {}
    }
  }
}

async function downloadToSingleSlot(
  productId: string,
  url: string
): Promise<{ ok: boolean; rel: string | null }> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { ok: false, rel: null };
    const ct = res.headers.get("content-type") || "";
    const ext = extFrom(ct, url);
    const rel = relPathFor(productId, ext);
    const filePath = abs(rel);

    ensureDir(IMG_DIR);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buf);

    purgeOtherImages(productId, rel);
    return { ok: true, rel };
  } catch {
    return { ok: false, rel: null };
  }
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params; // 👈 await
    const list = getProducts();
    const product = list.find((p) => p.id === id);
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
    return NextResponse.json(product);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params; // 👈 await
    const body = await req.json();

    const products = getProducts();
    const idx = products.findIndex((p) => p.id === id);
    if (idx === -1) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const prev = products[idx];
    const next = {
      ...prev,
      name: String(body.name ?? prev.name),
      brand: String(body.brand ?? prev.brand),
      model: String(body.model ?? prev.model),
      specifications: String(body.specifications ?? prev.specifications),
      price: Number.isFinite(Number(body.price)) ? Number(body.price) : prev.price,
      imageLink: typeof body.imageLink === "string" ? body.imageLink : prev.imageLink,
      localImage: prev.localImage ?? null,
    };

    let downloadOk: boolean | undefined = undefined;

    if (typeof next.imageLink === "string" && next.imageLink.trim() !== "") {
      const { ok, rel } = await downloadToSingleSlot(id, next.imageLink);
      if (ok && rel) {
        next.localImage = rel;
        downloadOk = true;
      } else {
        downloadOk = false;
        if (body.forceClearLocalImageOnError === true) {
          if (next.localImage) {
            try {
              fs.unlinkSync(abs(next.localImage));
            } catch {}
          }
          next.localImage = null;
          purgeOtherImages(id, "__NONE__");
        } else {
          next.localImage = prev.localImage ?? null;
        }
      }
    } else if (body.forceClearLocalImageOnError === true) {
      if (next.localImage) {
        try {
          fs.unlinkSync(abs(next.localImage));
        } catch {}
      }
      next.localImage = null;
      purgeOtherImages(id, "__NONE__");
    }

    products[idx] = next;
    saveProducts(products);
    await sortProductsInPlace();

    return NextResponse.json({ product: next, downloadOk });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Bad Request" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params; // 👈 await
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const inUse = getStock().some((s) => s.productId === id);
    if (inUse) {
      return NextResponse.json(
        { error: "Product is still referenced by stock. Cannot delete." },
        { status: 400 }
      );
    }

    const products = getProducts();
    const exists = products.some((p) => p.id === id);
    if (!exists) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    purgeOtherImages(id, "__NONE__");

    const next = products.filter((p) => p.id !== id);
    saveProducts(next);
    await sortProductsInPlace();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Delete failed" }, { status: 500 });
  }
}
