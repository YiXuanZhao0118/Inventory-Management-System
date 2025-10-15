// app/(protected)/qrcode/print/page.tsx
"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { Printer, ListChecks, X, Check, Undo2 } from "lucide-react";

/* ========= 型別 ========= */
type RawItem = {
  stockId: string;
  iamsId?: string | null;
  url: string;
  img: { svg: string; png: string };
  product: { id?: string; name?: string; brand: string; model: string };
  location?: { id: string; label: string; path?: string };
  status?: string;
};
type Resp = {
  items: RawItem[];
  base?: string;
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
};
type PrintItem = {
  stockId: string; // 僅用於 key/選取，不顯示
  iamsId?: string | null;
  img: { svg: string; png: string };
  product: { brand: string; model: string };
};
type SessionPayload = {
  items: PrintItem[]; // 舊：若從 localStorage k= 帶進來也能用
  base: string;
  qrSize: 64 | 128 | 256;
};

/* ========= 工具 ========= */
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

/* ========= 主元件 ========= */
export default function QRPrintThisPage() {
  const sp = useSearchParams();

  // 來源狀態
  const [base, setBase] = React.useState<string>(defaultBaseOrigin());
  const [qrPx, setQrPx] = React.useState<number>(256);
  const [fontPx, setFontPx] = React.useState<number>(10);

  // 清單與選取
  const [allItems, setAllItems] = React.useState<PrintItem[]>([]);
  const [sel, setSel] = React.useState<Set<string>>(new Set());

  // 選擇器 UI
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [term, setTerm] = React.useState("");

  // ---- 載入策略：優先依網址參數抓「全部分頁」；若沒有參數，才嘗試 localStorage token（相容舊流程） ----
  React.useEffect(() => {
    (async () => {
      // 1) Query 參數模式（新：抓全部）
      const q = sp.get("q")?.trim() ?? "";
      const onlyInStock = sp.get("onlyInStock") === "0" ? false : true;
      const baseParam = sp.get("base") || defaultBaseOrigin();
      const sizeParam = Number(sp.get("size") || "256");
      const sizeClamp = ((): 64 | 128 | 256 =>
        sizeParam === 64 || sizeParam === 128 ? sizeParam : 256)();

      if (q || sp.has("onlyInStock") || sp.has("base") || sp.has("size")) {
        setBase(baseParam);
        setQrPx(sizeParam || 256); // 畫面可超出 64/128/256，請求仍走 64/128/256
        // 抓全部分頁
        const items = await fetchAllByFilters({
          q,
          onlyInStock,
          base: baseParam,
        });
        setAllItems(items);
        // 讀取預設選取（主頁當頁可見項目）
        const selParam = sp.get("sel"); // e.g. "ID1,ID2,ID3"
        if (selParam) {
          const wanted = new Set(selParam.split(",").filter(Boolean));
          const preSel = items
            .filter((x) => wanted.has(x.stockId))
            .map((x) => x.stockId);
          setSel(new Set(preSel));
        } else {
          // 沒帶 sel -> 維持舊行為：預設全選
          setSel(new Set(items.map((x) => x.stockId)));
        }
        return;
      }

      // 2) localStorage token 模式（舊）
      const key = sp.get("k") || "qrprint_v1";
      const raw =
        (typeof window !== "undefined" && localStorage.getItem(key)) || null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as SessionPayload;
          setBase(parsed.base || baseParam);
          setQrPx(parsed.qrSize || 256);
          const items = Array.isArray(parsed.items) ? parsed.items : [];
          setAllItems(items);
          setSel(new Set(items.map((x) => x.stockId)));
        } catch (e) {
          console.error("QR print payload parse error:", e);
        } finally {
          try {
            localStorage.removeItem(key);
          } catch {}
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  // 依搜尋字過濾給選擇器用
  const filtered = React.useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((it) => {
      const iams = (it.iamsId || "").toLowerCase();
      const brand = (it.product.brand || "").toLowerCase();
      const model = (it.product.model || "").toLowerCase();
      return iams.includes(q) || brand.includes(q) || model.includes(q);
    });
  }, [allItems, term]);

  const selectedItems = React.useMemo(
    () => allItems.filter((x) => sel.has(x.stockId)),
    [allItems, sel]
  );

  // 批次操作
  const selectAll = () => setSel(new Set(allItems.map((x) => x.stockId)));
  const clearAll = () => setSel(new Set());
  const selectVisible = () =>
    setSel((prev) => {
      const s = new Set(prev);
      filtered.forEach((x) => s.add(x.stockId));
      return s;
    });
  const clearVisible = () =>
    setSel((prev) => {
      const s = new Set(prev);
      filtered.forEach((x) => s.delete(x.stockId));
      return s;
    });
  const toggleOne = (id: string) =>
    setSel((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  // 變數樣式
  const vars = {
    ["--qr" as any]: `${qrPx}px`,
    ["--font" as any]: `${fontPx}px`,
    ["--line-gap" as any]: `${Math.max(2, Math.round(fontPx * 0.3))}px`,
  } as React.CSSProperties;

  return (
    <div
      className="min-h-screen w-full bg-white text-black p-4 md:p-6 lg:p-8"
      style={vars}
    >
      {/* 工具列 */}
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 bg-indigo-600 text-white hover:bg-indigo-700"
          title="Select items"
          disabled={allItems.length === 0}
        >
          <ListChecks className="w-4 h-4" />
          Select items
        </button>

        <div className="inline-flex items-center gap-2 rounded-md border px-2 py-1">
          <label className="text-sm text-gray-700">QR px</label>
          <input
            type="number"
            min={48}
            max={512}
            step={4}
            value={qrPx}
            onChange={(e) =>
              setQrPx(Math.min(512, Math.max(48, Number(e.target.value) || 0)))
            }
            className="w-20 rounded border px-2 py-1"
          />
        </div>

        <div className="inline-flex items-center gap-2 rounded-md border px-2 py-1">
          <label className="text-sm text-gray-700">Font</label>
          <input
            type="number"
            min={6}
            max={20}
            step={1}
            value={fontPx}
            onChange={(e) =>
              setFontPx(Math.min(20, Math.max(6, Number(e.target.value) || 0)))
            }
            className="w-16 rounded border px-2 py-1"
          />
        </div>

        <button
          onClick={() => window.print()}
          className="ml-auto inline-flex items-center gap-2 rounded-md px-3 py-2 bg-emerald-600 text-white hover:bg-emerald-700"
          title="Print"
          disabled={selectedItems.length === 0}
        >
          <Printer className="w-4 h-4" />
          Print
        </button>

        <div className="text-sm text-gray-600">
          {allItems.length > 0
            ? `Selected: ${selectedItems.length}/${allItems.length}`
            : "No data – open from QR page"}
        </div>
      </div>

      {/* 預覽：QR 上、文字下；只顯示 IAMS / Brand / Model（不顯示 stockId/location/name） */}
      <div className="sheet">
        {selectedItems.map((it) => (
          <div className="cell" key={it.stockId}>
            <img
              className="qr"
              src={withQRParams(it.img.png, {
                // 向 API 請 64/128/256 其一，畫面再用你設定的 qrPx 呈現
                size: nearestQRSize(qrPx),
                base,
              })}
              alt="QR"
              width={qrPx}
              height={qrPx}
            />
            <div className="meta">
              {it.iamsId ? (
                <div className="line">
                  <strong>IAMS：</strong>
                  <span className="mono">{it.iamsId}</span>
                </div>
              ) : null}
              <div className="line">
                <strong>Brand：</strong> {it.product.brand || "-"}
              </div>
              <div className="line">
                <strong>Model：</strong> {it.product.model || "-"}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 選擇器（像主頁） */}
      {pickerOpen && (
        <div className="no-print fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setPickerOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-x-0 bottom-0 md:inset-auto md:right-4 md:top-4 md:w-[720px] md:max-h-[80vh]">
            <div className="mx-4 mb-4 rounded-xl border bg-white shadow-lg md:mx-0">
              <div className="flex items-center gap-2 border-b px-4 py-3">
                <span className="font-semibold">Select items to print</span>
                <button
                  className="ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm hover:bg-gray-50"
                  onClick={selectAll}
                >
                  <Check className="w-4 h-4" /> All
                </button>
                <button
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm hover:bg-gray-50"
                  onClick={clearAll}
                >
                  <Undo2 className="w-4 h-4" /> None
                </button>
                <button
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm hover:bg-gray-50"
                  onClick={selectVisible}
                  title="Select visible"
                >
                  + Visible
                </button>
                <button
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm hover:bg-gray-50"
                  onClick={clearVisible}
                  title="Unselect visible"
                >
                  − Visible
                </button>
                <button
                  className="ml-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-gray-100"
                  onClick={() => setPickerOpen(false)}
                >
                  <X className="w-4 h-4" />
                  Close
                </button>
              </div>

              <div className="flex items-center gap-2 px-4 py-2 border-b">
                <input
                  type="text"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Search IAMS / brand / model"
                  className="w-full rounded border px-3 py-2"
                />
                <span className="text-sm text-gray-500">
                  {filtered.length}/{allItems.length}
                </span>
              </div>

              <div className="max-h-[60vh] overflow-auto">
                <ul className="divide-y">
                  {filtered.map((it) => {
                    const checked = sel.has(it.stockId);
                    return (
                      <li
                        key={it.stockId}
                        className="flex items-center gap-3 px-4 py-2"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={checked}
                          onChange={() => toggleOne(it.stockId)}
                        />
                        <img
                          src={withQRParams(it.img.png, { size: 64, base })}
                          alt="QR"
                          className="h-10 w-10 object-contain"
                        />
                        <div className="min-w-0">
                          <div className="text-sm text-gray-900">
                            IAMS:
                            <span className="font-mono break-all">
                              {it.iamsId || "-"}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600">
                            {it.product.brand || "-"} /
                            {it.product.model || "-"}
                          </div>
                        </div>
                        <div className="ml-auto text-xs text-gray-400">
                          {checked ? "✓" : ""}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
                <div className="text-sm text-gray-600">
                  Selected: {selectedItems.length} / {allItems.length}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-md px-3 py-2 border bg-white hover:bg-gray-50"
                    onClick={() => setPickerOpen(false)}
                  >
                    Done
                  </button>
                  <button
                    className="rounded-md px-3 py-2 bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => {
                      setPickerOpen(false);
                      window.print();
                    }}
                    disabled={selectedItems.length === 0}
                  >
                    Print selected
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 樣式 */}
      <style>{`
        :root { --qr: 256px; --font: 10px; --line-gap: 3px; }
        .sheet {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(var(--qr), 1fr));
          gap: 1px;
          align-items: start;
        }
        .cell {
          width: 100%;
          max-width: var(--qr);
          padding: 2px;
          border: 1px solid #e5e7eb;
          border-radius: 3px;
          background: #fff;
          page-break-inside: avoid;
        }
        .qr {
          display: block;
          width: var(--qr);
          height: var(--qr);
          object-fit: contain;
          margin: 0 auto 2px auto;
        }
        .meta { max-width: var(--qr); margin: 0 auto; }
        .line {
          font-size: var(--font);
          line-height: 1.15;
          margin-bottom: var(--line-gap);
          overflow-wrap: anywhere; word-break: break-word; white-space: normal;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          overflow-wrap: anywhere; word-break: break-all;
        }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          @page { margin: 10mm; }
          .cell { border: 1px solid #000; }
        }
      `}</style>
    </div>
  );
}

/* ========= 幫手：用主頁同 API 抓全部分頁 ========= */
async function fetchAllByFilters(opts: {
  q: string;
  onlyInStock: boolean;
  base: string;
}): Promise<PrintItem[]> {
  const baseQS = new URLSearchParams();
  if (opts.onlyInStock) baseQS.set("onlyInStock", "1");
  if (opts.base) baseQS.set("base", opts.base);
  if (opts.q) baseQS.set("q", opts.q);
  baseQS.set("page", "1");
  baseQS.set("pageSize", "200");

  const first = await fetch(`/api/qrcode/short-term/pm?${baseQS.toString()}`, {
    cache: "no-store",
  });
  const j1 = (await first.json()) as Resp;
  let acc: RawItem[] = Array.isArray(j1.items) ? [...j1.items] : [];
  const totalPages = Math.max(1, j1.totalPages ?? 1);

  if (totalPages > 1) {
    const reqs: Promise<Response>[] = [];
    for (let p = 2; p <= totalPages; p++) {
      const qs = new URLSearchParams(baseQS);
      qs.set("page", String(p));
      reqs.push(
        fetch(`/api/qrcode/short-term/pm?${qs.toString()}`, {
          cache: "no-store",
        })
      );
    }
    const resps = await Promise.all(reqs);
    for (const r of resps) {
      const jj = (await r.json()) as Resp;
      if (Array.isArray(jj.items)) acc.push(...jj.items);
    }
  }

  return acc.map((it) => ({
    stockId: it.stockId,
    iamsId: it.iamsId ?? null,
    img: { png: it.img.png, svg: it.img.svg },
    product: { brand: it.product.brand || "", model: it.product.model || "" },
  }));
}

/* ========= 幫手：把請求 QR 的 size 收斂在 64/128/256 ========= */
function nearestQRSize(px: number): 64 | 128 | 256 {
  if (px <= 96) return 64;
  if (px <= 192) return 128;
  return 256;
}
