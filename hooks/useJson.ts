// hooks/useJson.ts
import * as React from "react";

/**
 * 超輕量 JSON 讀取 Hook：支援 AbortController、loading / error / refetch
 * @param key URL 字串；給 null/空字串時會跳過請求
 * @param init 可選的 fetch options（headers 等）
 */
export function useJson<T = any>(key: string | null, init?: RequestInit) {
  const [data, setData] = React.useState<T | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // 為了支援手動重抓
  const initRef = React.useRef(init);
  initRef.current = init;

  const fetchOnce = React.useCallback(async (signal?: AbortSignal) => {
    if (!key) {
      setData(undefined);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(key, { ...(initRef.current || {}), signal });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}${txt ? `: ${txt}` : ""}`);
      }
      const json = (await res.json()) as T;
      setData(json);
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [key]);

  // 自動載入（key 變就重抓）
  React.useEffect(() => {
    const ac = new AbortController();
    fetchOnce(ac.signal);
    return () => ac.abort();
  }, [fetchOnce]);

  // 手動重抓
  const refetch = React.useCallback(() => {
    const ac = new AbortController();
    fetchOnce(ac.signal);
    return () => ac.abort();
  }, [fetchOnce]);

  return { data, loading, error, refetch, setData };
}
