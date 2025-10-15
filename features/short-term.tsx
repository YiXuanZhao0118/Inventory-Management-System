//features\short-term.tsx
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
  iamsId?: string | null; // ← IAMS（後端若提供就顯示）
  borrowerId: string; // deviceId
  borrowerName?: string | null; // optional
  renter: string;
  loanDate: string;
  dueDate: string | null;
  product: { id: string; name: string; brand: string; model: string };
  location: { id: string; label: string; path?: string }; // 可顯示完整路徑
};

export type DeviceNameMap = Record<string, string>;

// ================== Utils ==================
function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

// 小工具：模板字串
function fmt(tpl: string, vars: Record<string, string | number>) {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    tpl
  );
}

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

function parseStockFromURL(): string {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  const candidates = ["stock", "s", "sid"];
  for (const k of candidates) {
    const v = url.searchParams.get(k);
    if (v) return v.trim().replace(/^stock:/i, "");
  }
  return "";
}

function cleanAllKnownStockParams() {
  const url = new URL(window.location.href);
  ["stock", "s", "sid"].forEach((p) => url.searchParams.delete(p));
  window.history.replaceState({}, "", url.toString());
}

// 依語系格式化剩餘/逾時
function formatRemain(ms: number, t: any) {
  const neg = ms < 0;
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  return neg
    ? fmt(t.status.overdueTpl || "Overdue {h}h {m}m", { h, m })
    : fmt(t.status.remainingTpl || "Remaining {h}h {m}m", { h, m });
}

// ================== Small UI atoms ==================
function SmallTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200">
      {children}
    </span>
  );
}

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
        {fmt(t.pagination.summaryTpl || "Per page {pageSize} · total {total}", {
          pageSize: PAGE_SIZE,
          total,
        })}
      </div>
      <div className="inline-flex items-center gap-2">
        <button
          className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
          onClick={onFirst}
          disabled={atFirst}
          aria-label={t.pagination.firstAria || "first page"}
          title="«"
        >
          «
        </button>
        <button
          className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
          onClick={onPrev}
          disabled={atFirst}
          aria-label={t.pagination.prevAria || "previous page"}
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
          aria-label={t.pagination.nextAria || "next page"}
          title="›"
        >
          ›
        </button>
        <button
          className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
          onClick={onLast}
          disabled={atLast}
          aria-label={t.pagination.lastAria || "last page"}
          title="»"
        >
          »
        </button>
      </div>
    </div>
  );
}

// ================== Component ==================
export type ShortTermProps = {
  active?: ActiveRentalDTO[];
  deviceNameMap?: DeviceNameMap;
  initialStockParam?: string;
};

export default function ShortTerm(props: ShortTermProps) {
  // i18n
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const dict = tMap[language] || zhTW;
  const t = dict?.ShortTerm || {};

  const [activeList, setActiveList] = React.useState<ActiveRentalDTO[]>(
    Array.isArray(props.active) ? props.active : []
  );
  const [devNameMap, setDevNameMap] = React.useState<DeviceNameMap>(
    props.deviceNameMap || {}
  );

  // 分頁（My Loans / All Active 各自一組）
  const [pageMine, setPageMine] = React.useState(1);
  const [pageAll, setPageAll] = React.useState(1);

  const [deviceId, setDeviceId] = React.useState<string>("");
  const [stockParam, setStockParam] = React.useState<string>(
    props.initialStockParam || ""
  );
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const now = useNow(1000);

  // ====== 首次解析網址參數 ======
  React.useEffect(() => {
    if (!props.initialStockParam) {
      const v = parseStockFromURL();
      if (v) setStockParam(v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== 初始化 deviceId ======
  React.useEffect(() => {
    setDeviceId(getOrCreateDeviceId());
  }, []);

  // ====== 載入清單（後端若有 iamsId/path 會一併回來） ======
  const refreshLists = React.useCallback(async () => {
    try {
      const a = await fetch(
        "/api/rentals/short-term/active?includeDeviceNames=1",
        { cache: "no-store" }
      );
      if (a.ok) {
        const aj = await a.json();
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
      }
    } catch {}
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

  // ====== 本人優先排序 ======
  const { myLoans, mineFirst } = React.useMemo(() => {
    const mine = (activeList || []).filter((r) => r.borrowerId === deviceId);
    const other = (activeList || []).filter((r) => r.borrowerId !== deviceId);
    const byDueAsc = (a: ActiveRentalDTO, b: ActiveRentalDTO) =>
      new Date(a.dueDate || a.loanDate).getTime() -
      new Date(b.dueDate || b.loanDate).getTime();
    mine.sort(byDueAsc);
    other.sort(byDueAsc);
    return { myLoans: mine, mineFirst: [...mine, ...other] };
  }, [activeList, deviceId]);

  // 切換清單時重設分頁
  React.useEffect(() => {
    setPageMine(1);
    setPageAll(1);
  }, [deviceId, activeList.length]);

  // 計算分頁資料
  const mineTotal = myLoans.length;
  const minePageCount = Math.max(1, Math.ceil(mineTotal / PAGE_SIZE));
  const mineStart = (pageMine - 1) * PAGE_SIZE;
  const myLoansPaged = myLoans.slice(mineStart, mineStart + PAGE_SIZE);

  const allTotal = mineFirst.length;
  const allPageCount = Math.max(1, Math.ceil(allTotal / PAGE_SIZE));
  const allStart = (pageAll - 1) * PAGE_SIZE;
  const allPaged = mineFirst.slice(allStart, allStart + PAGE_SIZE);

  // ====== 自動借用（掃 QR 啟動） ======
  const autoBorrowedRef = React.useRef(false);
  React.useEffect(() => {
    if (autoBorrowedRef.current) return;
    if (!stockParam || !deviceId || busy) return;

    autoBorrowedRef.current = true;
    (async () => {
      setBusy(true);
      setMessage(null);
      try {
        // 1) 驗證裝置是否存在於資料庫
        const v = await fetch(
          `/api/devices/verify?deviceId=${encodeURIComponent(deviceId)}`,
          { cache: "no-store" }
        );
        const vj = await v.json().catch(() => ({}));
        if (!v.ok || !vj?.exists) {
          const next = encodeURIComponent(window.location.href);
          window.location.href = `/device-registration?deviceId=${encodeURIComponent(
            deviceId
          )}&next=${next}`;
          return;
        }

        // 2) 借用
        const res = await fetch("/api/rentals/short-term/borrow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stockId: stockParam,
            borrowerDeviceId: deviceId,
          }),
        });
        const json = await res.json().catch(() => ({} as any));
        if (!res.ok || !json?.success)
          throw new Error(json?.error || `HTTP ${res.status}`);

        const dueStr = json?.data?.dueDate
          ? new Date(json.data.dueDate).toLocaleString()
          : "";
        setMessage({
          kind: "ok",
          text: dueStr
            ? fmt(t.msg.borrowSuccessDueTpl || "Borrow success. Due at {due}.", {
                due: dueStr,
              })
            : t.msg.borrowSuccess || "Borrow success.",
        });
        cleanAllKnownStockParams();
        setStockParam("");
        await refreshLists();
      } catch (e: any) {
        setMessage({
          kind: "err",
          text:
            (t.msg.borrowFailedPrefix || "Borrow failed: ") +
            (e?.message || String(e)),
        });
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockParam, deviceId]);

  // ====== Actions ======
  async function onExtend(r: ActiveRentalDTO) {
    if (busy) return;
    if (r.borrowerId !== deviceId) {
      setMessage({ kind: "err", text: t.msg.notYours || "Not your loan." });
      return;
    }
    // 逾時不可延長（前端也擋一下）
    const due = r.dueDate ? new Date(r.dueDate) : null;
    if (due && due.getTime() < Date.now()) {
      setMessage({
        kind: "err",
        text:
          t.msg.overdueNoExtend ||
          "Overdue items cannot be extended. Please return and borrow again.",
      });
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/rentals/short-term/extend", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": deviceId || "",
        },
        body: JSON.stringify({ rentedItemId: r.id, addHours: 3 }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.success)
        throw new Error(json?.error || `HTTP ${res.status}`);
      const dueText = json?.data?.dueDate
        ? new Date(json.data.dueDate).toLocaleString()
        : "";
      setMessage({
        kind: "ok",
        text: fmt(t.msg.extendSuccessTpl || "Extended. New due {due}.", {
          due: dueText,
        }),
      });
      await refreshLists();
    } catch (e: any) {
      setMessage({
        kind: "err",
        text:
          (t.msg.extendFailedPrefix || "Extend failed: ") +
          (e?.message || String(e)),
      });
    } finally {
      setBusy(false);
    }
  }

  async function onReturn(r: ActiveRentalDTO) {
    if (busy) return;
    if (r.borrowerId !== deviceId) {
      setMessage({ kind: "err", text: t.msg.notYours || "Not your loan." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/rentals/short-term/return", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Id": deviceId || "",
        },
        body: JSON.stringify({
          rentedItemId: r.id,
          returnDate: new Date().toISOString(),
        }),
      });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok || !json?.success)
        throw new Error(json?.error || `HTTP ${res.status}`);
      setMessage({ kind: "ok", text: t.msg.returned || "Returned." });
      await refreshLists();
    } catch (e: any) {
      setMessage({
        kind: "err",
        text:
          (t.msg.returnFailedPrefix || "Return failed: ") +
          (e?.message || String(e)),
      });
    } finally {
      setBusy(false);
    }
  }

  // ================== Render ==================
  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
        <Timer className="h-7 w-7" aria-hidden="true" />
        <span>{t.title}</span>
      </h1>

      {message && (
        <div className="min-w-[280px]">
          {message.kind === "ok" ? (
            <SuccessBox>{message.text}</SuccessBox>
          ) : (
            <ErrorBox>{message.text}</ErrorBox>
          )}
        </div>
      )}

      {/* My Loans */}
      <section>
        <SectionTitle>{t.section.myLoans || "My Loans"}</SectionTitle>
        <div className="space-y-3">
          {myLoansPaged.length === 0 ? (
            <Info>{t.empty.myLoans || "You have no active short-term loans."}</Info>
          ) : (
            myLoansPaged.map((r) => {
              const due = r.dueDate ? new Date(r.dueDate) : null;
              const left = due ? due.getTime() - now.getTime() : 0;
              const overdue = !!(due && left < 0);
              const borrowerName = deviceNameLabel(r.borrowerId, devNameMap);

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
                      <p className="truncate">
                        <span className="font-medium">
                          {t.fields.location || "Location"}:
                        </span>{" "}
                        {r.location?.path || r.location?.label || "—"}
                      </p>
                      <p className="truncate">
                        <span className="font-medium">
                          {t.fields.due || "Due"}:
                        </span>{" "}
                        {due ? due.toLocaleString() : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="truncate">
                        <span className="font-medium">
                          {t.fields.borrower || "Borrower"}:
                        </span>{" "}
                        {borrowerName}{" "}
                        <span className="text-xs text-indigo-600 dark:text-indigo-300">
                          {t.tags.you || "(you)"}
                        </span>
                      </p>
                      <p className="truncate">
                        <span className="font-medium">
                          {t.fields.status || "Status"}:
                        </span>{" "}
                        {due ? (
                          <span
                            className={
                              overdue
                                ? "rounded-md bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900 dark:text-red-100"
                                : "rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900 dark:text-emerald-100"
                            }
                          >
                            {formatRemain(left, t)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </p>
                      {overdue && (
                        <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">
                          {t.msg.overdueNoExtend ||
                            "Overdue items cannot be extended. Please return and borrow again."}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionBtn
                      disabled={
                        busy || (due ? due.getTime() < Date.now() : false)
                      }
                      onClick={() => onExtend(r)}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 focus:ring-indigo-500"
                      title={
                        due && due.getTime() < Date.now()
                          ? t.tooltips.noExtend || "Overdue items cannot be extended"
                          : t.tooltips.extend3h || "Extend +3 hours"
                      }
                    >
                      {t.buttons.extend3h || "+3h"}
                    </ActionBtn>
                    <ActionBtn
                      disabled={busy}
                      onClick={() => onReturn(r)}
                      className="bg-rose-600 hover:bg-rose-700 disabled:opacity-60 focus:ring-rose-500"
                      title={t.buttons.return || "Return"}
                    >
                      {t.buttons.return || "Return"}
                    </ActionBtn>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <PaginationBar
          total={mineTotal}
          page={pageMine}
          pageCount={minePageCount}
          onFirst={() => setPageMine(1)}
          onPrev={() => setPageMine((p) => Math.max(1, p - 1))}
          onNext={() => setPageMine((p) => Math.min(minePageCount, p + 1))}
          onLast={() => setPageMine(minePageCount)}
          t={t}
        />
      </section>

      {/* All Active Records */}
      <section>
        <SectionTitle>
          {t.section.allActive || "All Active Records"}
        </SectionTitle>
        <div className="space-y-3">
          {allPaged.length === 0 ? (
            <Info>{t.empty.allActive || "No active records."}</Info>
          ) : (
            allPaged.map((r) => {
              const due = r.dueDate ? new Date(r.dueDate) : null;
              const mine = r.borrowerId === deviceId;
              return (
                <Card key={r.id}>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div>
                      <p className="font-medium">{r.product.name}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {r.product.brand} · {r.product.model}
                      </p>
                      {r.iamsId ? (
                        <p className="text-xs text-gray-500">IAMS: {r.iamsId}</p>
                      ) : null}
                    </div>
                    <div>
                      <FieldRow
                        label={t.fields.location || "Location"}
                        value={r.location.path || r.location.label}
                      />
                      <FieldRow
                        label={t.fields.due || "Due"}
                        value={due ? due.toLocaleString() : "—"}
                      />
                    </div>
                    <div>
                      <FieldRow
                        label={t.fields.borrower || "Borrower"}
                        value={deviceNameLabel(r.borrowerId, devNameMap)}
                      />
                      {mine && (
                        <p className="text-xs text-indigo-600 dark:text-indigo-300">
                          {t.tags.thisIsYou || "(this is you)"}
                        </p>
                      )}
                    </div>
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
          t={t}
        />
      </section>
    </div>
  );
}
