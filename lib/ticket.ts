// lib/ticket.ts
import { SignJWT, jwtVerify } from "jose";

function getSecret() {
  const s = process.env.AUTH_SECRET || "dev-secret-change-me";
  return new TextEncoder().encode(s);
}

export async function issueSignupTicket(
  payload: { email: string; username: string },
  expiresInSec = 600 // 10 分鐘
) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSec)
    .sign(getSecret());
}

export async function verifySignupTicket<
  T extends { email: string; username: string }
>(token: string): Promise<T> {
  const { payload } = await jwtVerify(token, getSecret());
  return payload as T;
}

export async function issueResetTicket(
  payload: { email: string; userId: string },
  expiresInSec = 600 // 10 分鐘
) {
  // 帶上 purpose 以避免用錯場景
  return new SignJWT({ ...payload, purpose: "reset" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSec)
    .sign(getSecret());
}

export async function verifyResetTicket<
  T extends { email: string; userId: string; purpose?: string }
>(token: string): Promise<T> {
  const { payload } = await jwtVerify(token, getSecret());
  if (payload.purpose !== "reset") {
    throw new Error("Invalid ticket purpose");
  }
  return payload as T;
}
