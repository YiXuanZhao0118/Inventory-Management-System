// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, verifySession } from "@/lib/auth"; // ← 使用同一份 jose 驗證

// 受保護的路徑（可自行擴充）
const PROTECTED_MATCHERS = ["/admin", "/admin/:path*", "/api/admin/:path*"];

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // 只攔受保護路徑
  const isProtected = PROTECTED_MATCHERS.some((m) => {
    if (m.endsWith(":path*")) {
      const base = m.replace("/:path*", "");
      return pathname === base || pathname.startsWith(`${base}/`);
    }
    return pathname === m;
  });
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const payload = token ? await verifySession(token) : null;

  if (payload) {
    // ✅ 已登入，放行
    return NextResponse.next();
  }

  // ❌ 未登入／驗證失敗 → 導到登入頁，並帶 next 回跳
  const url = req.nextUrl.clone();
  url.pathname = "/account";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;

  const res = NextResponse.redirect(url);
  // 清掉壞掉的 cookie（避免循環）
  res.cookies.set(AUTH_COOKIE, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

// 讓 middleware 只跑在 /admin 與 /api/admin 底下
export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
