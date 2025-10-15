// app/api/auth/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifySession, type SessionClaims } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const payload = (await verifySession(token)) as SessionClaims | null;
    if (!payload) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const res = NextResponse.json(
      {
        ok: true,
        user: {
          id: payload.userId,
          username: payload.username,
          // role: payload.role,
        },
      },
      { status: 200 }
    );

    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res;
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}
