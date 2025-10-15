// app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isSecureRequest(req: NextRequest) {
  const xfProto = req.headers.get("x-forwarded-proto");
  if (xfProto) return xfProto.split(",")[0].trim() === "https";
  try {
    return req.nextUrl.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const secure = isSecureRequest(req);
  const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  res.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
  return res;
}

export async function GET(req: NextRequest) {
  return POST(req);
}
