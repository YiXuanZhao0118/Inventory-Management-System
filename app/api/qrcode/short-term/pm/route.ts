import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeOrigin(x: string | null | undefined): string | null {
  if (!x) return null;
  let s = x.trim();
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  try {
    const u = new URL(s);
    return u.origin;
  } catch {
    return null;
  }
}

function resolveBaseOrigin(req: NextRequest, sp: URLSearchParams): string {
  const qBase = normalizeOrigin(sp.get("base"));
  if (qBase) return qBase;

  const envBase =
    normalizeOrigin(process.env.NEXT_PUBLIC_BASE_ORIGIN) ||
    normalizeOrigin(process.env.APP_BASE_ORIGIN) ||
    normalizeOrigin(process.env.BASE_ORIGIN);
  if (envBase) return envBase;

  const proto =
    (req.headers.get("x-forwarded-proto") ||
      req.nextUrl.protocol.replace(":", "") ||
      "http").toLowerCase();
  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    req.nextUrl.host ||
    "";

  if (
    !host ||
    host.includes("0.0.0.0") ||
    host.startsWith("127.0.0.1") ||
    host.toLowerCase().startsWith("localhost")
  ) {
    const fb = process.env.PREFERRED_HOSTPORT || "172.30.10.16:3000";
    return `http://${fb}`;
  }
  return `${proto}://${host}`;
}

function bool(param: string | null, def = false) {
  if (param == null) return def;
  return ["1", "true", "yes", "on"].includes(param.toLowerCase());
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const onlyInStock = bool(searchParams.get("onlyInStock"), false);
    const q = (searchParams.get("q") || "").trim();

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

    // ✅ 尊重前端 pageSize：夾限到 1..200
    const rawSize = parseInt(searchParams.get("pageSize") || "20", 10);
    const pageSizeReq = Number.isFinite(rawSize) ? rawSize : 20;
    const pageSize = Math.min(Math.max(pageSizeReq, 1), 200);
    const skip = (page - 1) * pageSize;

    const base = resolveBaseOrigin(req, searchParams);

    const where: any = {
      discarded: false,
      product: { isPropertyManaged: true },
      ...(onlyInStock ? { currentStatus: "in_stock" as const } : {}),
    };

    if (q) {
      // 支援搜尋：IAMS 編號 / brand / model / name / location.label
      where.OR = [
        { iams: { is: { iamsId: { contains: q, mode: "insensitive" } } } },
        { product: { brand: { contains: q, mode: "insensitive" } } },
        { product: { model: { contains: q, mode: "insensitive" } } },
        { product: { name: { contains: q, mode: "insensitive" } } },
        { location: { label: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [total, stocks, allLocations] = await Promise.all([
      prisma.stock.count({ where }),
      prisma.stock.findMany({
        where,
        include: { product: true, location: true, iams: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize, // ✅ 真的用前端給的 pageSize
      }),
      // 用於組 location 路徑
      prisma.location.findMany({
        select: { id: true, parentId: true, label: true },
      }),
    ]);

    // 構建 location 路徑（父→子）
    const byId = new Map(allLocations.map((l) => [l.id, l]));
    const pathCache = new Map<string, string>();
    const buildPath = (id: string): string => {
      if (pathCache.has(id)) return pathCache.get(id)!;
      const chain: string[] = [];
      let cur = byId.get(id);
      const guard = new Set<string>();
      while (cur && !guard.has(cur.id)) {
        guard.add(cur.id);
        chain.push(cur.label);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      const path = chain.reverse().join(" / ");
      pathCache.set(id, path);
      return path;
    };

    const items = stocks.map((s) => {
      const stockId = s.id;
      const shortTermUrl = `${base}/short-term?stock=${encodeURIComponent(stockId)}`;
      return {
        stockId,
        iamsId: s.iams?.iamsId ?? null,
        url: shortTermUrl,
        img: {
          svg: `/api/qrcode/stock/${encodeURIComponent(stockId)}?format=svg`, // 前端決定 size/base
          png: `/api/qrcode/stock/${encodeURIComponent(stockId)}?format=png`,
        },
        product: {
          id: s.productId,
          name: s.product.name,
          brand: s.product.brand,
          model: s.product.model,
        },
        location: {
          id: s.locationId,
          label: s.location.label,
          path: buildPath(s.locationId),
        },
        status: s.currentStatus,
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return NextResponse.json({ items, base, total, page, pageSize, totalPages });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
