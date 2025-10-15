// lib/hash.ts
import bcrypt from "bcryptjs";

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function hashCode(plain: string) {
  // Verification codes change often; slightly lower cost is OK
  return bcrypt.hash(plain, 8);
}

export async function verifyCode(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}
