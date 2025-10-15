// app/api/rentals/long-term/open/pm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildLocationPathMap } from "@/lib/locationPath";

export const dynamic = "force-dynamic";

const intOr = (s: string | null, d: number) => {
  const n = s ? parseInt(s, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : d;
};

type Item = {
  stockId: string;
  borrower: string;
  renter: string | null;
  loanDate: string;      // ISO
  dueDate: string | null;// ISO
  product: { id: string; name: string; brand: string; model: string };
  iamsId: string | null;
  locationPath: string[];
};

type Paged<T> = {
  items: T[];
  page: { page: number; pageSize: number; total: number; totalPages: number };
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const page = intOr(url.searchParams.get("page"), 1);
    const limit = intOr(url.searchParams.get("limit"), 20);

    // 撈出「PM、長期借出、未歸還」
    const rentals = await prisma.rental.findMany({
      where: {
        loanType: "long_term",
        returnDate: null,
        product: { isPropertyManaged: true },
      },
      select: {
        stockId: true,
        borrower: true,
        renter: true,
        loanDate: true,
        dueDate: true,
        product: { select: { id: true, name: true, brand: true, model: true } },
        locationId: true,
        location: { select: { id: true, label: true } },
        stock: { select: { iams: { select: { iamsId: true } } } },
      },
      orderBy: [{ loanDate: "asc" }],
    });

    // 相容 Map 或 Record 的 location path
    const rawLocPathMap = (await buildLocationPathMap()) as
      | Map<string, string[]>
      | Record<string, string[]>;
    const getLocPath = (id: string): string[] => {
      if (rawLocPathMap instanceof Map) return rawLocPathMap.get(id) ?? [];
      return (rawLocPathMap as Record<string, string[]>)[id] ?? [];
    };

    // 映射為前端需要的結構（含 iamsId）
    let list: Item[] = rentals.map((r) => ({
      stockId: r.stockId,
      borrower: r.borrower || "",
      renter: r.renter || null,
      loanDate: new Date(r.loanDate).toISOString(),
      dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : null,
      product: r.product,
      iamsId: r.stock?.iams?.iamsId ?? null,
      locationPath: (getLocPath(r.locationId) ?? []).length
        ? getLocPath(r.locationId)
        : [r.location?.label ?? ""],
    }));

    // 搜尋（借用人 / 經手人 / 品名 / 型號 / 品牌 / 位置 / StockId / IAMS）
    if (q) {
      const qq = q.toLowerCase();
      list = list.filter((x) => {
        const hay = [
          x.borrower,
          x.renter ?? "",
          x.product.name,
          x.product.brand,
          x.product.model,
          x.locationPath.join(" "),
          x.stockId,
          x.iamsId ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(qq);
      });
    }

    // 排序：到期日早的在前；沒到期日放後面；再以品名
    list.sort((a, b) => {
      const ad = a.dueDate ? +new Date(a.dueDate) : Number.POSITIVE_INFINITY;
      const bd = b.dueDate ? +new Date(b.dueDate) : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return a.product.name.localeCompare(b.product.name);
    });

    // 分頁
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pageClamped = Math.min(Math.max(1, page), totalPages);
    const start = (pageClamped - 1) * limit;
    const items = list.slice(start, start + limit);

    const payload: Paged<Item> = {
      items,
      page: { page: pageClamped, pageSize: limit, total, totalPages },
    };

    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json(
      { message: err?.message ?? "Failed to load open long-term rentals (PM)" },
      { status: 500 }
    );
  }
}
