// src/lib/config.ts
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ROOT_LOCATION_ID =
  process.env.ROOT_LOCATION_ID ?? "PUT-YOUR-ROOT-UUID-HERE"; // ← 建議用 .env

if (!UUID_RE.test(ROOT_LOCATION_ID)) {
  // 讓錯誤在啟動時就暴露
  throw new Error(
    `Invalid ROOT_LOCATION_ID: "${ROOT_LOCATION_ID}". Please set a valid UUID in .env`
  );
}
