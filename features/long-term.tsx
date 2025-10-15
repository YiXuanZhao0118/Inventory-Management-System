// features/long-term.tsx
"use client";
import { Clock } from "lucide-react";
import React from "react";
import { Archive, Package } from "lucide-react";
import { useLanguage } from "@/src/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

/* ====================== 共用小工具 ====================== */
const fetcher = async <T,>(url: string, init?: RequestInit) => {
  const r = await fetch(url, init);
  let j: any = null;
  try {
    j = await r.json();
  } catch {}
  if (!r.ok) throw new Error(j?.message || `${r.status} ${r.statusText}`);
  return j as T;
};

const qs = (o: Record<string, any>) =>
  "?" +
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
    )
    .join("&");

function useDebounced<T>(value: T, delay = 300) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

const PAGE_SIZE = 10;

const isOverdue = (iso?: string | null) => {
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(+d)) return false;
  const today = new Date();
  const dueUTC = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const nowUTC = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  return dueUTC < nowUTC;
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(+d)) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

/* ====================== 型別（寬鬆相容） ====================== */
// 借出用庫存（PM：個別；Non-PM：彙總）
type PMInvItem = {
  stockId: string;
  product: { id: string; name: string; brand: string; model: string };
  iamsId?: string | null;
  iamsID?: string | null;
  iams?: string | null;
  locationPath?: string[];
};
type NonPMInvItem = {
  product: { id: string; name: string; brand: string; model: string };
  locationId: string;
  locationPath?: string[];
  quantity: number;
};

// 未歸還（開放中）
type OpenPMRental = {
  stockId: string;
  borrower: string;
  renter?: string | null;
  loanDate?: string;
  dueDate?: string | null;
  product: { id: string; name: string; brand: string; model: string };
  iamsId?: string | null;
  iamsID?: string | null;
  iams?: string | null;
  locationPath?: string[];
};

type OpenNonPMRental = {
  groupId: string;
  product: { id: string; name: string; brand: string; model: string };
  locationId: string;
  locationPath?: string[];
  borrower: string;
  renter?: string | null;
  loanDate?: string;
  dueDate?: string | null; // earliest due
  quantity: number; // outstanding
};

// 分頁回傳
type Paged<T> = {
  items: T[];
  page?: { page: number; pageSize: number; total: number; totalPages: number };
};

/* ====================== i18n helper ====================== */
function useT() {
  const { language } = useLanguage();
  const dictMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const dict = dictMap[language] || zhTW;
  return dict.LongTermPage as Record<string, string>;
}

/* ====================== 共用：簡易 Modal ====================== */
function ConfirmModal({
  open,
  title,
  children,
  onCancel,
  onConfirm,
  confirmText,
  cancelText,
  busy = false,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  confirmText: string;
  cancelText: string;
  busy?: boolean;
}) {
  const t = useT();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onCancel}
        aria-hidden
      />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-[min(960px,95vw)] max-h-[85vh] overflow-hidden">
        <div className="px-5 py-4 border-b dark:border-gray-800 flex items-center justify-between">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button
            className="px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            onClick={onCancel}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-5 overflow-auto">{children}</div>
        <div className="px-5 py-4 border-t dark:border-gray-800 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded border dark:border-gray-700"
            disabled={busy}
          >
            {cancelText || t.cancel}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-60"
            disabled={busy}
          >
            {busy ? t.processing : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Root：借出 / 歸還
========================================================= */
export default function LongTermPage() {
  const t = useT();
  const [tab, setTab] = React.useState<"loan" | "return">("loan");

  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
        <Clock className="h-7 w-7" aria-hidden="true" />
        <span>{t.title}</span>
      </h1>

      <div className="inline-flex rounded-lg bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <button
          className={
            "px-4 py-2 text-sm font-medium " +
            (tab === "loan"
              ? "bg-indigo-600 text-white"
              : "text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600")
          }
          onClick={() => setTab("loan")}
        >
          {t.loanTab}
        </button>
        <button
          className={
            "px-4 py-2 text-sm font-medium " +
            (tab === "return"
              ? "bg-indigo-600 text-white"
              : "text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600")
          }
          onClick={() => setTab("return")}
        >
          {t.returnTab}
        </button>
      </div>

      {tab === "loan" ? <LoanPanel /> : <ReturnPanel />}
    </div>
  );
}

/* =========================================================
   借出 Loan：清單（PM/Non-PM） → 選擇區 → 確認清單 → 送出
========================================================= */
function LoanPanel() {
  const t = useT();

  // 必填：借用人 / 經手人 / 截止日
  const [borrower, setBorrower] = React.useState("");
  const [renter, setRenter] = React.useState("");
  const [dueDate, setDueDate] = React.useState<string>("");

  // 確認清單 Modal
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  // ====== PM 清單 ======
  const [qPM, setQPM] = React.useState("");
  const dqPM = useDebounced(qPM, 300);
  const [pagePM, setPagePM] = React.useState(1);
  const [pmData, setPmData] = React.useState<Paged<PMInvItem>>();
  const [pmLoading, setPmLoading] = React.useState(false);

  React.useEffect(() => setPagePM(1), [dqPM]);
  const pmKey = React.useMemo(
    () =>
      `/api/inventory/pm${qs({
        status: "in_stock",
        q: dqPM,
        page: pagePM,
        limit: PAGE_SIZE,
      })}`,
    [dqPM, pagePM]
  );

  React.useEffect(() => {
    const ac = new AbortController();
    setPmLoading(true);
    fetcher<Paged<PMInvItem>>(pmKey, { signal: ac.signal })
      .then(setPmData)
      .catch(() =>
        setPmData({
          items: [],
          page: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 },
        })
      )
      .finally(() => setPmLoading(false));
    return () => ac.abort();
  }, [pmKey]);

  // ====== Non-PM 清單 ======
  const [qNP, setQNP] = React.useState("");
  const dqNP = useDebounced(qNP, 300);
  const [pageNP, setPageNP] = React.useState(1);
  const [npData, setNpData] = React.useState<Paged<NonPMInvItem>>();
  const [npLoading, setNpLoading] = React.useState(false);

  React.useEffect(() => setPageNP(1), [dqNP]);
  const npKey = React.useMemo(
    () =>
      `/api/inventory/nonpm${qs({
        status: "in_stock",
        q: dqNP,
        page: pageNP,
        limit: PAGE_SIZE,
      })}`,
    [dqNP, pageNP]
  );

  React.useEffect(() => {
    const ac = new AbortController();
    setNpLoading(true);
    fetcher<Paged<NonPMInvItem>>(npKey, { signal: ac.signal })
      .then(setNpData)
      .catch(() =>
        setNpData({
          items: [],
          page: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 },
        })
      )
      .finally(() => setNpLoading(false));
    return () => ac.abort();
  }, [npKey]);

  /* ====== 選擇區（Drafts） ====== */
  type LoanDraft =
    | {
        kind: "pm";
        stockId: string;
        product: {
          id: string;
          name: string;
          brand: string;
          model: string;
          isPropertyManaged: true;
        };
        iams?: string | null;
        locationPath?: string[];
        quantity: 1;
      }
    | {
        kind: "non";
        productId: string;
        locationId: string;
        product: {
          id: string;
          name: string;
          brand: string;
          model: string;
          isPropertyManaged: false;
        };
        locationPath?: string[];
        quantity: number;
        cap: number;
      };

  const [drafts, setDrafts] = React.useState<LoanDraft[]>([]);

  const getRemainingCap = (pid: string, loc: string) => {
    const src = npData?.items.find(
      (x) => x.product.id === pid && x.locationId === loc
    );
    const base = src?.quantity ?? 0;
    const picked = drafts
      .filter(
        (d) => d.kind === "non" && d.productId === pid && d.locationId === loc
      )
      .reduce((a, b) => a + b.quantity, 0);
    return Math.max(0, base - picked);
  };

  const addPM = (row: PMInvItem) => {
    if (drafts.some((d) => d.kind === "pm" && d.stockId === row.stockId))
      return;
    const iams = row.iamsId ?? row.iamsID ?? row.iams ?? null;
    setDrafts((ds) => [
      ...ds,
      {
        kind: "pm",
        stockId: row.stockId,
        product: { ...row.product, isPropertyManaged: true },
        iams,
        locationPath: row.locationPath,
        quantity: 1,
      },
    ]);
  };

  const addNon = (g: NonPMInvItem) => {
    setDrafts((ds) => {
      // 先看看選單裡是否已經有同 product/location 的草稿
      const idx = ds.findIndex(
        (d) =>
          d.kind === "non" &&
          d.productId === g.product.id &&
          d.locationId === g.locationId
      );

      // 取得此群組基礎庫存（伺服器回傳）
      const base =
        npData?.items.find(
          (x) => x.product.id === g.product.id && x.locationId === g.locationId
        )?.quantity ?? 0;

      // 當前已在草稿中挑的數量（包含本 row）
      const picked = ds
        .filter(
          (d) =>
            d.kind === "non" &&
            d.productId === g.product.id &&
            d.locationId === g.locationId
        )
        .reduce((a, b) => a + (b as any).quantity, 0);

      // 目前還能拿的數量（不含本 row 的即將 +1）
      const remaining = Math.max(0, base - picked);

      if (idx >= 0) {
        // 已有此 row：用「可用上限 = base - (picked - curr.quantity)」來正確夾住
        const next = [...ds];
        const curr = next[idx] as Extract<LoanDraft, { kind: "non" }>;

        // 可用上限 = 原始庫存 base - (其他草稿已挑) = base - (picked - curr.quantity)
        const avail = Math.max(0, base - (picked - curr.quantity));
        const nextQty = Math.min(curr.quantity + 1, avail);
        const nextCap = Math.max(0, avail - nextQty); // 給 UI 增減鈕參考

        next[idx] = { ...curr, quantity: nextQty, cap: nextCap };
        return next;
      }

      // 還沒有此 row：若 remaining 為 0 就不加入；否則建立 quantity=1
      if (remaining <= 0) return ds;

      return [
        ...ds,
        {
          kind: "non",
          productId: g.product.id,
          locationId: g.locationId,
          product: { ...g.product, isPropertyManaged: false },
          locationPath: g.locationPath,
          quantity: 1,
          cap: Math.max(0, remaining - 1), // 建立時就扣掉自己拿的 1
        } as Extract<LoanDraft, { kind: "non" }>,
      ];
    });
  };

  const onDragStart = (e: React.DragEvent, payload: string) => {
    e.dataTransfer.setData("text/plain", payload);
  };
  const onDropToSelection = (e: React.DragEvent) => {
    e.preventDefault();
    const s = e.dataTransfer.getData("text/plain") || "";
    if (s.startsWith("pm::")) {
      const sid = s.slice(4);
      const row = pmData?.items.find((x) => x.stockId === sid);
      if (row) addPM(row);
    } else if (s.startsWith("non::")) {
      const [, pid, loc] = s.split("::");
      const row = npData?.items.find(
        (x) => x.product.id === pid && x.locationId === loc
      );
      if (row) addNon(row);
    }
  };

  const updateDraftQty = (i: number, nextQty: number) =>
    setDrafts((ds) =>
      ds.map((d, idx) => {
        if (idx !== i || d.kind !== "non") return d;
        const capNow = getRemainingCap(d.productId, d.locationId) + d.quantity;
        const n = Math.max(1, Math.min(capNow, Math.floor(nextQty || 1)));
        return { ...d, quantity: n, cap: Math.max(0, capNow - n) };
      })
    );

  const removeDraft = (i: number) =>
    setDrafts((ds) => ds.filter((_, idx) => idx !== i));
  const clearDrafts = () => setDrafts([]);

  const formOK =
    borrower.trim().length > 0 &&
    renter.trim().length > 0 &&
    dueDate.trim().length > 0;
  const [posting, setPosting] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const performLoan = async () => {
    if (!formOK || drafts.length === 0 || posting) return;
    setPosting(true);
    setMsg(null);

    try {
      const borrowerName = borrower.trim();
      const renterName = renter.trim();
      const isoDue = new Date(dueDate).toISOString();

      const pmDrafts = drafts.filter(
        (d): d is Extract<LoanDraft, { kind: "pm" }> => d.kind === "pm"
      );
      const nonDrafts = drafts.filter(
        (d): d is Extract<LoanDraft, { kind: "non" }> => d.kind === "non"
      );

      const PropertyManaged = pmDrafts.map((d) => ({
        stockId: d.stockId,
        borrower: borrowerName,
        renter: renterName,
        operator: renterName,
        dueDate: isoDue,
      }));

      const nonPropertyManaged = nonDrafts.map((d) => ({
        productId: d.productId,
        locationId: d.locationId,
        quantity: d.quantity,
        borrower: borrowerName,
        renter: renterName,
        operator: renterName,
        dueDate: isoDue,
      }));

      await fetcher("/api/rentals/long-term/loan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          borrower: borrowerName,
          renter: renterName,
          dueDate: isoDue,
          PropertyManaged,
          nonPropertyManaged,
        }),
      });

      setMsg(t.loanSuccess);
      clearDrafts();
      setBorrower("");
      setRenter("");
      setDueDate("");
      setPagePM(1);
      setPageNP(1);
    } catch (e: any) {
      setMsg(`${t.loanFailedPrefix}${e?.message || e}`);
    } finally {
      setPosting(false);
      setTimeout(() => setMsg(null), 2000);
      setConfirmOpen(false);
    }
  };

  const pmPage = pmData?.page?.page ?? 1;
  const pmTotalPages = pmData?.page?.totalPages ?? 1;
  const npPage = npData?.page?.page ?? 1;
  const npTotalPages = npData?.page?.totalPages ?? 1;

  const loanPM = drafts.filter(
    (d): d is Extract<LoanDraft, { kind: "pm" }> => d.kind === "pm"
  );
  const loanNon = drafts.filter(
    (d): d is Extract<LoanDraft, { kind: "non" }> => d.kind === "non"
  );
  const totalNonQty = loanNon.reduce((a, b) => a + b.quantity, 0);

  /* === 顯示用清單（像 Transfers.tsx：已選項目從來源隱藏 / Non-PM 顯示剩餘量） */
  type NonPMInvItemDisplay = NonPMInvItem & { remaining: number };

  // 已選 PM：用 stockId 過濾來源
  const selectedPM = React.useMemo(
    () =>
      new Set(
        drafts.filter((d) => d.kind === "pm").map((d) => (d as any).stockId)
      ),
    [drafts]
  );
  const pmDisplay = React.useMemo(
    () => (pmData?.items ?? []).filter((r) => !selectedPM.has(r.stockId)),
    [pmData?.items, selectedPM]
  );

  // Non-PM：剩餘 = 原數量 - 已選數量；剩 0 就不顯示
  const npDisplay = React.useMemo<NonPMInvItemDisplay[]>(
    () =>
      (npData?.items ?? [])
        .map((g) => ({
          ...g,
          remaining: getRemainingCap(g.product.id, g.locationId),
        }))
        .filter((g) => g.remaining > 0),
    [npData?.items, drafts]
  );

  return (
    <div className="space-y-6">
      {/* 兩欄清單：PM / Non-PM */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PM */}
        <div className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-indigo-600" />
              <h3 className="text-lg font-semibold">{t.pmSingleTitle}</h3>
            </div>
            <input
              className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700"
              placeholder={t.searchPMPlaceholder}
              value={qPM}
              onChange={(e) => setQPM(e.target.value)}
            />
          </div>

          <div className="grid gap-3 max-h-[420px] overflow-auto pr-1 relative">
            {pmLoading && (
              <div className="absolute right-1 -top-1 text-xs opacity-70">
                {t.loading}…
              </div>
            )}
            {pmDisplay.length === 0 && !pmLoading && (
              <div className="text-sm text-gray-500">{t.noMatches}</div>
            )}

            {pmDisplay.map((r) => {
              const iams = r.iamsId ?? r.iamsID ?? r.iams ?? null;
              return (
                <div
                  key={r.stockId}
                  draggable
                  onDragStart={(e) => onDragStart(e, `pm::${r.stockId}`)}
                  className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm transition flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {r.product?.name || "—"}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      <span className="text-red-600 dark:text-red-400">
                        {r.product?.model}
                      </span>
                      {" / "}
                      {r.product?.brand}
                      {iams ? (
                        <span className="ml-2 text-purple-600 dark:text-purple-400">
                          {iams}
                        </span>
                      ) : null}
                    </div>
                    {r.locationPath?.length ? (
                      <div className="text-xs text-gray-500">
                        {r.locationPath.join(" → ")}
                      </div>
                    ) : null}
                    <div className="text-[11px] text-gray-400">
                      {t.stockIdLabel}: {r.stockId}
                    </div>
                  </div>
                  <button
                    className="px-2 py-1 text-xs rounded bg-indigo-600 text-white disabled:opacity-60"
                    onClick={() => addPM(r)}
                  >
                    {t.add}
                  </button>
                </div>
              );
            })}
          </div>

          <Pager
            page={pmPage}
            totalPages={pmTotalPages}
            onFirst={() => setPagePM(1)}
            onPrev={() => setPagePM((p) => Math.max(1, p - 1))}
            onNext={() => setPagePM((p) => Math.min(pmTotalPages, p + 1))}
            onLast={() => setPagePM(pmTotalPages)}
            labelPerPage={t.perPageN.replace("{{n}}", String(PAGE_SIZE))}
            labelFirst={t.firstPage}
            labelPrev={t.prevPage}
            labelNext={t.nextPage}
            labelLast={t.lastPage}
          />
        </div>

        {/* Non-PM */}
        <div className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-600" />
              <h3 className="text-lg font-semibold">{t.nonPmAggTitle}</h3>
            </div>
            <input
              className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700"
              placeholder={t.searchNonPMPlaceholder}
              value={qNP}
              onChange={(e) => setQNP(e.target.value)}
            />
          </div>

          <div className="grid gap-3 max-h-[420px] overflow-auto pr-1 relative">
            {npLoading && (
              <div className="absolute right-1 -top-1 text-xs opacity-70">
                {t.loading}…
              </div>
            )}
            {npDisplay.length === 0 && !npLoading && (
              <div className="text-sm text-gray-500">{t.noMatches}</div>
            )}

            {npDisplay.map((g) => {
              const cap = g.remaining;
              return (
                <div
                  key={`${g.product.id}::${g.locationId}`}
                  draggable
                  onDragStart={(e) =>
                    onDragStart(e, `non::${g.product.id}::${g.locationId}`)
                  }
                  className="p-3 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 hover:shadow-sm transition flex items-start gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {g.product?.name || "—"}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      <span className="text-red-600 dark:text-red-400">
                        {g.product?.model}
                      </span>
                      {" / "}
                      {g.product?.brand}
                    </div>
                    {g.locationPath?.length ? (
                      <div className="text-xs text-gray-500">
                        {g.locationPath.join(" → ")}
                      </div>
                    ) : null}
                    <div className="text-xs text-gray-500">
                      {t.canBorrowLabel}：{cap}
                    </div>
                  </div>
                  <button
                    className="px-2 py-1 text-xs rounded bg-indigo-600 text-white disabled:opacity-60"
                    onClick={() => addNon(g)}
                    disabled={cap <= 0}
                  >
                    {t.add}
                  </button>
                </div>
              );
            })}
          </div>

          <Pager
            page={npPage}
            totalPages={npTotalPages}
            onFirst={() => setPageNP(1)}
            onPrev={() => setPageNP((p) => Math.max(1, p - 1))}
            onNext={() => setPageNP((p) => Math.min(npTotalPages, p + 1))}
            onLast={() => setPageNP(npTotalPages)}
            labelPerPage={t.perPageN.replace("{{n}}", String(PAGE_SIZE))}
            labelFirst={t.firstPage}
            labelPrev={t.prevPage}
            labelNext={t.nextPage}
            labelLast={t.lastPage}
          />
        </div>
      </section>

      {/* 選擇區 */}
      <section className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-4">
        <h3 className="font-semibold text-lg">🧺 {t.selectionTitleLoan}</h3>

        {/* 必填欄位 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            className="border rounded px-3 py-2 dark:bg-gray-800"
            placeholder={t.borrowerPH}
            value={borrower}
            onChange={(e) => setBorrower(e.target.value)}
          />
          <input
            className="border rounded px-3 py-2 dark:bg-gray-800"
            placeholder={t.renterPH}
            value={renter}
            onChange={(e) => setRenter(e.target.value)}
          />
          <input
            type="date"
            className="border rounded px-3 py-2 dark:bg-gray-800"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        {!(borrower.trim() && renter.trim() && dueDate.trim()) && (
          <div className="text-sm text-red-600">{t.formWarn}</div>
        )}

        <div
          className="min-h-[160px] p-4 rounded-lg border-2 border-dashed dark:border-gray-700 bg-white dark:bg-gray-800"
          onDrop={onDropToSelection}
          onDragOver={(e) => e.preventDefault()}
        >
          {drafts.length === 0 ? (
            <div className="text-center text-gray-500">{t.emptyList}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/40">
                  <tr>
                    <th className="px-3 py-2 text-left">{t.thProduct}</th>
                    <th className="px-3 py-2 text-left">{t.thModelBrand}</th>
                    <th className="px-3 py-2 text-left">{t.thType}</th>
                    <th className="px-3 py-2 text-left">{t.thLocation}</th>
                    <th className="px-3 py-2 text-left">{t.thQuantity}</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {drafts.map((d, i) => {
                    const rowKey =
                      d.kind === "pm"
                        ? `pm-${d.stockId}`
                        : `non-${d.productId}-${d.locationId}`;
                    return (
                      <tr key={`${rowKey}-${i}`}>
                        <td className="px-3 py-2">{d.product.name}</td>
                        <td className="px-3 py-2">
                          <span className="text-red-600 dark:text-red-400">
                            {d.product.model}
                          </span>
                          {" / "}
                          {d.product.brand}
                          {d.kind === "pm" && (d as any).iams ? (
                            <span className="ml-2 text-purple-600 dark:text-purple-400">
                              {(d as any).iams}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          {d.kind === "pm" ? t.typeProperty : t.typeNonProperty}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs">
                            {d.locationPath?.length
                              ? d.locationPath.join(" → ")
                              : "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {d.kind === "pm" ? (
                            <span>1</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                className="px-2 py-1 rounded border dark:border-gray-700"
                                onClick={() =>
                                  updateDraftQty(i, Math.max(1, d.quantity - 1))
                                }
                                aria-label="decrement"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                className="w-20 px-2 py-1 border rounded text-center dark:bg-gray-900 dark:border-gray-700"
                                min={1}
                                value={d.quantity}
                                onChange={(e) =>
                                  updateDraftQty(
                                    i,
                                    parseInt(e.target.value || "1", 10)
                                  )
                                }
                              />
                              <button
                                className="px-2 py-1 rounded border dark:border-gray-700"
                                onClick={() =>
                                  updateDraftQty(i, d.quantity + 1)
                                }
                                aria-label="increment"
                              >
                                ＋
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            className="text-red-500 hover:underline"
                            onClick={() => removeDraft(i)}
                          >
                            {t.remove}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            className="text-gray-500 hover:underline"
            onClick={clearDrafts}
          >
            {t.clear}
          </button>
          <button
            className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-60"
            onClick={() => {
              if (!formOK || drafts.length === 0) return;
              setConfirmOpen(true);
            }}
            disabled={!formOK || drafts.length === 0 || posting}
          >
            {posting ? t.postingLoan : t.submitLoan}
          </button>
        </div>

        {msg && (
          <div className="text-sm px-3 py-2 rounded bg-gray-100 dark:bg-gray-700 inline-block">
            {msg}
          </div>
        )}
      </section>

      {/* 借出：確認清單 Modal */}
      <ConfirmModal
        open={confirmOpen}
        title={t.confirmLoanTitle}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={performLoan}
        confirmText={t.confirmLoanButton}
        cancelText={t.cancel}
        busy={posting}
      >
        <div className="space-y-3">
          <div className="text-sm">
            <div>
              {t.borrowerLabel}：<b>{borrower}</b>
            </div>
            <div>
              {t.renterLabel}：<b>{renter}</b>
            </div>
            <div>
              {t.dueLabel}：<b>{dueDate || "—"}</b>
            </div>
          </div>

          {drafts.length === 0 ? (
            <div className="text-sm text-gray-500">{t.noSelectionYet}</div>
          ) : (
            <>
              {loanPM.length > 0 && (
                <div>
                  <div className="font-semibold mb-1">
                    {t.pmCountLabel
                      .replace("{{count}}", String(loanPM.length))
                      .replace("{{plural}}", loanPM.length > 1 ? "s" : "")}
                  </div>
                  <ul className="text-sm space-y-1">
                    {loanPM.map((d, i) => (
                      <li key={`c-pm-${d.stockId}-${i}`}>
                        • {d.product.name}（
                        <span className="text-red-600">{d.product.model}</span>/
                        {d.product.brand}){" "}
                        {d.iams ? (
                          <span className="text-purple-600 ml-1">{d.iams}</span>
                        ) : null}
                        {d.locationPath?.length ? (
                          <span className="ml-1 text-gray-500">
                            {t.atLabel} {d.locationPath.join(" → ")}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {loanNon.length > 0 && (
                <div>
                  <div className="font-semibold mb-1">
                    {t.nonPmTotalLabel.replace(
                      "{{count}}",
                      String(totalNonQty)
                    )}
                  </div>
                  <ul className="text-sm space-y-1">
                    {loanNon.map((d, i) => (
                      <li key={`c-non-${d.productId}-${d.locationId}-${i}`}>
                        • {d.product.name}（
                        <span className="text-red-600">{d.product.model}</span>/
                        {d.product.brand}) × <b>{d.quantity}</b>
                        {d.locationPath?.length ? (
                          <span className="ml-1 text-gray-500">
                            {t.atLabel} {d.locationPath.join(" → ")}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </ConfirmModal>
    </div>
  );
}

/* =========================================================
   歸還 Return：清單（PM/Non-PM） → 選擇區 → 確認清單 → 送出
========================================================= */
function ReturnPanel() {
  const t = useT();

  // ===== PM 開放中 =====
  const [qPM, setQPM] = React.useState("");
  const dqPM = useDebounced(qPM, 300);
  const [pagePM, setPagePM] = React.useState(1);
  const [pmData, setPmData] = React.useState<Paged<OpenPMRental>>();
  const [pmLoading, setPmLoading] = React.useState(false);

  React.useEffect(() => setPagePM(1), [dqPM]);
  const pmKey = React.useMemo(
    () =>
      `/api/rentals/long-term/open/pm${qs({
        q: dqPM,
        page: pagePM,
        limit: PAGE_SIZE,
      })}`,
    [dqPM, pagePM]
  );
  React.useEffect(() => {
    const ac = new AbortController();
    setPmLoading(true);
    fetcher<Paged<OpenPMRental>>(pmKey, { signal: ac.signal })
      .then(setPmData)
      .catch(() =>
        setPmData({
          items: [],
          page: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 },
        })
      )
      .finally(() => setPmLoading(false));
    return () => ac.abort();
  }, [pmKey]);

  // ===== Non-PM 開放中 =====
  const [qNP, setQNP] = React.useState("");
  const dqNP = useDebounced(qNP, 300);
  const [pageNP, setPageNP] = React.useState(1);
  const [npData, setNpData] = React.useState<Paged<OpenNonPMRental>>();
  const [npLoading, setNpLoading] = React.useState(false);

  React.useEffect(() => setPageNP(1), [dqNP]);
  const npKey = React.useMemo(
    () =>
      `/api/rentals/long-term/open/nonpm${qs({
        q: dqNP,
        page: pageNP,
        limit: PAGE_SIZE,
      })}`,
    [dqNP, pageNP]
  );

  React.useEffect(() => {
    const ac = new AbortController();
    setNpLoading(true);
    fetcher<Paged<OpenNonPMRental>>(npKey, { signal: ac.signal })
      .then(setNpData)
      .catch(() =>
        setNpData({
          items: [],
          page: { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 },
        })
      )
      .finally(() => setNpLoading(false));
    return () => ac.abort();
  }, [npKey]);

  // Drafts
  type ReturnDraft =
    | {
        kind: "pm";
        stockId: string;
        product: {
          id: string;
          name: string;
          brand: string;
          model: string;
          isPropertyManaged: true;
        };
        iams?: string | null;
        locationPath?: string[];
        borrower: string;
        renter: string;
        quantity: 1;
      }
    | {
        kind: "non";
        productId: string;
        locationId: string;
        product: {
          id: string;
          name: string;
          brand: string;
          model: string;
          isPropertyManaged: false;
        };
        locationPath?: string[];
        borrower: string;
        renter: string;
        quantity: number;
        cap: number;
      };

  const [drafts, setDrafts] = React.useState<ReturnDraft[]>([]);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const addPM = (r: OpenPMRental) => {
    if (drafts.some((d) => d.kind === "pm" && d.stockId === r.stockId)) return;
    const iams = r.iamsId ?? r.iamsID ?? r.iams ?? null;
    setDrafts((ds) => [
      ...ds,
      {
        kind: "pm",
        stockId: r.stockId,
        product: { ...r.product, isPropertyManaged: true },
        iams,
        locationPath: r.locationPath,
        borrower: r.borrower || "",
        renter: r.renter || "",
        quantity: 1,
      },
    ]);
  };

  const addNon = (g: OpenNonPMRental & { remaining?: number }) => {
    const keyMatch = (d: ReturnDraft) =>
      d.kind === "non" &&
      d.productId === g.product.id &&
      d.locationId === g.locationId &&
      d.borrower === (g.borrower || "") &&
      d.renter === (g.renter || "");
    setDrafts((ds) => {
      const idx = ds.findIndex(keyMatch);
      if (idx >= 0) {
        const copy = ds.slice();
        const curr = copy[idx] as Extract<ReturnDraft, { kind: "non" }>;
        if (curr.quantity >= curr.cap) return ds;
        copy[idx] = {
          ...curr,
          quantity: Math.min(curr.quantity + 1, curr.cap),
        };
        return copy;
      }
      const capInit =
        typeof g.remaining === "number" ? g.remaining : g.quantity ?? 1;
      return [
        ...ds,
        {
          kind: "non",
          productId: g.product.id,
          locationId: g.locationId,
          product: { ...g.product, isPropertyManaged: false },
          locationPath: g.locationPath,
          borrower: g.borrower || "",
          renter: g.renter || "",
          quantity: 1,
          cap: capInit,
        },
      ];
    });
  };

  const onDragStart = (e: React.DragEvent, payload: string) => {
    e.dataTransfer.setData("text/plain", payload);
  };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDropToSelection = (e: React.DragEvent) => {
    e.preventDefault();
    const s = e.dataTransfer.getData("text/plain") || "";
    if (s.startsWith("retpm::")) {
      const sid = s.slice(7);
      const row = pmData?.items.find((x) => x.stockId === sid);
      if (row) addPM(row);
    } else if (s.startsWith("retnon::")) {
      const gid = s.slice(8);
      const row = npData?.items.find((x) => x.groupId === gid);
      if (row) addNon(row);
    }
  };

  const updateDraftQty = (i: number, nextQty: number) =>
    setDrafts((ds) =>
      ds.map((d, idx) => {
        if (idx !== i || d.kind !== "non") return d;
        const n = Math.max(1, Math.min(d.cap, Math.floor(nextQty || 1)));
        return { ...d, quantity: n };
      })
    );
  const removeDraft = (i: number) =>
    setDrafts((ds) => ds.filter((_, idx) => idx !== i));
  const clearDrafts = () => setDrafts([]);

  const [posting, setPosting] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const performReturn = async () => {
    if (drafts.length === 0 || posting) return;
    setPosting(true);
    setMsg(null);
    try {
      const PropertyManaged = drafts
        .filter(
          (d): d is Extract<ReturnDraft, { kind: "pm" }> => d.kind === "pm"
        )
        .map((d) => ({ stockId: d.stockId }));

      const nonPropertyManaged = drafts
        .filter(
          (d): d is Extract<ReturnDraft, { kind: "non" }> => d.kind === "non"
        )
        .map((d) => ({
          productId: d.productId,
          locationId: d.locationId,
          borrower: d.borrower,
          renter: d.renter,
          quantity: d.quantity,
        }));

      await fetcher("/api/rentals/long-term/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ PropertyManaged, nonPropertyManaged }),
      });

      setMsg(t.returnSuccess);
      clearDrafts();
      setPagePM(1);
      setPageNP(1);
    } catch (e: any) {
      setMsg(`${t.returnFailedPrefix}${e?.message || e}`);
    } finally {
      setPosting(false);
      setTimeout(() => setMsg(null), 2000);
      setConfirmOpen(false);
    }
  };

  const pmPage = pmData?.page?.page ?? 1;
  const pmTotalPages = pmData?.page?.totalPages ?? 1;
  const npPage = npData?.page?.page ?? 1;
  const npTotalPages = npData?.page?.totalPages ?? 1;

  const retPM = drafts.filter(
    (d): d is Extract<ReturnDraft, { kind: "pm" }> => d.kind === "pm"
  );
  const retNon = drafts.filter(
    (d): d is Extract<ReturnDraft, { kind: "non" }> => d.kind === "non"
  );
  const retNonTotal = retNon.reduce((a, b) => a + b.quantity, 0);

  /* === 顯示用清單（像 Transfers.tsx：已選項目從來源隱藏 / Non-PM 顯示剩餘量） */
  type OpenNonPMDisplay = OpenNonPMRental & { remaining: number };

  // 已選 PM stockId
  const selectedRetPM = React.useMemo(
    () =>
      new Set(
        drafts.filter((d) => d.kind === "pm").map((d) => (d as any).stockId)
      ),
    [drafts]
  );
  const pmDisplay = React.useMemo(
    () => (pmData?.items ?? []).filter((r) => !selectedRetPM.has(r.stockId)),
    [pmData?.items, selectedRetPM]
  );

  // 計算某個 Non-PM group 的剩餘可還
  const remainingOf = React.useCallback(
    (g: OpenNonPMRental) => {
      const used = drafts
        .filter(
          (d) =>
            d.kind === "non" &&
            (d as any).productId === g.product.id &&
            (d as any).locationId === g.locationId &&
            (d as any).borrower === (g.borrower || "") &&
            (d as any).renter === (g.renter || "")
        )
        .reduce((a, b) => a + (b as any).quantity, 0);
      return Math.max(0, (g.quantity ?? 0) - used);
    },
    [drafts]
  );

  const npDisplay = React.useMemo<OpenNonPMDisplay[]>(
    () =>
      (npData?.items ?? [])
        .map((g) => ({ ...g, remaining: remainingOf(g) }))
        .filter((g) => g.remaining > 0),
    [npData?.items, remainingOf]
  );

  return (
    <div className="space-y-6">
      {/* 兩欄清單：PM / Non-PM（未歸還） */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PM 未歸還 */}
        <div className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-indigo-600" />
              <h3 className="text-lg font-semibold">{t.pmUnreturnedTitle}</h3>
            </div>
            <input
              className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700"
              placeholder={t.searchPMUnretPH}
              value={qPM}
              onChange={(e) => setQPM(e.target.value)}
            />
          </div>
          <div className="grid gap-3 max-h-[420px] overflow-auto pr-1 relative">
            {pmLoading && (
              <div className="absolute right-1 -top-1 text-xs opacity-70">
                {t.loading}…
              </div>
            )}
            {pmDisplay.length === 0 && !pmLoading && (
              <div className="text-sm text-gray-500">{t.noMatches}</div>
            )}
            {pmDisplay.map((r) => {
              const overdue = isOverdue(r.dueDate);
              const iams = r.iamsId ?? r.iamsID ?? r.iams ?? null;
              return (
                <div
                  key={r.stockId}
                  draggable
                  onDragStart={(e) => onDragStart(e, `retpm::${r.stockId}`)}
                  className={
                    "p-3 rounded-lg border hover:shadow-sm transition flex items-start gap-3 " +
                    (overdue
                      ? "border-red-300 bg-red-50 dark:border-red-500/60 dark:bg-red-900/20"
                      : "dark:border-gray-700 bg-white dark:bg-gray-800")
                  }
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {r.product?.name || "—"}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      <span className="text-red-600 dark:text-red-400">
                        {r.product?.model}
                      </span>
                      {" / "}
                      {r.product?.brand}
                      {iams ? (
                        <span className="ml-2 text-purple-600 dark:text-purple-400">
                          {iams}
                        </span>
                      ) : null}
                    </div>
                    {r.locationPath?.length ? (
                      <div className="text-xs text-gray-500">
                        {r.locationPath.join(" → ")}
                      </div>
                    ) : null}
                    <div
                      className={
                        "text-xs " +
                        (overdue ? "text-red-700" : "text-gray-500")
                      }
                    >
                      {t.dueLabel}：{fmtDate(r.dueDate)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t.borrowerLabel}：{r.borrower || "—"}；{t.renterLabel}：
                      {r.renter || "—"}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {t.stockIdLabel}: {r.stockId}
                    </div>
                  </div>
                  <button
                    className="px-2 py-1 text-xs rounded bg-indigo-600 text-white disabled:opacity-60"
                    onClick={() => addPM(r)}
                    disabled={drafts.some(
                      (d) => d.kind === "pm" && d.stockId === r.stockId
                    )}
                  >
                    {t.add}
                  </button>
                </div>
              );
            })}
          </div>
          <Pager
            page={pmPage}
            totalPages={pmTotalPages}
            onFirst={() => setPagePM(1)}
            onPrev={() => setPagePM((p) => Math.max(1, p - 1))}
            onNext={() => setPagePM((p) => Math.min(pmTotalPages, p + 1))}
            onLast={() => setPagePM(pmTotalPages)}
            labelPerPage={t.perPageN.replace("{{n}}", String(PAGE_SIZE))}
            labelFirst={t.firstPage}
            labelPrev={t.prevPage}
            labelNext={t.nextPage}
            labelLast={t.lastPage}
          />
        </div>

        {/* Non-PM 未歸還 */}
        <div className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-600" />
              <h3 className="text-lg font-semibold">
                {t.nonPmUnreturnedTitle}
              </h3>
            </div>
            <input
              className="px-2 py-1 border rounded dark:bg-gray-800 dark:border-gray-700"
              placeholder={t.searchNonPMUnretPH}
              value={qNP}
              onChange={(e) => setQNP(e.target.value)}
            />
          </div>
          <div className="grid gap-3 max-h-[420px] overflow-auto pr-1 relative">
            {npLoading && (
              <div className="absolute right-1 -top-1 text-xs opacity-70">
                {t.loading}…
              </div>
            )}
            {npDisplay.length === 0 && !npLoading && (
              <div className="text-sm text-gray-500">{t.noMatches}</div>
            )}
            {npDisplay.map((g) => {
              const overdue = isOverdue(g.dueDate);
              const payload = `retnon::${g.groupId}`;
              return (
                <div
                  key={g.groupId}
                  draggable
                  onDragStart={(e) => onDragStart(e, payload)}
                  className={
                    "p-3 rounded-lg border hover:shadow-sm transition flex items-start gap-3 " +
                    (overdue
                      ? "border-red-300 bg-red-50 dark:border-red-500/60 dark:bg-red-900/20"
                      : "dark:border-gray-700 bg-white dark:bg-gray-800")
                  }
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {g.product?.name || "—"}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      <span className="text-red-600 dark:text-red-400">
                        {g.product?.model}
                      </span>
                      {" / "}
                      {g.product?.brand}
                    </div>
                    {g.locationPath?.length ? (
                      <div className="text-xs text-gray-500">
                        {g.locationPath.join(" → ")}
                      </div>
                    ) : null}
                    <div
                      className={
                        "text-xs " +
                        (overdue ? "text-red-700" : "text-gray-500")
                      }
                    >
                      {t.dueLabel}：{fmtDate(g.dueDate)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t.borrowerLabel}：{g.borrower || "—"}；{t.renterLabel}：
                      {g.renter || "—"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t.unreturnedLabel}：{g.remaining}
                    </div>
                  </div>
                  <button
                    className="px-2 py-1 text-xs rounded bg-indigo-600 text-white disabled:opacity-60"
                    onClick={() => addNon(g)}
                    disabled={g.remaining <= 0}
                  >
                    {t.add}
                  </button>
                </div>
              );
            })}
          </div>
          <Pager
            page={npPage}
            totalPages={npTotalPages}
            onFirst={() => setPageNP(1)}
            onPrev={() => setPageNP((p) => Math.max(1, p - 1))}
            onNext={() => setPageNP((p) => Math.min(npTotalPages, p + 1))}
            onLast={() => setPageNP(npTotalPages)}
            labelPerPage={t.perPageN.replace("{{n}}", String(PAGE_SIZE))}
            labelFirst={t.firstPage}
            labelPrev={t.prevPage}
            labelNext={t.nextPage}
            labelLast={t.lastPage}
          />
        </div>
      </section>

      {/* 選擇區 */}
      <section className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-4">
        <h3 className="font-semibold text-lg">🧺 {t.selectionTitleReturn}</h3>
        <div
          className="min-h-[160px] p-4 rounded-lg border-2 border-dashed dark:border-gray-700 bg-white dark:bg-gray-800"
          onDrop={onDropToSelection}
          onDragOver={onDragOver}
        >
          {drafts.length === 0 ? (
            <div className="text-center text-gray-500">{t.emptyList}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/40">
                  <tr>
                    <th className="px-3 py-2 text-left">{t.thProduct}</th>
                    <th className="px-3 py-2 text-left">{t.thModelBrand}</th>
                    <th className="px-3 py-2 text-left">{t.thType}</th>
                    <th className="px-3 py-2 text-left">{t.thLocation}</th>
                    <th className="px-3 py-2 text-left">{t.thQuantity}</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {drafts.map((d, i) => {
                    const rowKey =
                      d.kind === "pm"
                        ? `pm-${d.stockId}`
                        : `non-${d.productId}-${d.locationId}-${
                            (d as any).borrower
                          }-${(d as any).renter}`;
                    return (
                      <tr key={`${rowKey}-${i}`}>
                        <td className="px-3 py-2">{d.product.name}</td>
                        <td className="px-3 py-2">
                          <span className="text-red-600 dark:text-red-400">
                            {d.product.model}
                          </span>
                          {" / "}
                          {d.product.brand}
                          {d.kind === "pm" && (d as any).iams ? (
                            <span className="ml-2 text-purple-600 dark:text-purple-400">
                              {(d as any).iams}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          {d.kind === "pm" ? t.typeProperty : t.typeNonProperty}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs">
                            {d.locationPath?.length
                              ? d.locationPath.join(" → ")
                              : "—"}
                          </div>
                          <div className="text-xs text-gray-500">
                            {t.borrowerLabel}：{(d as any).borrower || "—"}；
                            {t.renterLabel}：{(d as any).renter || "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {d.kind === "pm" ? (
                            <span>1</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                className="px-2 py-1 rounded border dark:border-gray-700"
                                onClick={() =>
                                  updateDraftQty(i, Math.max(1, d.quantity - 1))
                                }
                                aria-label="decrement"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                className="w-20 px-2 py-1 border rounded text-center dark:bg-gray-900 dark:border-gray-700"
                                min={1}
                                max={(d as any).cap}
                                value={d.quantity}
                                onChange={(e) =>
                                  updateDraftQty(
                                    i,
                                    parseInt(e.target.value || "1", 10)
                                  )
                                }
                              />
                              <button
                                className="px-2 py-1 rounded border dark:border-gray-700"
                                onClick={() =>
                                  updateDraftQty(
                                    i,
                                    Math.min((d as any).cap, d.quantity + 1)
                                  )
                                }
                                aria-label="increment"
                              >
                                ＋
                              </button>
                              <span className="text-xs text-gray-500">
                                / {(d as any).cap}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            className="text-red-500 hover:underline"
                            onClick={() => removeDraft(i)}
                          >
                            {t.remove}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            className="text-gray-500 hover:underline"
            onClick={clearDrafts}
          >
            {t.clear}
          </button>
          <button
            className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-60"
            onClick={() => {
              if (drafts.length === 0) return;
              setConfirmOpen(true);
            }}
            disabled={drafts.length === 0 || posting}
          >
            {posting ? t.postingReturn : t.submitReturn}
          </button>
        </div>

        {msg && (
          <div className="text-sm px-3 py-2 rounded bg-gray-100 dark:bg-gray-700 inline-block">
            {msg}
          </div>
        )}
      </section>

      {/* 歸還：確認清單 Modal */}
      <ConfirmModal
        open={confirmOpen}
        title={t.confirmReturnTitle}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={performReturn}
        confirmText={t.confirmReturnButton}
        cancelText={t.cancel}
        busy={posting}
      >
        <div className="space-y-3 text-sm">
          {drafts.length === 0 ? (
            <div className="text-gray-500">{t.noSelectionYet}</div>
          ) : (
            <>
              {retPM.length > 0 && (
                <div>
                  <div className="font-semibold mb-1">
                    {t.pmCountLabel
                      .replace("{{count}}", String(retPM.length))
                      .replace("{{plural}}", retPM.length > 1 ? "s" : "")}
                  </div>
                  <ul className="space-y-1">
                    {retPM.map((d, i) => (
                      <li key={`r-c-pm-${d.stockId}-${i}`}>
                        • {d.product.name}（
                        <span className="text-red-600">{d.product.model}</span>/
                        {d.product.brand}){" "}
                        {d.iams ? (
                          <span className="text-purple-600 ml-1">{d.iams}</span>
                        ) : null}
                        {d.locationPath?.length ? (
                          <span className="ml-1 text-gray-500">
                            {t.atLabel} {d.locationPath.join(" → ")}
                          </span>
                        ) : null}
                        <span className="ml-2 text-gray-500">
                          {t.borrowerLabel}：{d.borrower || "—"}；
                          {t.renterLabel}：{d.renter || "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {retNon.length > 0 && (
                <div>
                  <div className="font-semibold mb-1">
                    {t.nonPmTotalLabel.replace(
                      "{{count}}",
                      String(retNonTotal)
                    )}
                  </div>
                  <ul className="space-y-1">
                    {retNon.map((d, i) => (
                      <li
                        key={`r-c-non-${d.productId}-${d.locationId}-${d.borrower}-${d.renter}-${i}`}
                      >
                        • {d.product.name}（
                        <span className="text-red-600">{d.product.model}</span>/
                        {d.product.brand}) × <b>{d.quantity}</b>
                        {d.locationPath?.length ? (
                          <span className="ml-1 text-gray-500">
                            {t.atLabel} {d.locationPath.join(" → ")}
                          </span>
                        ) : null}
                        <span className="ml-2 text-gray-500">
                          {t.borrowerLabel}：{d.borrower || "—"}；
                          {t.renterLabel}：{d.renter || "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </ConfirmModal>
    </div>
  );
}

/* ====================== 小元件：分頁器 ====================== */
function Pager({
  page,
  totalPages,
  onFirst,
  onPrev,
  onNext,
  onLast,
  labelPerPage,
  labelFirst,
  labelPrev,
  labelNext,
  labelLast,
}: {
  page: number;
  totalPages: number;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  labelPerPage: string;
  labelFirst: string;
  labelPrev: string;
  labelNext: string;
  labelLast: string;
}) {
  const tp = Math.max(1, totalPages || 1);
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <div className="text-gray-600 dark:text-gray-300">{labelPerPage}</div>
      <div className="inline-flex items-center gap-2">
        <button
          type="button"
          className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
          onClick={onFirst}
          disabled={page <= 1}
          title={labelFirst}
        >
          «
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
          onClick={onPrev}
          disabled={page <= 1}
          title={labelPrev}
        >
          ‹
        </button>
        <span className="tabular-nums">
          {page} / {tp}
        </span>
        <button
          type="button"
          className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
          onClick={onNext}
          disabled={page >= tp}
          title={labelNext}
        >
          ›
        </button>
        <button
          type="button"
          className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-50"
          onClick={onLast}
          disabled={page >= tp}
          title={labelLast}
        >
          »
        </button>
      </div>
    </div>
  );
}
