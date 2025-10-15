// features/short-term-admin.tsx
"use client";
import { Timer } from "lucide-react";
import React from "react";

// i18n
import { useLanguage } from "@/src/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

// ================== Types ==================
export type ActiveRentalDTO = {
  id: string;
  stockId: string;
  iamsId?: string | null;
  borrowerId: string; // deviceId
  borrowerName?: string | null;
  renter: string;
  loanDate: string;
  dueDate: string | null;
  product: { id: string; name: string; brand: string; model: string };
  location: { id: string; label: string; path?: string };
};

export type DeviceNameMap = Record<string, string>;

// ================== Utils ==================
function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}
function fmt(tpl: string, vars: Record<string, string | number>) {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    tpl
  );
}
function useNow(tickMs = 1000) {
  const [now, setNow] = React.useState<Date>(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}
function deviceNameLabel(id: string, map: DeviceNameMap): string {
  return map?.[id] || id;
}
function firstArray<T>(...xs: any[]): T[] {
  for (const x of xs) if (Array.isArray(x)) return x as T[];
  return [] as T[];
}

// === deviceId cookie 工具 ===
function deviceIdFromCookies(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)deviceId=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
function setDeviceIdCookie(id: string) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toUTCString();
  const attrs = [`expires=${expires}`, "path=/", "SameSite=Lax"];
  if (location.protocol === "https:") attrs.push("Secure");
  document.cookie = `deviceId=${encodeURIComponent(id)}; ${attrs.join("; ")}`;
}
function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id =
    deviceIdFromCookies() ||
    window.localStorage.getItem("deviceId") ||
    (globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(16).slice(2)}`);
  setDeviceIdCookie(id);
  try {
    window.localStorage.setItem("deviceId", id);
  } catch {}
  return id;
}

// 依語系格式化剩餘/逾時
function formatRemain(ms: number, t: any) {
  const neg = ms < 0;
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  return neg
    ? fmt(t.status?.overdueTpl || "Overdue {h}h {m}m", { h, m })
    : fmt(t.status?.remainingTpl || "Remaining {h}h {m}m", { h, m });
}

// ================== Small UI atoms ==================
function ActionBtn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  return (
    <button
      {...rest}
      className={cx(
        "rounded-md px-3 py-1 text-sm font-medium text-white shadow focus:outline-none focus:ring-2 focus:ring-offset-2",
        className || ""
      )}
    />
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-2xl font-semibold text-gray-800 dark:text-gray-100">
      {children}
    </h2>
  );
}
function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <p className="truncate">
      <span className="font-medium">{label}:</span> {value}
    </p>
  );
}
function Info({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-gray-600 dark:text-gray-300">{children}</div>
  );
}
function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900 dark:text-red-100">
      {children}
    </div>
  );
}
function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-700 dark:bg-green-900 dark:text-green-100">
      {children}
    </div>
  );
}
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {children}
    </div>
  );
}

// ================== Pagination ==================
const PAGE_SIZE = 20;
function PaginationBar({
  total,
  page,
  pageCount,
  onFirst,
  onPrev,
  onNext,
  onLast,
  t,
}: {
  total: number;
  page: number;
  pageCount: number;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  t: any;
}) {
  const atFirst = page <= 1;
  const atLast = page >= pageCount;
  return (
    <div className="mt-4 flex items-center justify-between">
      <div className="text-sm text-gray-600 dark:text-gray-300">
        {fmt(t.pagination?.summaryTpl || "Per page {pageSize} · total {total}", {
          pageSize: PAGE_SIZE,
          total,
        })}
      </div>
      <div className="inline-flex items-center gap-2">
        <button
          className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
          onClick={onFirst}
          disabled={atFirst}
          aria-label={t.pagination?.firstAria || "first page"}
          title="«"
        >
          «
        </button>
        <button
          className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
          onClick={onPrev}
          disabled={atFirst}
          aria-label={t.pagination?.prevAria || "previous page"}
          title="‹"
        >
          ‹
        </button>
        <span className="text-sm tabular-nums">
          {page} / {pageCount}
        </span>
        <button
          className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
          onClick={onNext}
          disabled={atLast}
          aria-label={t.pagination?.nextAria || "next page"}
          title="›"
        >
          ›
        </button>
        <button
          className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
          onClick={onLast}
          disabled={atLast}
          aria-label={t.pagination?.lastAria || "last page"}
          title="»"
        >
          »
        </button>
      </div>
    </div>
  );
}

// ================== Component ==================
export type ShortTermAdminProps = {
  active?: ActiveRentalDTO[];
  deviceNameMap?: DeviceNameMap;
};

export default function ShortTermAdmin(props: ShortTermAdminProps) {
  // i18n
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    "de-DE": deDE,
    hi: hiIN,
    de: deDE,
  };
  const dict = tMap[language] || zhTW;

  // 共用短借欄位/狀態/分頁字串（此頁也會用）
  const tShort = dict?.ShortTerm || {};
  // Admin 專用字串
  const tAdmin =
    dict?.ShortTermAdmin || {
      title: "Short-term Admin Return",
      section: { allActive: "All Active Records" },
      buttons: { refresh: "Refresh", return: "Return" },
      msg: {
        confirmReturn: "Return this item now?",
        returned: "Returned.",
        returnFailedPrefix: "Return failed: ",
      },
      empty: { allActive: "No active records." },
    };

  const [deviceId, setDeviceId] = React.useState<string>("");
  const [activeList, setActiveList] = React.useState<ActiveRentalDTO[]>(
    Array.isArray(props.active) ? props.active : []
  );
  const [devNameMap, setDevNameMap] = React.useState<DeviceNameMap>(
    props.deviceNameMap || {}
  );
  const [pageAll, setPageAll] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const now = useNow(1000);

  // 掛載時確保 deviceId 存在
  React.useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);
  }, []);

  // 載入清單
  const refreshLists = React.useCallback(async () => {
    try {
      const a = await fetch(
        "/api/rentals/short-term/active?includeDeviceNames=1",
        { cache: "no-store", credentials: "include" }
      );
      if (a.ok) {
        const aj = await a.json().catch(() => ({}));
        const act = firstArray<ActiveRentalDTO>(
          aj?.data?.active,
          aj?.active,
          aj?.items
        );
        const map =
          aj?.data?.deviceNameMap ||
          aj?.deviceNameMap ||
          aj?.data?.deviceNames ||
          aj?.deviceNames ||
          {};
        if (Array.isArray(act)) setActiveList(act);
        if (map && typeof map === "object") setDevNameMap(map);
      } else {
        const txt = await a.text().catch(() => "");
        setMessage({
          kind: "err",
          text: `${a.status} ${a.statusText}${txt ? `: ${txt}` : ""}`,
        });
      }
    } catch (e: any) {
      setMessage({ kind: "err", text: e?.message || String(e) });
    }
  }, []);

  React.useEffect(() => {
    refreshLists();
  }, [refreshLists]);

  React.useEffect(() => {
    if (message?.kind === "ok") {
      const id = setTimeout(() => setMessage(null), 1000);
      return () => clearTimeout(id);
    }
  }, [message]);

  // 排序 & 分頁
  const allSorted = React.useMemo(() => {
    const copy = [...(activeList || [])];
    copy.sort((a, b) => {
      const da = new Date(a.dueDate || a.loanDate).getTime();
      const db = new Date(b.dueDate || b.loanDate).getTime();
      return da - db;
    });
    return copy;
  }, [activeList]);
  const allTotal = allSorted.length;
  const allPageCount = Math.max(1, Math.ceil(allTotal / PAGE_SIZE));
  const allStart = (pageAll - 1) * PAGE_SIZE;
  const allPaged = allSorted.slice(allStart, allStart + PAGE_SIZE);

  // 僅提供「歸還」
  async function onReturn(r: ActiveRentalDTO) {
    if (busy) return;
    if (!confirm(tAdmin.msg?.confirmReturn || "Return this item now?")) return;

    setBusy(true);
    setMessage(null);
    try {
      const ensured = deviceId || getOrCreateDeviceId();
      const res = await fetch("/api/rentals/short-term/return", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": ensured,
          "X-Admin-Action": "return-any",
        },
        body: JSON.stringify({
          rentedItemId: r.id,
          returnDate: new Date().toISOString(),
        }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.success)
        throw new Error(json?.error || `HTTP ${res.status}`);

      setMessage({ kind: "ok", text: tAdmin.msg?.returned || "Returned." });
      await refreshLists();
    } catch (e: any) {
      setMessage({
        kind: "err",
        text:
          (tAdmin.msg?.returnFailedPrefix || "Return failed: ") +
          (e?.message || String(e)),
      });
    } finally {
      setBusy(false);
    }
  }

  // ================== Render ==================
  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-white flex items-center gap-2">
          <Timer className="h-7 w-7" aria-hidden="true" />
          <span>{tAdmin.title || "Short-term Admin Return"}</span>
        </h1>
        <button
          onClick={() => refreshLists()}
          disabled={busy}
          className="px-3 py-1 rounded-md bg-gray-200 dark:bg-gray-700 text-sm disabled:opacity-60"
          title={tAdmin.buttons?.refresh || "Refresh"}
        >
          {tAdmin.buttons?.refresh || "Refresh"}
        </button>
      </div>

      {message && (
        <div className="min-w-[280px]">
          {message.kind === "ok" ? (
            <SuccessBox>{message.text}</SuccessBox>
          ) : (
            <ErrorBox>{message.text}</ErrorBox>
          )}
        </div>
      )}

      {/* All Active Records (Admin can return ANY) */}
      <section>
        <SectionTitle>
          {tAdmin.section?.allActive || "All Active Records"}
        </SectionTitle>
        <div className="space-y-3">
          {allPaged.length === 0 ? (
            <Info>{tAdmin.empty?.allActive || "No active records."}</Info>
          ) : (
            allPaged.map((r) => {
              const due = r.dueDate ? new Date(r.dueDate) : null;
              const left = due ? due.getTime() - now.getTime() : 0;
              const overdue = !!(due && left < 0);

              return (
                <Card key={r.id}>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div>
                      <p className="font-medium">{r.product?.name ?? "—"}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {r.product?.brand ?? "—"} · {r.product?.model ?? "—"}
                      </p>
                      {r.iamsId ? (
                        <p className="text-xs text-gray-500">IAMS: {r.iamsId}</p>
                      ) : null}
                    </div>
                    <div>
                      <FieldRow
                        label={tShort.fields?.location || "Location"}
                        value={r.location?.path || r.location?.label || "—"}
                      />
                      <FieldRow
                        label={tShort.fields?.due || "Due"}
                        value={due ? due.toLocaleString() : "—"}
                      />
                    </div>
                    <div>
                      <FieldRow
                        label={tShort.fields?.borrower || "Borrower"}
                        value={deviceNameLabel(r.borrowerId, devNameMap)}
                      />
                      <p className="truncate">
                        <span className="font-medium">
                          {tShort.fields?.status || "Status"}:
                        </span>{" "}
                        {due ? (
                          <span
                            className={
                              overdue
                                ? "rounded-md bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900 dark:text-red-100"
                                : "rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900 dark:text-emerald-100"
                            }
                          >
                            {formatRemain(left, tShort)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionBtn
                      disabled={busy}
                      onClick={() => onReturn(r)}
                      className="bg-rose-600 hover:bg-rose-700 disabled:opacity-60 focus:ring-rose-500"
                      title={tAdmin.buttons?.return || "Return"}
                    >
                      {tAdmin.buttons?.return || "Return"}
                    </ActionBtn>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <PaginationBar
          total={allTotal}
          page={pageAll}
          pageCount={allPageCount}
          onFirst={() => setPageAll(1)}
          onPrev={() => setPageAll((p) => Math.max(1, p - 1))}
          onNext={() => setPageAll((p) => Math.min(allPageCount, p + 1))}
          onLast={() => setPageAll(allPageCount)}
          t={tShort}
        />
      </section>
    </div>
  );
}
