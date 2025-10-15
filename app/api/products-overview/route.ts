import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const pickImageUrl = (...cands: Array<string | null | undefined>) => {
  for (const u of cands) if (u && /^(https?:\/\/|\/)/i.test(u.trim())) return u.trim();
  return null;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));
  const pm = searchParams.get("pm"); // "all" | "true" | "false"
  const q = (searchParams.get("q") || "").trim();

  const whereAND: any[] = [];
  if (pm === "true") whereAND.push({ isPropertyManaged: true });
  if (pm === "false") whereAND.push({ isPropertyManaged: false });

  if (q) {
    const tokens = q.toLowerCase().split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);
    for (const tk of tokens) {
      whereAND.push({
        OR: [
          { name:  { contains: tk, mode: "insensitive" } },
          { brand: { contains: tk, mode: "insensitive" } },
          { model: { contains: tk, mode: "insensitive" } },
          // 搜 P/N
          { files: { some: { partNumber: { contains: tk, mode: "insensitive" } } } },
        ],
      });
    }
  }

  const where = whereAND.length ? { AND: whereAND } : {};

  const [total, products] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ brand: "asc" }, { model: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        brand: true,
        model: true,
        specifications: true,
        localImage: true,
        imageLink: true,
        isPropertyManaged: true,
        _count: { select: { files: true } },
      },
    }),
  ]);

  const items = products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    model: p.model,
    specifications: p.specifications,
    imageUrl: pickImageUrl(p.localImage, p.imageLink),
    datasheetCount: p._count.files,
    isPropertyManaged: p.isPropertyManaged,
  }));

  return NextResponse.json({ items, total, page, pageSize });
}
