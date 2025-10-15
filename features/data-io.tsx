// app/(protected)/data-io/page.tsx
"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Download,
  UploadCloud,
  FileJson,
  FileArchive,
  Image as ImageIcon,
  FileDown,
  ShieldAlert,
  Diff,
} from "lucide-react";

// i18n
import { useLanguage } from "@/src/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

/* ====================== 型別 ====================== */
type IdField = string | string[];

type TableConfig = {
  key:
    | "locations"
    | "products"
    | "stocks"
    | "rentals"
    | "transfers"
    | "discarded"
    | "iams"
    | "devices"
    | "users"
    | "productCategories"
    | "productCategoryItems"
    | "productFiles"
    | "qaItems"; // ← 新增
  idField: IdField;
  compareIgnore: readonly string[];
};

const TABLES: readonly TableConfig[] = [
  {
    key: "locations",
    idField: "id",
    compareIgnore: ["createdAt", "updatedAt"],
  },
  { key: "products", idField: "id", compareIgnore: ["createdAt", "updatedAt"] },
  { key: "stocks", idField: "id", compareIgnore: ["createdAt", "updatedAt"] },
  { key: "rentals", idField: "id", compareIgnore: ["createdAt", "updatedAt"] },
  {
    key: "transfers",
    idField: "id",
    compareIgnore: ["createdAt", "updatedAt"],
  },
  {
    key: "discarded",
    idField: "id",
    compareIgnore: ["createdAt", "updatedAt"],
  },
  { key: "iams", idField: "stockId", compareIgnore: [] },
  { key: "devices", idField: "id", compareIgnore: ["createdAt", "updatedAt"] },
  { key: "users", idField: "id", compareIgnore: ["createdAt", "updatedAt"] },
  { key: "productCategories", idField: "id", compareIgnore: [] },
  {
    key: "productCategoryItems",
    idField: ["categoryId", "productId"],
    compareIgnore: [],
  },
  {
    key: "productFiles",
    idField: "id",
    compareIgnore: ["updatedAt", "createdAt"],
  },
  { key: "qaItems", idField: "id", compareIgnore: ["createdAt", "updatedAt"] }, // ← 新增
] as const;

type TableKey = (typeof TABLES)[number]["key"];

type ExportBundle = {
  meta: { version: 1; exportedAt: string };
  data: Record<TableKey, any[]>;
};

const stripKeys = (obj: any, ignore: ReadonlyArray<string>) => {
  const o: any = {};
  for (const k of Object.keys(obj ?? {}))
    if (!ignore.includes(k)) o[k] = obj[k];
  return o;
};
const itemKey = (scope: string, id: unknown, i: number) =>
  `${scope}-${String(id ?? "noid")}-${i}`;
const getPk = (row: any, idField: IdField): string =>
  Array.isArray(idField)
    ? idField.map((f) => String(row?.[f] ?? "")).join("|")
    : String(row?.[idField] ?? "");
const showPk = (row: any, idField: IdField): string =>
  Array.isArray(idField)
    ? idField.map((f) => `${f}=${String(row?.[f] ?? "")}`).join(" & ")
    : String(row?.[idField] ?? "(no id)");
function indexBy(arr: any[], idField: IdField) {
  const m = new Map<string, any>();
  for (const x of arr) {
    const k = getPk(x, idField);
    if (k) m.set(k, x);
  }
  return m;
}

type PerTableDiff = {
  added: any[];
  removed: any[];
  updated: { before: any; after: any }[];
  skippedInvalid: any[];
};
type DiffResult = Record<TableKey, PerTableDiff>;

/* ====================== 元件 ====================== */
export default function DataIOPage() {
  // i18n
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    hi: hiIN,
    "de-DE": deDE,
    de: deDE,
  };
  const t = (tMap[language] || zhTW).data_io ?? {};

  // 檔案 input
  const imagesRef = useRef<HTMLInputElement>(null);
  const pfilesRef = useRef<HTMLInputElement>(null);
  const qaRef = useRef<HTMLInputElement>(null); // ← 新增
  const exportRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 追蹤是否選了檔案
  const [selImages, setSelImages] = useState<File | null>(null);
  const [selPfiles, setSelPfiles] = useState<File | null>(null);
  const [selQa, setSelQa] = useState<File | null>(null); // ← 新增
  const [selExport, setSelExport] = useState<File | null>(null);
  const tripletReady = !!(selImages && selPfiles && selQa && selExport); // ← 需要四檔

  // 狀態
  const [baseline, setBaseline] = useState<ExportBundle | null>(null);
  const [incomingRaw, setIncomingRaw] = useState<any | null>(null);
  const [incomingClean, setIncomingClean] = useState<ExportBundle | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<
    "idle" | "review" | "importing" | "success" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastResult, setLastResult] = useState<any | null>(null);

  async function setMaintenance(on: boolean, message?: string) {
    try {
      await fetch("/api/sys/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on, message }),
      });
    } catch {}
  }

  /* ---------- 匯出 ---------- */
  const onExport = async () => {
    try {
      const r = await fetch(
        "/api/data/export?format=zip&files=referenced&qa=referenced",
        {
          // ← 帶上 qa=referenced
          cache: "no-store",
        }
      );
      if (!r.ok)
        throw new Error(
          (await r.text().catch(() => "")) ||
            t.export_failed ||
            "Export failed."
        );
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lab330-export-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`${t.export_error || "Export error"}: ${e?.message || e}`);
    }
  };

  /* ---------- 匯入（四檔） ---------- */
  const runImportTriplet = async () => {
    const img = imagesRef.current?.files?.[0];
    const pf = pfilesRef.current?.files?.[0];
    const qa = qaRef.current?.files?.[0]; // ← 新增
    const ex = exportRef.current?.files?.[0];
    if (!img || !pf || !qa || !ex) {
      alert(
        t.triplet_pick_all ||
          "Please select product_images.zip, product_files.zip, qa_files.zip and export.json"
      );
      return;
    }
    setBusy(true);
    setPhase("importing");
    setError(null);
    setLastResult(null);

    await setMaintenance(
      true,
      t.maintenance_msg || "Updating data… Please don’t close this page."
    );

    try {
      const fd = new FormData();
      fd.append("product_images", img);
      fd.append("product_files", pf);
      fd.append("qa_files", qa); // ← 新增欄位名稱
      fd.append("export", ex);

      const r = await fetch("/api/data/import", { method: "POST", body: fd });
      if (!r.ok) throw new Error(await r.text());
      const res = await r.json();
      setLastResult(res);
      setPhase("success");
    } catch (e: any) {
      setError(e?.message ?? t.import_failed ?? "Import failed.");
      setPhase("error");
    } finally {
      await setMaintenance(false, "");
      setBusy(false);
      if (imagesRef.current) imagesRef.current.value = "";
      if (pfilesRef.current) pfilesRef.current.value = "";
      if (qaRef.current) qaRef.current.value = ""; // ← reset
      if (exportRef.current) exportRef.current.value = "";
      setSelImages(null);
      setSelPfiles(null);
      setSelQa(null); // ← reset
      setSelExport(null);
    }
  };
  const onImportTripletClick = () => {
    if (!tripletReady || busy) return;
    setConfirmOpen(true);
  };

  /* ---------- 單檔 JSON diff（只預覽） ---------- */
  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      setIncomingRaw(json);

      const cur = await fetch("/api/data/export?format=json", {
        cache: "no-store",
      });
      if (!cur.ok)
        throw new Error(
          t.fetch_current_failed || "Failed to fetch current data."
        );
      const baselineJson: ExportBundle = await cur.json();
      setBaseline(baselineJson);

      const cleaned: ExportBundle = {
        meta: { version: 1, exportedAt: new Date().toISOString() },
        data: {} as any,
      };
      const allDiff: DiffResult = {} as any;

      for (const tTable of TABLES) {
        const arr = Array.isArray(json?.data?.[tTable.key])
          ? json.data[tTable.key]
          : [];
        const good: any[] = [];
        const bad: any[] = [];
        for (const row of arr) {
          const pk = getPk(row, tTable.idField);
          if (row && typeof row === "object" && pk.length > 0) good.push(row);
          else bad.push(row);
        }
        (cleaned.data as any)[tTable.key] = good;

        const baseArr = Array.isArray(baselineJson?.data?.[tTable.key])
          ? baselineJson.data[tTable.key]
          : [];
        const baseById = indexBy(baseArr, tTable.idField);
        const incById = indexBy(good, tTable.idField);

        const added: any[] = [];
        const removed: any[] = [];
        const updated: { before: any; after: any }[] = [];

        for (const [id, after] of incById) {
          if (!baseById.has(id)) added.push(after);
          else {
            const before = baseById.get(id)!;
            const a = stripKeys(before, tTable.compareIgnore);
            const b = stripKeys(after, tTable.compareIgnore);
            if (JSON.stringify(a) !== JSON.stringify(b))
              updated.push({ before, after });
          }
        }
        for (const [id, before] of baseById)
          if (!incById.has(id)) removed.push(before);

        allDiff[tTable.key] = { added, removed, updated, skippedInvalid: bad };
      }

      setIncomingClean(cleaned);
      setDiff(allDiff);
      setPhase("review");
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? t.unknown_error ?? "Unknown error.");
      setPhase("error");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const totals = useMemo(() => {
    if (!diff) return null;
    const sum = { added: 0, removed: 0, updated: 0, skippedInvalid: 0 };
    for (const t of TABLES) {
      const d = diff[t.key];
      sum.added += d.added.length;
      sum.removed += d.removed.length;
      sum.updated += d.updated.length;
      sum.skippedInvalid += d.skippedInvalid.length;
    }
    return sum;
  }, [diff]);

  const onClosePreview = () => {
    setIncomingRaw(null);
    setIncomingClean(null);
    setDiff(null);
    setPhase("idle");
    setError(null);
  };

  /* ====================== UI ====================== */
  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
        <FileDown className="h-7 w-7" aria-hidden="true" />
        <span>{t.title || "Data Import / Export"}</span>
      </h1>

      {/* 成功/錯誤 */}
      {phase === "success" && (
        <div
          className="px-4 py-2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
          aria-live="polite"
        >
          {t.import_done || "Import completed."}
        </div>
      )}
      {phase === "error" && error && (
        <div
          className="px-4 py-2 rounded bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200 flex items-start gap-2"
          aria-live="assertive"
        >
          <ShieldAlert className="w-4 h-4 mt-0.5" />
          <div>
            {t.error || "Error"}: {error}
          </div>
        </div>
      )}

      {/* Export 區塊 */}
      <section className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-2 mb-2">
          <Download className="w-5 h-5 text-indigo-600" />
          <div className="text-lg font-semibold">
            {t.export_title || "Export current database snapshot"}
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {t.export_hint || (
            <>
              It’s recommended to download a backup before importing. The export
              is a <code>.zip</code> (contains <code>export.json</code> and
              referenced files incl. QA).
            </>
          )}
        </p>
        <button
          onClick={onExport}
          className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-60"
          disabled={busy}
        >
          {t.export_btn || "Download backup (.zip)"}
        </button>
      </section>

      {/* Import 四檔 */}
      <section className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-4">
        <div className="flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-indigo-600" />
          <div className="text-lg font-semibold">
            {t.triplet_title_prefix || "Import from"}{" "}
            <code>
              export.json + product_images.zip + product_files.zip +
              qa_files.zip
            </code>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <label className="block">
            <span className="text-sm mb-1 flex items-center gap-1">
              <ImageIcon className="w-4 h-4" /> product_images.zip
            </span>
            <input
              ref={imagesRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed,application/octet-stream"
              disabled={busy}
              onChange={(e) => setSelImages(e.target.files?.[0] ?? null)}
              className="w-full px-3 py-2 rounded border dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <label className="block">
            <span className="text-sm mb-1 flex items-center gap-1">
              <FileArchive className="w-4 h-4" /> product_files.zip
            </span>
            <input
              ref={pfilesRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed,application/octet-stream"
              disabled={busy}
              onChange={(e) => setSelPfiles(e.target.files?.[0] ?? null)}
              className="w-full px-3 py-2 rounded border dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <label className="block">
            <span className="text-sm mb-1 flex items-center gap-1">
              <FileArchive className="w-4 h-4" /> qa_files.zip
            </span>
            <input
              ref={qaRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed,application/octet-stream"
              disabled={busy}
              onChange={(e) => setSelQa(e.target.files?.[0] ?? null)}
              className="w-full px-3 py-2 rounded border dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <label className="block">
            <span className="text-sm mb-1 flex items-center gap-1">
              <FileJson className="w-4 h-4" /> export.json
            </span>
            <input
              ref={exportRef}
              type="file"
              accept=".json,application/json,text/json"
              disabled={busy}
              onChange={(e) => setSelExport(e.target.files?.[0] ?? null)}
              className="w-full px-3 py-2 rounded border dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            {t.triplet_warning || (
              <>
                This will <b>overwrite the whole database and files</b>. A
                maintenance banner will show during import.
              </>
            )}
          </div>
          <button
            onClick={onImportTripletClick}
            className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={busy || !tripletReady}
            aria-disabled={!tripletReady}
            title={
              !tripletReady
                ? t.triplet_need_all || "請先選滿四個檔案"
                : undefined
            }
          >
            {t.triplet_btn || "Import (overwrite all)"}
          </button>
        </div>

        {lastResult && (
          <div className="text-xs text-gray-700 dark:text-gray-300">
            <pre className="bg-gray-100 dark:bg-gray-800 rounded p-2 overflow-auto max-h-72">
              {JSON.stringify(lastResult, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {/* 單檔 JSON diff（只預覽） */}
      <section className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-2 mb-2">
          <Diff className="w-5 h-5 text-indigo-600" />
          <div className="text-lg font-semibold">
            {t.diff_title || (
              <>
                Import a single <code>export.json</code> (diff preview)
              </>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          {t.diff_desc || (
            <>
              Preview only; <b>won’t</b> write to database. To actually
              overwrite, use the triplet import above.
            </>
          )}
        </p>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json,text/json"
            onChange={onPickFile}
            disabled={busy}
            className="px-3 py-2 rounded border dark:border-gray-700 dark:bg-gray-900"
          />
          {phase === "importing" && (
            <span className="text-sm">{t.importing || "Importing…"} </span>
          )}
          {phase === "error" && (
            <span className="text-sm text-red-600">
              {t.error || "Error"}: {error}
            </span>
          )}
        </div>
      </section>

      {/* 差異清單（只在 review 時顯示） */}
      {phase === "review" && diff && incomingClean && (
        <section className="p-4 rounded-xl border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 space-y-4">
          <div className="text-lg font-semibold">
            {t.preview_title || "Change preview (read-only)"}
          </div>

          {totals && (
            <div className="text-sm">
              {t.added || "Added"} <b>{totals.added}</b>,{" "}
              {t.removed || "Removed"} <b>{totals.removed}</b>,{" "}
              {t.updated || "Updated"} <b>{totals.updated}</b> (
              {t.ignore_fields || "ignore"} <code>createdAt/updatedAt</code>),{" "}
              {t.skipped || "Skipped invalid"} <b>{totals.skippedInvalid}</b>.
            </div>
          )}

          <div className="space-y-3">
            {TABLES.map((tt) => {
              const d = diff[tt.key];
              return (
                <details
                  key={tt.key}
                  className="rounded-xl border dark:border-gray-700 p-3"
                >
                  <summary className="cursor-pointer font-medium">
                    {tt.key}: {t.added || "Added"} {d.added.length},{" "}
                    {t.removed || "Removed"} {d.removed.length},{" "}
                    {t.updated || "Updated"} {d.updated.length},{" "}
                    {t.skipped || "Skipped"} {d.skippedInvalid.length}
                  </summary>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="font-semibold mb-1">
                        {t.added || "Added"}
                      </div>
                      <ul className="space-y-1 max-h-60 overflow-auto">
                        {d.added.map((x, i) => (
                          <li
                            key={itemKey(
                              `${tt.key}-added`,
                              getPk(x, tt.idField),
                              i
                            )}
                            className="truncate"
                          >
                            <code>{showPk(x, tt.idField)}</code>
                          </li>
                        ))}
                        {d.added.length === 0 && (
                          <li className="text-gray-500">{t.none || "None"}</li>
                        )}
                      </ul>
                    </div>
                    <div>
                      <div className="font-semibold mb-1">
                        {t.removed || "Removed"}
                      </div>
                      <ul className="space-y-1 max-h-60 overflow-auto">
                        {d.removed.map((x, i) => (
                          <li
                            key={itemKey(
                              `${tt.key}-removed`,
                              getPk(x, tt.idField),
                              i
                            )}
                            className="truncate"
                          >
                            <code>{showPk(x, tt.idField)}</code>
                          </li>
                        ))}
                        {d.removed.length === 0 && (
                          <li className="text-gray-500">{t.none || "None"}</li>
                        )}
                      </ul>
                    </div>
                    <div>
                      <div className="font-semibold mb-1">
                        {t.updated || "Updated"}
                      </div>
                      <ul className="space-y-1 max-h-60 overflow-auto">
                        {d.updated.map((x, i) => (
                          <li
                            key={itemKey(
                              `${tt.key}-updated`,
                              getPk(x.after, tt.idField),
                              i
                            )}
                            className="truncate"
                          >
                            <code>{showPk(x.after, tt.idField)}</code>
                          </li>
                        ))}
                        {d.updated.length === 0 && (
                          <li className="text-gray-500">{t.none || "None"}</li>
                        )}
                      </ul>
                    </div>
                  </div>

                  {d.skippedInvalid.length > 0 && (
                    <div className="mt-3">
                      <div className="font-semibold mb-1">
                        {t.skipped_title || "Skipped invalid rows"}
                      </div>
                      <pre className="text-xs bg-gray-100 dark:bg-gray-800 rounded p-2 max-h-60 overflow-auto">
                        {JSON.stringify(d.skippedInvalid.slice(0, 50), null, 2)}
                      </pre>
                      {d.skippedInvalid.length > 50 && (
                        <div className="text-xs text-gray-500 mt-1">
                          {t.showing_first || "… Showing first 50 only"}
                        </div>
                      )}
                    </div>
                  )}
                </details>
              );
            })}
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={onClosePreview}
              disabled={busy}
              className="px-4 py-2 rounded border dark:border-gray-700"
            >
              {t.close_preview || "Close preview"}
            </button>
          </div>
        </section>
      )}

      {/* 匯入提醒 Modal */}
      {confirmOpen && (
        <div className="fixed inset-0 z-[9998] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-5">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
              {t.modal_title || "Before importing"}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              {t.modal_desc || (
                <>
                  This will <b>overwrite the entire database and files</b>.
                  Please download a backup via “Download backup (.zip)” above.
                  Continue?
                </>
              )}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded border dark:border-gray-700"
                disabled={busy}
              >
                {t.cancel || "Cancel"}
              </button>
              <button
                onClick={() => {
                  setConfirmOpen(false);
                  runImportTriplet();
                }}
                className="px-4 py-2 rounded bg-indigo-600 text-white disabled:opacity-60"
                disabled={busy}
              >
                {t.modal_confirm || "I’ve backed up, start import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
