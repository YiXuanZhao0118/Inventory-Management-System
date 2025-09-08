// src/services/apiClient.ts
export class HttpError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data?: unknown
  ) {
    super(`HTTP ${status} ${statusText}`);
  }
}

/** 通用 fetcher：預設回傳 JSON，錯誤時丟出 HttpError */
export async function fetcher<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, {
    // 這裡可統一帶上 credential、header…依需求調整
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
    ...init,
  });

  // 成功 → 盡量解析 JSON；不是 JSON 就回傳 null/undefined
  if (res.ok) {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return (await res.json()) as T;
    // 沒有 JSON 的回應（例如 204 No Content）
    return undefined as unknown as T;
  }

  // 失敗 → 嘗試解析錯誤內容
  let data: unknown;
  try { data = await res.json(); } catch { data = await res.text(); }
  throw new HttpError(res.status, res.statusText, data);
}

/** 常用方法糖衣 */
export const api = {
  get: <T>(url: string, init?: RequestInit) => fetcher<T>(url, init),
  post: <TReq, TRes>(url: string, body: TReq, init?: RequestInit) =>
    fetcher<TRes>(url, {
      method: 'POST',
      body: JSON.stringify(body),
      ...init,
    }),
  put: <TReq, TRes>(url: string, body: TReq, init?: RequestInit) =>
    fetcher<TRes>(url, {
      method: 'PUT',
      body: JSON.stringify(body),
      ...init,
    }),
  del:  <T>(url: string, init?: RequestInit) =>
    fetcher<T>(url, { method: 'DELETE', ...init }),
};
