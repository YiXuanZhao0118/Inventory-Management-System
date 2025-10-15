// features/QRcode.tsx
"use client";
import { QrCode } from "lucide-react";
import React from "react";

// i18n
import { useLanguage } from "@/src/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

type Item = {
  stockId: string;
  iamsId?: string | null;
  url: string;
  img: { svg: string; png: string };
  product: { id: string; name: string; brand: string; model: string };
  location: { id: string; label: string; path?: string };
  status: string;
};

type Resp = {
  items: Item[];
  base?: string;
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmt(tpl: string, vars: Record<string, string | number>) {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    tpl
  );
}

function withQRParams(u: string, opts: { size?: number; base?: string }) {
  const url = new URL(
    u,
    typeof window !== "undefined" ? window.location.origin : "http://localhost"
  );
  if (opts.size != null) url.searchParams.set("size", String(opts.size));
  if (opts.base) url.searchParams.set("base", opts.base);
  return url.toString();
}

function defaultBaseOrigin() {
  if (typeof window === "undefined") return "http://172.30.10.16:3000";
  const cur = window.location.origin;
  if (
    /0\.0\.0\.0/.test(cur) ||
    /127\.0\.0\.1/.test(cur) ||
    /localhost/i.test(cur)
  ) {
    return "http://172.30.10.16:3000";
  }
  return cur;
}

// ───────────────── Paginator（底部右側） ─────────────────
function Paginator({
  page,
  pageCount,
  onFirst,
  onPrev,
  onNext,
  onLast,
  t,
}: {
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
  );
}

export default function ShortTermQRCodesPage() {
  // i18n dict
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const dict = tMap[language] || zhTW;
  const t = dict?.QRCodes || {};

  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [onlyInStock, setOnlyInStock] = React.useState(true);

  // 搜尋 + 分頁
  const [query, setQuery] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [page, setPage] = React.useState(1);

  // 動態 pageSize（預設 20；之後會依欄數×列數自動更新）
  const [pageSize, setPageSize] = React.useState(20);
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);

  // QR 解析度（64 / 128 / 256） → 影響欄數與下載 PNG 尺寸
  const [qrRes, setQrRes] = React.useState<64 | 128 | 256>(256);
  const [base, setBase] = React.useState<string>(defaultBaseOrigin());

  // grid 尺寸測量（用於決定每頁要抓幾筆）
  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const [visibleCols, setVisibleCols] = React.useState(0);
  const ROWS_PER_PAGE = 5; // 固定 5 列；每頁 = 可見欄數 × 5

  // debounce 搜尋
  React.useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(query.trim()), 350);
    return () => clearTimeout(id);
  }, [query]);

  // 依 QR 解析度估卡片最小寬
  const cellPx = React.useMemo(() => {
    switch (qrRes) {
      case 64:
        return 180;
      case 128:
        return 240;
      case 256:
      default:
        return 320;
    }
  }, [qrRes]);

  // 偵測網格寬度 → 推估實際欄數
  React.useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const GAP = 16;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      const cols = Math.max(1, Math.floor((w + GAP) / (cellPx + GAP)));
      setVisibleCols((prev) => (prev === cols ? prev : cols));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [cellPx]);

  // 欄數變動 → 設定 pageSize
  React.useEffect(() => {
    if (visibleCols > 0) {
      const newSize = visibleCols * ROWS_PER_PAGE;
      if (newSize !== pageSize) {
        setPage(1);
        setPageSize(newSize);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCols]);

  // 載入資料
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (onlyInStock) qs.set("onlyInStock", "1");
      if (base) qs.set("base", base);
      if (debouncedQ) qs.set("q", debouncedQ);
      qs.set("page", String(page));
      qs.set("pageSize", String(pageSize));

      const r = await fetch(`/api/qrcode/short-term/pm?${qs.toString()}`, {
        cache: "no-store",
      });
      const j: Resp = await r.json();

      setItems(Array.isArray(j.items) ? j.items : []);
      setTotal(j.total ?? 0);
      setTotalPages(j.totalPages ?? 1);
    } finally {
      setLoading(false);
    }
  }, [onlyInStock, base, debouncedQ, page, pageSize]);

  React.useEffect(() => {
    load();
  }, [load]);

  // 搜尋 / 篩選 改變 → 回到第 1 頁
  React.useEffect(() => {
    setPage(1);
  }, [debouncedQ, onlyInStock, pageSize]);

  const pageCount = Math.max(1, totalPages);

  // 下載：合成「QR + 4 行文字」的 PNG
  async function downloadCardPNG(it: Item) {
    const size = qrRes; // 64 / 128 / 256
    const pad = Math.round(size * 0.125); // 8/16/32
    const font = size === 64 ? 10 : size === 128 ? 14 : 16;
    const lineGap = Math.round(font * 0.35);

    const qrUrl = withQRParams(it.img.png, { size, base });

    // 載入 QR 影像
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = qrUrl;
    });

    const lines = [
      `${t.fields.stock || "Stock"}: ${it.stockId}`,
      `IAMS: ${it.iamsId || "-"}`,
      `${t.fields.brand || "Brand"}: ${it.product.brand || "-"}`,
      `${t.fields.model || "Model"}: ${it.product.model || "-"}`,
    ];

    // 測文字寬度
    const measure = document.createElement("canvas").getContext("2d")!;
    measure.font = `bold ${font}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    const textWidth = Math.max(
      ...lines.map((s) => measure.measureText(s).width)
    );
    const innerW = Math.max(size, Math.ceil(textWidth));
    const canvasW = innerW + pad * 2;
    const textH = lines.length * font + (lines.length - 1) * lineGap;
    const canvasH = size + textH + pad * 3;

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(canvasW);
    canvas.height = Math.ceil(canvasH);
    const ctx = canvas.getContext("2d")!;

    // 背景白
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // QR 置中
    const qrX = Math.round((canvas.width - size) / 2);
    const qrY = pad;
    ctx.drawImage(img, qrX, qrY, size, size);

    // 文字
    ctx.fillStyle = "#000";
    ctx.textBaseline = "top";
    ctx.font = `bold ${font}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;

    let y = qrY + size + pad;
    const x = Math.round((canvas.width - innerW) / 2);
    for (const s of lines) {
      ctx.fillText(s, x, y);
      y += font + lineGap;
    }

    // 下載
    const blob: Blob = await new Promise((res) =>
      canvas.toBlob((b) => res(b as Blob), "image/png")
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `QR_${it.stockId}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // 放在 ShortTermQRCodesPage 裡（與其他 hooks 同層）
  const printAllHref = React.useMemo(() => {
    const u = new URL(
      "/qrcode/print",
      typeof window !== "undefined"
        ? window.location.origin
        : "http://localhost"
    );
    if (debouncedQ) u.searchParams.set("q", debouncedQ);
    if (onlyInStock) u.searchParams.set("onlyInStock", "1");
    if (base) u.searchParams.set("base", base);
    u.searchParams.set("size", String(qrRes)); // 64/128/256

    // 新增：把「主頁當頁顯示」的 stockId 帶過去，讓列印頁預設只勾這些
    const visibleIds = items.map((it) => it.stockId);
    if (visibleIds.length > 0) {
      u.searchParams.set("sel", visibleIds.join(",")); // e.g. sel=ID1,ID2,ID3
    }

    return u.toString();
    // 別忘了把 items 放進依賴
  }, [debouncedQ, onlyInStock, base, qrRes, items]);

  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      {/* 標題 + 工具列 */}
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
        <QrCode className="h-7 w-7" aria-hidden="true" />
        <span>{t.title}</span>
      </h1>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div role="search" className="flex flex-1 flex-wrap items-center gap-2">
          <input
            id="qrcode-search"
            type="text"
            autoComplete="off"
            className="flex-1 min-w-[240px] px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            placeholder={
              t.searchPlaceholder ||
              "Search IAMS / brand / model / name / location"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                load();
              }
            }}
          />

          <label className="inline-flex items-center gap-2 text-sm px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={onlyInStock}
              onChange={(e) => setOnlyInStock(e.target.checked)}
            />
            {t.filters?.onlyInStock || "Only in-stock"}
          </label>

          {/* QR 解析度 */}
          <label className="inline-flex items-center gap-2 text-sm px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100">
            {t.controls?.qrResolution || "QR Resolution"}
            <select
              className="h-8 rounded border border-gray-300 bg-white px-2 dark:border-gray-700 dark:bg-gray-800"
              value={qrRes}
              onChange={(e) => {
                const v = Number(e.target.value) as 64 | 128 | 256;
                setQrRes(v === 64 || v === 128 ? v : 256);
              }}
              title={t.controls?.qrResTitle || "QR image resolution"}
            >
              <option value={64}>64 px</option>
              <option value={128}>128 px</option>
              <option value={256}>256 px</option>
            </select>
          </label>

          {/* 對外 Base（決定 QR 內容） */}
          <input
            type="text"
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 w-[260px]"
            value={base}
            onChange={(e) => setBase(e.target.value.trim())}
            placeholder="http://172.30.10.16:3000"
            title={t.controls?.baseOriginTitle || "Base Origin"}
          />

          <button
            className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            onClick={load}
            title={t.buttons?.searchReload || "Search / Reload"}
          >
            {t.buttons?.searchReload || "Search / Reload"}
          </button>

          <a
            className="shrink-0 px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            href={printAllHref}
            target="_blank"
            rel="noreferrer"
            title="Print all (current filters)"
          >
            Print all
          </a>
        </div>
      </div>

      {/* 清單（欄數自動依 QR 尺寸調整） */}
      {loading && (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t.state?.loading || "Loading…"}
        </p>
      )}
      {!loading && items.length === 0 && (
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t.state?.empty || "No items."}
        </p>
      )}

      {items.length > 0 && (
        <div
          ref={gridRef}
          className="qr-grid"
          style={
            {
              ["--cell" as any]: `${cellPx}px`,
              ["--gap" as any]: "16px",
            } as React.CSSProperties
          }
        >
          {items.map((it) => (
            <div
              key={it.stockId}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="mb-3 text-xs text-gray-500">
                <div>
                  <span className="font-medium">
                    {t.fields?.stock || "Stock"}
                  </span>
                  : {it.stockId}
                </div>
                {it.iamsId ? (
                  <div>
                    <span className="font-medium">IAMS</span>: {it.iamsId}
                  </div>
                ) : null}
              </div>

              <div className="mb-3">
                <img
                  src={withQRParams(it.img.png, { size: qrRes, base })}
                  alt={fmt(t.alt?.qrForStockTpl || "QR {stock}", {
                    stock: it.stockId,
                  })}
                  className="mx-auto block"
                  loading="lazy"
                />
              </div>

              <div className="space-y-1">
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-medium">
                    {t.fields?.brand || "Brand"}
                  </span>
                  : {it.product.brand}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  <span className="font-medium">
                    {t.fields?.model || "Model"}
                  </span>
                  : {it.product.model}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  className={cx(
                    "rounded-md px-3 py-1 text-sm font-medium text-white shadow focus:outline-none",
                    "bg-emerald-600 hover:bg-emerald-700"
                  )}
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.buttons?.openShortTerm || "short-term loan"}
                </a>
                <button
                  className={cx(
                    "rounded-md px-3 py-1 text-sm font-medium text-white shadow focus:outline-none",
                    "bg-slate-600 hover:bg-slate-700"
                  )}
                  onClick={() => downloadCardPNG(it)}
                  title={
                    t.tooltips?.downloadPngWithText ||
                    "Download PNG (with text)"
                  }
                >
                  {t.buttons?.downloadPng || "Download PNG"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 底部：左側每頁筆數，右側分頁器 */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-300">
          {fmt(
            t.pagination?.summaryTpl || "Per page {pageSize} · total {total}",
            {
              pageSize,
              total,
            }
          )}
        </div>
        <Paginator
          page={page}
          pageCount={pageCount}
          onFirst={() => setPage(1)}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(pageCount, p + 1))}
          onLast={() => setPage(pageCount)}
          t={t}
        />
      </div>

      {/* 自動欄數：以卡片最小寬度決定一列可排幾個 */}
      <style>{`
        .qr-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(var(--cell), 1fr));
          gap: var(--gap);
        }
      `}</style>
    </div>
  );
}
