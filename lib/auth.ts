// lib/auth.ts
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const AUTH_COOKIE = "session"; // 與你現有 API 使用的名稱一致

// 你要放在 JWT 內的基本欄位（可再擴增 role/email…）
export type SessionClaims = {
  userId: string;
  username: string;
  role?: string; // 需要角色控管時會用到
} & JWTPayload;

function getSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a long random string in .env.local"
    );
  }
  return new TextEncoder().encode(s);
}

/** 簽發 JWT（預設 7 天） */
export async function signSession(
  payload: Omit<SessionClaims, "iat" | "exp">,
  opts?: { expiresIn?: string | number }
) {
  const secret = getSecret();
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(opts?.expiresIn ?? "7d")
    .sign(secret);
  return token;
}

/** 驗證 JWT；有效則回傳 payload，否則回傳 null */
export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const secret = getSecret();
    const { payload } = await jwtVerify(token, secret);
    if (!payload || typeof payload !== "object") return null;
    if (!payload.userId || !payload.username) return null;
    return payload as SessionClaims;
  } catch {
    return null;
  }
}
