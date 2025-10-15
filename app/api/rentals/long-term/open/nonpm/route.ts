// app/api/rentals/long-term/open/nonpm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildLocationPathMap } from "@/lib/locationPath";

export const dynamic = "force-dynamic";

const intOr = (s: string | null, d: number) => {
  const n = s ? parseInt(s, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : d;
};

type Item = {
  groupId: string; // 唯一、穩定 key
  product: { id: string; name: string; brand: string; model: string };
  locationId: string;
  locationPath: string[];
  borrower: string;
  renter: string;
  quantity: number; // outstanding
  dueDate: string | null; // 該 group 最早到期日（ISO）
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

    // 撈出 Non-PM、長期借出、未歸還
    const rentals = await prisma.rental.findMany({
      where: {
        loanType: "long_term",
        returnDate: null,
        product: { isPropertyManaged: false },
      },
      select: {
        productId: true,
        locationId: true,
        borrower: true,
        renter: true,
        loanDate: true,
        dueDate: true,
        product: { select: { id: true, name: true, brand: true, model: true } },
        location: { select: { id: true, label: true } },
      },
      orderBy: [{ loanDate: "asc" }],
    });

    // 相容 Map 或 Record 的取值工具
    const rawLocPathMap = (await buildLocationPathMap()) as
      | Map<string, string[]>
      | Record<string, string[]>;
    const getLocPath = (id: string): string[] => {
      if (rawLocPathMap instanceof Map) return rawLocPathMap.get(id) ?? [];
      return (rawLocPathMap as Record<string, string[]>)[id] ?? [];
    };

    // 後端彙總：同 productId+locationId+borrower+renter 聚合
    const grouped = new Map<string, Item>();
    for (const r of rentals) {
      const borrower = r.borrower || "";
      const renter = r.renter || "";
      const key = `${r.productId}::${r.locationId}::${borrower}::${renter}`;
      const locPath = getLocPath(r.locationId);
      const dueISO = r.dueDate ? new Date(r.dueDate).toISOString() : null;

      const ex = grouped.get(key);
      if (ex) {
        ex.quantity += 1;
        if (dueISO && (!ex.dueDate || +new Date(dueISO) < +new Date(ex.dueDate))) {
          ex.dueDate = dueISO;
        }
      } else {
        grouped.set(key, {
          groupId: key,
          product: r.product,
          locationId: r.locationId,
          locationPath: locPath.length ? locPath : [r.location?.label ?? ""],
          borrower,
          renter,
          quantity: 1,
          dueDate: dueISO,
        });
      }
    }

    // 搜尋
    let list = Array.from(grouped.values());
    if (q) {
      const qq = q.toLowerCase();
      list = list.filter((x) => {
        const hay = [
          x.borrower,
          x.renter,
          x.product.name,
          x.product.brand,
          x.product.model,
          x.locationPath.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(qq);
      });
    }

    // 排序：到期日早的在前，最後以品名排序
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
      { message: err?.message ?? "Failed to load open long-term rentals (Non-PM)" },
      { status: 500 }
    );
  }
}
