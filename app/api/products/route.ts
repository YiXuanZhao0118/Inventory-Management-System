// app/api/products/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { downloadAndSaveProductImage } from "./_image";

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
    orderBy: [{ brand: "asc" }, { model: "asc" }, { name: "asc" }, { createdAt: "desc" }],
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

  // brand + model unique
  const dup = await prisma.product.findFirst({ where: { brand, model } });
  if (dup) return NextResponse.json({ ok: false, message: "Duplicated brand & model" }, { status: 400 });

  // create product first (localImage not set yet)
  const created = await prisma.product.create({
    data: {
      name,
      brand,
      model,
      specifications,
      price: price == null ? null : Number(price), // 若需要更嚴謹可改用 Prisma.Decimal
      imageLink,
      isPropertyManaged: !!isPropertyManaged,
    },
  });

  // try download image
  if (imageLink) {
    try {
      const { localImageRel } = await downloadAndSaveProductImage(created.id, imageLink);
      await prisma.product.update({ where: { id: created.id }, data: { localImage: localImageRel } });
    } catch {
      // keep localImage = null on failure
    }
  }

  return NextResponse.json({ ok: true, id: created.id });
}
