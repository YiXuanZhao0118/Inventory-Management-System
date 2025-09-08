// app/api/products/route.ts
export const runtime = "nodejs"; // 需要 fs
import { sortProductsInPlace } from "@/components/sortProducts";

import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";
import {
  getProducts,
  saveProducts,
  type ProductItem,
} from "@/lib/db";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const IMG_DIR = path.join(PUBLIC_DIR, "product_images");

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function extFrom(contentType: string | null, urlPath: string) {
  const ct = (contentType || "").toLowerCase();
  if (ct.startsWith("image/")) {
    const t = ct.split("/")[1];
    if (t === "jpeg") return "jpg";
    if (t === "svg+xml") return "svg";
    return t;
  }
  const ext = path.extname(urlPath).replace(".", "").toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext)) {
    return ext === "jpeg" ? "jpg" : ext;
  }
  return "jpg";
}

async function tryDownload(imageUrl: string, id: string): Promise<string | null> {
  if (!imageUrl) return null;

  try {
    ensureDir(IMG_DIR);

    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": "https://www.thorlabs.com/",
      },
      redirect: "follow",
      cache: "no-store",
    });

    if (!res.ok) {
      const snippet = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} – ${snippet.slice(0, 200)}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const ext = extFrom(res.headers.get("content-type"), new URL(imageUrl).pathname);
    const filename = `${id}.${ext}`;
    fs.writeFileSync(path.join(IMG_DIR, filename), buf);
    return `/product_images/${filename}`;
  } catch (e: any) {
    console.error("[products:image-download]", imageUrl, e?.message || e);
    return null;
  }
}

export async function GET() {
  const products = getProducts();
  return NextResponse.json(products);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const name = String(body.name ?? "").trim();
    const brand = String(body.brand ?? "").trim();
    const model = String(body.model ?? "").trim();
    const specifications = String(body.specifications ?? "").trim();
    const price = Number(body.price ?? 0);
    const imageLink = String(body.imageLink ?? "").trim();
    const isPropertyManaged = Boolean(body.isPropertyManaged);

    if (!name || !brand || !model || !specifications) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (Number.isNaN(price) || price < 0) {
      return NextResponse.json({ error: "Invalid price" }, { status: 400 });
    }

    const list = getProducts();
    const norm = (s: string) => s.trim().toLowerCase();
    const duplicate = list.some(
      (p) => norm(p.brand) === norm(brand) && norm(p.model) === norm(model)
    );
    if (duplicate) {
      return NextResponse.json(
        { error: "Product already exists (brand+model duplicate)" },
        { status: 409 }
      );
    }

    const id = uuid();
    const localImage = imageLink ? await tryDownload(imageLink, id) : null;

    const item: ProductItem = {
      id,
      name,
      brand,
      model,
      specifications,
      price,
      imageLink,
      localImage, // 若下載失敗會是 null
      isPropertyManaged,
    };

    saveProducts([...list, item]);
    await sortProductsInPlace(); 
    return NextResponse.json(item, { status: 201 });
  } catch (err: any) {
    console.error("[products POST]", err);
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
