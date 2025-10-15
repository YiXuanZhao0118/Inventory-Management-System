import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

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
  // 1) ?base=
  const qBase = normalizeOrigin(sp.get("base"));
  if (qBase) return qBase;

  // 2) env
  const envBase =
    normalizeOrigin(process.env.NEXT_PUBLIC_BASE_ORIGIN) ||
    normalizeOrigin(process.env.APP_BASE_ORIGIN) ||
    normalizeOrigin(process.env.BASE_ORIGIN);
  if (envBase) return envBase;

  // 3) forwarded / host
  const proto =
    (req.headers.get("x-forwarded-proto") ||
      req.nextUrl.protocol.replace(":", "") ||
      "http").toLowerCase();
  const host =
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    req.nextUrl.host ||
    "";

  // 4) fallback for local hosts
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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ stockId: string }> } // 👈 Next 15: params 是 Promise
) {
  try {
    const { stockId } = await ctx.params; // 👈 需要 await
    const { searchParams } = new URL(req.url);

    const size = Math.max(
      64,
      Math.min(2048, parseInt(searchParams.get("size") || "512", 10) || 512)
    );
    const format = (searchParams.get("format") || "svg").toLowerCase();
    const margin = Math.max(0, Math.min(8, parseInt(searchParams.get("margin") || "1", 10) || 1));

    const base = resolveBaseOrigin(req, searchParams);
    const content = `${base}/short-term?stock=${encodeURIComponent(stockId)}`;

    if (format === "png") {
      const buf = await QRCode.toBuffer(content, {
        type: "png",
        width: size,
        margin,
        errorCorrectionLevel: "M",
      });
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } else {
      const svg = await QRCode.toString(content, {
        type: "svg",
        width: size,
        margin,
        errorCorrectionLevel: "M",
      });
      return new NextResponse(svg, {
        headers: {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
