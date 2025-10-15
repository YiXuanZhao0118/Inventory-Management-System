import crypto from "crypto";

export function generateCode(): string {
  // 6-digit zero-padded numeric
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}
