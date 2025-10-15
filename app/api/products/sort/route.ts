// app\api\products\sort\route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { downloadAndSaveProductImage } from "../_image";

export const dynamic = "force-dynamic";

const intOr = (s: string | null, d: number) => {
  const n = s ? parseInt(s, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : d;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const isPMParam = (url.searchParams.get("isPM") ?? "all").toLowerCase(); // "true" | "false" | "all"
  const q = (url.searchParams.get("q") ?? "").trim();
  const page = intOr(url.searchParams.get("page"), 1);
  const limit = intOr(url.searchParams.get("limit"), 20);

  // ✨ 新增：排序參數
  const sortByParam = (url.searchParams.get("sortBy") ?? "name").toLowerCase();
  const sortDirParam = (url.searchParams.get("sortDir") ?? "asc").toLowerCase();
  type SortBy = "name" | "model" | "brand" | "price";
  type SortDir = "asc" | "desc";
  const sortBy: SortBy = (["name", "model", "brand", "price"].includes(sortByParam)
    ? (sortByParam as SortBy)
    : "name");
  const sortDir: SortDir = sortDirParam === "desc" ? "desc" : "asc";

  const iMode: Prisma.QueryMode = "insensitive";

  const or: Prisma.ProductWhereInput[] = q
    ? [
        { name: { contains: q, mode: iMode } },
        { model: { contains: q, mode: iMode } },
        { brand: { contains: q, mode: iMode } },
      ]
    : [];

  const where: Prisma.ProductWhereInput = {
    ...(isPMParam === "true" ? { isPropertyManaged: true } : {}),
    ...(isPMParam === "false" ? { isPropertyManaged: false } : {}),
    ...(or.length ? { OR: or } : {}),
  };

  // ✨ 新增：依參數組 orderBy（主要欄位 + 次要 tie-breakers）
  // 你可以調整 tie-breaker 的順序，以下讓清單穩定：brand -> model -> name -> createdAt(desc)
  const orderBy: Prisma.ProductOrderByWithRelationInput[] = [];

  if (sortBy === "price") {
    // Prisma 5 支援 nulls
    // @ts-ignore
    orderBy.push({ price: { sort: sortDir, nulls: sortDir === "asc" ? "last" : "first" } });
    // 若你的 Prisma 不支援 nulls，可以改成：
    // orderBy.push({ price: sortDir }); // 讓 DB 排，null 的位置依 DB 預設
    // 然後在前端把 null 另外擺最後（需要小幅前端排序修正）
  } else {
    orderBy.push({ [sortBy]: sortDir } as Prisma.ProductOrderByWithRelationInput);
  }

  // 次要排序（避免相同值時跳動）
  if (sortBy !== "brand") orderBy.push({ brand: "asc" });
  if (sortBy !== "model") orderBy.push({ model: "asc" });
  if (sortBy !== "name") orderBy.push({ name: "asc" });
  orderBy.push({ createdAt: "desc" });

  const total = await prisma.product.count({ where });

  const items = await prisma.product.findMany({
    where,
    select: {
      id: true,
      name: true,
      model: true,
      brand: true,
      specifications: true,
      price: true,
      imageLink: true,
      localImage: true,
      isPropertyManaged: true,
    },
    orderBy, // ✨ 套用動態排序
    skip: (page - 1) * limit,
    take: limit,
  });

  return NextResponse.json({
    items,
    page: {
      page,
      pageSize: limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

// 下面 POST 保持原樣（略）…
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const {
    name = "",
    brand = "",
    model = "",
    specifications = "",
    price = null,
    imageLink = null,
    isPropertyManaged = false,
  } = body || {};

  const dup = await prisma.product.findFirst({ where: { brand, model } });
  if (dup) return NextResponse.json({ ok: false, message: "Duplicated brand & model" }, { status: 400 });

  const created = await prisma.product.create({
    data: {
      name,
      brand,
      model,
      specifications,
      price: price == null ? null : Number(price),
      imageLink,
      isPropertyManaged: !!isPropertyManaged,
    },
  });

  if (imageLink) {
    try {
      const { localImageRel } = await downloadAndSaveProductImage(created.id, imageLink);
      await prisma.product.update({ where: { id: created.id }, data: { localImage: localImageRel } });
    } catch {
      // ignore
    }
  }

  return NextResponse.json({ ok: true, id: created.id });
}
