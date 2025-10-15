// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { AUTH_COOKIE, signSession } from "@/lib/auth";

const prisma = new PrismaClient();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 🔧 與你的 logout 相同的判斷：看 x-forwarded-proto / 連線協定
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
  let body: { username?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const loginId = (body.username ?? body.email ?? "").trim();
  const password = (body.password ?? "").trim();
  if (!loginId || !password) {
    return NextResponse.json(
      { ok: false, message: "Username/Email and password are required." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findFirst({
    where: { OR: [{ username: loginId }, { email: loginId }] },
  });

  const invalid = NextResponse.json(
    { ok: false, message: "Invalid credentials." },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
  if (!user || !user.passwordHash) return invalid;

  const passOK = await bcrypt.compare(password, user.passwordHash);
  if (!passOK) return invalid;

  const token = await signSession(
    { userId: user.id, username: user.username /* , role: user.role */ },
    { expiresIn: "7d" }
  );

  const secure = isSecureRequest(req); // ✅ 依據實際協定決定是否標記 Secure

  const res = NextResponse.json(
    { ok: true, user: { id: user.id, username: user.username } },
    { headers: { "Cache-Control": "no-store" } }
  );

  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,       // ← 關鍵
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    // domain: 可不填；如需跨子網域才設定（例如 .yixuan.tw）
  });

  return res;
}
1