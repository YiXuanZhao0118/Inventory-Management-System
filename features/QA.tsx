//features\QA.tsx
"use client";
import { HelpCircle } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Plus, Pencil, Trash2, Save, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import type { Components } from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { PluggableList } from "unified";

// i18n
import { useLanguage } from "@/src/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

/* ========= Types ========= */
type QAItem = {
  id: string;
  title: string;
  tags: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
  contentMd: string;
};
type QASchema = { items: QAItem[] };

/* ========= utils ========= */
const fetcher = (url: string) => fetch(url).then((r) => r.json());
const cn = (...xs: Array<string | false | null | undefined>) =>
  xs.filter(Boolean).join(" ");
function score(item: QAItem, q: string): number {
  if (!q.trim()) return 0;
  const hay = (
    item.title +
    " " +
    item.tags.join(" ") +
    " " +
    item.contentMd
  ).toLowerCase();
  const qq = q.toLowerCase().split(/\s+/).filter(Boolean);
  let s = 0;
  for (const t of qq) {
    if (item.title.toLowerCase().includes(t)) s += 3;
    if (hay.includes(t)) s += 1;
  }
  if (hay.includes(q.toLowerCase())) s += 2;
  return s;
}

/* ========= 共用 Markdown 渲染器（預覽 & 查看一致） ========= */
const mdComponents: Components = {
  a: ({ ...props }) => {
    const cls = String((props as any).className || "");
    const isHeadingAnchor = cls.includes("heading-anchor");
    return (
      <a
        {...props}
        className={cn(
          isHeadingAnchor
            ? "ml-2 no-underline text-gray-400 opacity-0 transition group-hover:opacity-100"
            : "text-[#2563eb] text-blue-600 hover:underline",
          (props as any).className
        )}
        target="_blank"
        rel="noopener noreferrer"
      />
    );
  },
  h1: ({ node, ...props }) => (
    <h1
      {...props}
      className={cn(
        "group mt-4 mb-4 text-2xl md:text-4xl font-extrabold tracking-tight",
        "border-b border-gray-200 pb-3",
        (props as any).className
      )}
    />
  ),
  h2: ({ node, ...props }) => (
    <h2
      {...props}
      className={cn(
        "group mt-10 mb-2 text-2xl md:text-3xl font-bold",
        "border-b border-gray-200 pb-2",
        (props as any).className
      )}
    />
  ),
  h3: ({ node, ...props }) => (
    <h3
      {...props}
      className={cn(
        "group mt-8 mb-2 text-2xl md:text-2xl font-semibold",
        (props as any).className
      )}
    />
  ),
  hr: () => <hr className="my-6 border-t border-[#3c3c3c]" />,
  ul: ({ node, ...props }) => (
    <ul
      {...props}
      className={cn(
        "list-disc pl-6 my-2 space-y-1 marker:text-current",
        (props as any).className
      )}
    />
  ),
  ol: ({ node, ...props }) => (
    <ol
      {...props}
      className={cn(
        "list-decimal pl-6 my-2 space-y-1 marker:text-current",
        (props as any).className
      )}
    />
  ),
  img: ({ node, ...props }) => (
    <img
      {...props}
      className={cn(
        "max-w-full rounded-lg border border-gray-200",
        (props as any).className
      )}
    />
  ),
  video: ({ node, ...props }: any) => (
    <video
      {...props}
      controls
      className={cn(
        "w-full rounded-lg border border-[#2d2d2d]",
        props.className
      )}
    />
  ),
  table: ({ node, ...props }) => (
    <table
      {...props}
      className={cn(
        "table-auto border-collapse w-full",
        "[&_*]:border [&_*]:border-gray-200 [&_th]:bg-gray-50 [&_th]:font-semibold",
        (props as any).className
      )}
    />
  ),
  code: ({ node, className, children, ...props }: any) => {
    const txt = String(children ?? "");
    const isInline = (props as any)?.inline ?? !txt.includes("\n");
    const m = /language-(\w+)/.exec(className || "");
    const lang = m?.[1];

    if (isInline) {
      return (
        <code
          className={cn(
            "px-1.5 py-0.5 rounded font-mono text-[0.95em] ring-1",
            "bg-[#f8fafc] text-[#111827] ring-[#e5e7eb]",
            className
          )}
        >
          {children}
        </code>
      );
    }
    return (
      <SyntaxHighlighter
        language={lang}
        style={oneLight}
        CodeTag="code"
        className="rounded-xl"
        customStyle={{ margin: 0, borderRadius: 12 }}
        showLineNumbers={false}
        wrapLongLines
      >
        {txt.replace(/\n$/, "")}
      </SyntaxHighlighter>
    );
  },
};
const previewMdComponents: Components = {
  ...mdComponents,
  h1: ({ node, ...props }) => (
    <h3
      {...props}
      className={cn(
        "mt-1 mb-1 text-base font-semibold",
        (props as any).className
      )}
    />
  ),
  h2: ({ node, ...props }) => (
    <h4
      {...props}
      className={cn(
        "mt-1 mb-1 text-base font-semibold",
        (props as any).className
      )}
    />
  ),
  h3: ({ node, ...props }) => (
    <h5
      {...props}
      className={cn(
        "mt-1 mb-1 text-sm font-semibold",
        (props as any).className
      )}
    />
  ),
  img: () => null,
  video: () => null,
  code: ({ node, className, children, ...props }: any) => {
    const txt = String(children ?? "");
    const isInline = (props as any)?.inline ?? !txt.includes("\n");
    const m = /language-(\w+)/.exec(className || "");
    const lang = m?.[1];

    if (isInline) {
      return (
        <code
          className={cn(
            "px-1 py-0.5 rounded font-mono text-[0.9em] ring-1",
            "bg-[#f8fafc] text-[#111827] ring-[#e5e7eb]",
            className
          )}
        >
          {children}
        </code>
      );
    }
    return (
      <SyntaxHighlighter
        language={lang}
        style={oneLight}
        CodeTag="code"
        className="rounded-lg"
        customStyle={{ margin: 0, borderRadius: 8, fontSize: "0.85em" }}
        showLineNumbers={false}
        wrapLongLines
      >
        {txt.replace(/\n$/, "")}
      </SyntaxHighlighter>
    );
  },
};

// ✂️ 取前幾個段落做卡片預覽；自動補齊未關閉的 ``` 區塊
function toPreviewMd(src: string, maxChars = 450): string {
  const blocks = (src || "").trim().split(/\n{2,}/);
  let out = "";
  for (const b of blocks) {
    const next = out ? out + "\n\n" + b : b;
    if (next.length > maxChars) {
      out = next.slice(0, maxChars);
      break;
    }
    out = next;
    if (out.length >= maxChars) break;
  }
  const ticks = (out.match(/```/g) || []).length;
  if (ticks % 2 === 1) out += "\n```";
  return out || "";
}

// ✅ 讓 Renderer 支援「full / preview」兩種模式
function MarkdownRenderer({
  content,
  variant = "full",
}: {
  content: string;
  variant?: "full" | "preview";
}) {
  const components = variant === "full" ? mdComponents : previewMdComponents;

  const REHYPE_FULL: PluggableList = [
    rehypeKatex,
    rehypeRaw,
    rehypeSlug,
    [
      rehypeAutolinkHeadings,
      { behavior: "append", properties: { className: ["heading-anchor"] } },
    ] as const,
  ];
  const REHYPE_PREVIEW: PluggableList = [rehypeKatex, rehypeRaw, rehypeSlug];

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={variant === "full" ? REHYPE_FULL : REHYPE_PREVIEW}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}

/* ========= Generic Modal ========= */
function Modal({
  open,
  onClose,
  children,
  title,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={cn(
          "relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-h-[90vh] overflow-auto w-[92vw] md:w-[70vw]",
          wide && "md:w-[80vw]"
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/* ========= Editor (Markdown) ========= */
function MarkdownEditor({
  initial,
  open,
  onClose,
  onSaved,
  t,
}: {
  initial?: Partial<QAItem>;
  open: boolean;
  onClose: () => void;
  onSaved: (item: QAItem) => void;
  t: any;
}) {
  const isEdit = Boolean(initial?.id);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [tags, setTags] = useState<string>((initial?.tags ?? []).join(", "));
  const [md, setMd] = useState<string>(initial?.contentMd ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? "");
      setTags((initial?.tags ?? []).join(", "));
      setMd(initial?.contentMd ?? "");
    }
  }, [open, initial]);

  const imgInputRef = useRef<HTMLInputElement>(null);
  const vidInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: File[]) => {
    if (!files?.length) return [];
    const fd = new FormData();
    files.forEach((f) => fd.append("file", f));
    const res = await fetch("/api/qa/upload", { method: "POST", body: fd });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error || t.upload_failed);
    return j.files as Array<{ url: string; type: string; name: string }>;
  };

  const onPickImages = () => imgInputRef.current?.click();
  const onPickVideos = () => vidInputRef.current?.click();

  const onImgChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    try {
      const list = await uploadFiles(files);
      list.forEach((f) => insert(`\n\n![${f.name}](${f.url})\n\n`));
    } catch (err) {
      alert(String(err));
    } finally {
      input.value = "";
    }
  };

  const onVidChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    try {
      const list = await uploadFiles(files);
      list.forEach((f) =>
        insert(
          `\n\n<video controls src="${f.url}" style="max-width:100%"></video>\n\n`
        )
      );
    } catch (err) {
      alert(String(err));
    } finally {
      input.value = "";
    }
  };

  const fromUrl = async () => {
    const url = prompt(t.from_url_prompt);
    if (!url) return;
    try {
      const res = await fetch("/api/qa/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || t.download_failed);
      (j.files as Array<{ url: string; type: string; name: string }>).forEach(
        (f) => {
          if ((f.type || "").startsWith("image/")) {
            insert(`![${f.name}](${f.url})`);
          } else {
            insert(
              `<video controls src="${f.url}" style="max-width:100%"></video>`
            );
          }
        }
      );
    } catch (e) {
      alert(String(e));
    }
  };

  const insert = (snippet: string, cursorOffset = 0) => {
    const el = document.getElementById(
      "qa-md-editor"
    ) as HTMLTextAreaElement | null;
    const withSpacing = `\n\n${snippet}\n\n`;
    if (!el) {
      setMd((m) => m + withSpacing);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = md.slice(0, start) + withSpacing + md.slice(end);
    setMd(next);
    setTimeout(() => {
      el.focus();
      el.selectionStart = el.selectionEnd =
        start + withSpacing.length - cursorOffset;
    }, 0);
  };

  const onEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const el = e.currentTarget;
    const value = md;
    const start = el.selectionStart;
    const end = el.selectionEnd;

    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const nextNewline = value.indexOf("\n", end);
    const lineEnd = nextNewline === -1 ? value.length : nextNewline;
    const block = value.slice(lineStart, lineEnd);

    if (e.shiftKey) {
      const replaced = block.replace(/^( {1,2}|\t)/gm, "");
      const before = value.slice(0, lineStart);
      const after = value.slice(lineEnd);
      const newText = before + replaced + after;
      setMd(newText);
      const removed = block.length - replaced.length;
      requestAnimationFrame(() => {
        el.selectionStart = Math.max(lineStart, start - 2);
        el.selectionEnd = Math.max(lineStart, end - removed);
      });
    } else {
      const replaced = block.replace(/^/gm, "  ");
      const before = value.slice(0, lineStart);
      const after = value.slice(lineEnd);
      const newText = before + replaced + after;
      setMd(newText);
      const added = replaced.length - block.length;
      requestAnimationFrame(() => {
        el.selectionStart = start + 2;
        el.selectionEnd = end + added;
      });
    }
  };

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        tags: tags
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        contentMd: md,
      };
      const res = await fetch(isEdit ? `/api/qa/${initial!.id}` : "/api/qa", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || t.save_failed);
      onSaved(j.item);
      onClose();
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t.edit_title_md : t.new_title_md}
      wide
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm mb-1">{t.field_title}</label>
          <input
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent p-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.field_title_ph}
          />
        </div>
        <div>
          <label className="block text-sm mb-1">{t.field_tags}</label>
          <input
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent p-2"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder={t.field_tags_ph}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800"
            onClick={() => insert("## H2\n\n")}
          >
            H2
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800"
            onClick={() => insert("### H3\n\n")}
          >
            H3
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800"
            onClick={() => insert("---\n\n")}
          >
            {t.toolbar_hr}
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800"
            onClick={() => insert("- item 1\n- item 2\n\n")}
          >
            {t.toolbar_list}
          </button>

          <button
            className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800"
            onClick={() => insert("**bold**", 2)}
          >
            B
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800"
            onClick={() => insert("*italic*", 1)}
          >
            I
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800"
            onClick={() => insert("[link](https://)", 1)}
          >
            Link
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800"
            onClick={() => insert("```\ncode\n```", 4)}
          >
            Code
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800"
            onClick={onPickImages}
          >
            {t.toolbar_upload_img}
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800"
            onClick={onPickVideos}
          >
            {t.toolbar_upload_vid}
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-800"
            onClick={fromUrl}
          >
            {t.toolbar_from_url}
          </button>

          <input
            ref={imgInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onImgChange}
          />
          <input
            ref={vidInputRef}
            type="file"
            accept="video/mp4,video/webm"
            multiple
            className="hidden"
            onChange={onVidChange}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <textarea
            id="qa-md-editor"
            className="min-h-[50vh] w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent p-3 font-mono text-sm"
            value={md}
            onChange={(e) => setMd(e.target.value)}
            onKeyDown={onEditorKeyDown}
            placeholder={t.editor_placeholder}
          />

          <div
            className="min-h-[50vh] rounded-xl border border-gray-200 p-5 overflow-auto
             bg-white text-slate-900
             prose prose-slate max-w-none prose-xl
             prose-headings:font-extrabold prose-headings:tracking-tight
             prose-h1:mb-4 prose-h1:border-b prose-h1:border-gray-200 prose-h1:pb-3
             prose-h2:mt-10 prose-h2:mb-2 prose-h2:border-b prose-h2:border-gray-200 prose-h2:pb-2
             prose-a:text-[#2563eb] hover:prose-a:underline
             prose-hr:border-gray-200 prose-img:rounded-xl prose-pre:shadow-lg"
          >
            <MarkdownRenderer content={md || `*${t.preview_placeholder}*`} />
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-2">
          <button
            className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700"
            onClick={onClose}
          >
            {t.cancel}
          </button>
          <button
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-60"
            disabled={saving || !title.trim()}
            onClick={submit}
          >
            <Save className="w-4 h-4 inline -mt-0.5 mr-1" />
            {saving ? t.saving : t.save}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ========= 在單一卡片容器內做「跑馬燈式」自動捲動 ========= */
function useMarqueeInside(
  ref: React.RefObject<HTMLElement>,
  opts?: {
    stepPx?: number;
    chunkPx?: number;
    pauseMs?: number;
    fps?: number;
    resetToTop?: boolean;
  }
) {
  const {
    stepPx = 1,
    chunkPx = 320,
    pauseMs = 1400,
    fps = 60,
    resetToTop = true,
  } = opts || {};

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let alive = true;
    let intervalId: number | undefined;
    let pauseId: number | undefined;

    const max = () => Math.max(0, el.scrollHeight - el.clientHeight);

    const runChunk = () => {
      if (!alive) return;
      let movedThisChunk = 0;

      intervalId = window.setInterval(() => {
        if (!alive) return;

        if (el.scrollTop >= max() - 1) {
          if (resetToTop) el.scrollTop = 0;
          movedThisChunk = 0;
        } else {
          el.scrollTop += stepPx;
          movedThisChunk += stepPx;
        }

        if (movedThisChunk >= chunkPx) {
          window.clearInterval(intervalId!);
          pauseId = window.setTimeout(runChunk, pauseMs);
        }
      }, 1000 / fps);
    };

    runChunk();

    return () => {
      alive = false;
      if (intervalId) window.clearInterval(intervalId);
      if (pauseId) window.clearTimeout(pauseId);
    };
  }, [ref, stepPx, chunkPx, pauseMs, fps, resetToTop]);
}

/* ========= 卡片內的自動捲動預覽 ========= */
function AutoPreview({
  content,
  heightClass = "h-32",
}: {
  content: string;
  heightClass?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useMarqueeInside(scrollerRef, {
    stepPx: 1,
    chunkPx: 128,
    pauseMs: 1000,
    fps: 8,
    resetToTop: true,
  });

  return (
    <div className={`relative ${heightClass}`}>
      <div
        ref={scrollerRef}
        className="
          h-full overflow-y-auto pr-1
          [mask-image:linear-gradient(to_bottom,black,black,transparent)]
          [-webkit-mask-image:linear-gradient(to_bottom,black,black,transparent)]
        "
      >
        <div className="prose prose-slate prose-sm max-w-none text-gray-700 dark:text-gray-200">
          <MarkdownRenderer variant="preview" content={toPreviewMd(content)} />
        </div>
      </div>
    </div>
  );
}

/* ========= Page ========= */
export default function QAPage() {
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    hi: hiIN,
    "de-DE": deDE,
    de: deDE,
  };
  const t = (tMap[language] || zhTW).faq ?? {}; // 建議在語系檔新增 "faq" 區塊

  const { data, error, mutate } = useSWR<QASchema>("/api/qa", fetcher);
  const [query, setQuery] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [openView, setOpenView] = useState<QAItem | null>(null);
  const [openEdit, setOpenEdit] = useState<QAItem | null>(null);
  const [openNew, setOpenNew] = useState(false);

  const items = data?.items ?? [];
  const sorted = useMemo(() => {
    if (!query.trim())
      return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return items
      .map((x) => ({ x, s: score(x, query) }))
      .sort((a, b) => b.s - a.s || (a.x.order ?? 0) - (b.x.order ?? 0))
      .map((r) => r.x);
  }, [items, query]);

  const reorder = async (id: string, dir: -1 | 1) => {
    const arr = [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const i = arr.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    const [m] = arr.splice(i, 1);
    arr.splice(j, 0, m);
    const ids = arr.map((x) => x.id);
    await fetch("/api/qa/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    await mutate();
  };

  const del = async (id: string) => {
    if (!confirm(t.confirm_delete)) return;
    const res = await fetch(`/api/qa/${id}`, { method: "DELETE" });
    if (!res.ok) alert(t.delete_failed);
    await mutate();
  };

  const PREVIEW_HEIGHT = "h-32";

  if (error)
    return (
      <div className="p-6 text-red-600">
        {t.load_failed}: {String(error)}
      </div>
    );
  if (!data) return <div className="p-6">{t.loading}</div>;

  return (
    <div className="container mx-auto max-w-screen px-4 md:px-8 py-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg space-y-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
        <HelpCircle className="h-7 w-7" aria-hidden="true" />
        <span>{t.title}</span>
      </h1>

      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-[60vw] md:w-96 rounded-xl border border-gray-300 dark:border-gray-700 bg-transparent px-4 py-2"
            placeholder={t.search_ph || "Search title/content/tags"}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800"
            >
              {t.clear}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <button
              onClick={() => setOpenNew(true)}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-emerald-600 text-white"
            >
              <Plus className="w-4 h-4" /> {t.new_qa}
            </button>
          )}
          <button
            onClick={() => setEditMode((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 px-4 py-2 rounded-xl",
              editMode
                ? "bg-amber-500 text-white"
                : "bg-gray-200 dark:bg-gray-700"
            )}
          >
            <Pencil className="w-4 h-4" />{" "}
            {editMode ? t.exit_edit : t.edit_mode}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sorted.map((it) => (
          <div
            key={it.id}
            className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 shadow-sm hover:shadow-md transition flex flex-col"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-lg line-clamp-2">
                  {it.title}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {it.tags.map((tg) => (
                    <span
                      key={tg}
                      className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800"
                    >
                      {tg}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <AutoPreview content={it.contentMd} heightClass={PREVIEW_HEIGHT} />

            <div className="mt-auto pt-4 flex items-center justify-between">
              <button
                className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800"
                onClick={() => setOpenView(it)}
              >
                {t.view}
              </button>

              <div className="flex items-center gap-2">
                {editMode && (
                  <>
                    <button
                      className="px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800"
                      title={t.move_up}
                      onClick={() => reorder(it.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className="px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800"
                      title={t.move_down}
                      onClick={() => reorder(it.id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      className="px-3 py-1.5 rounded-lg bg-rose-600 text-white"
                      onClick={() => del(it.id)}
                      title={t.delete}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white"
                      onClick={() => setOpenEdit(it)}
                      title={t.edit}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 新增 / 編輯 */}
      <MarkdownEditor
        open={openNew}
        onClose={() => setOpenNew(false)}
        onSaved={() => mutate()}
        t={t}
      />
      <MarkdownEditor
        open={!!openEdit}
        initial={openEdit ?? undefined}
        onClose={() => setOpenEdit(null)}
        onSaved={() => mutate()}
        t={t}
      />

      {/* 檢視 */}
      <Modal
        open={!!openView}
        onClose={() => setOpenView(null)}
        title={
          openView && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold">{openView.title}</span>
              {openView.tags?.map((tg) => (
                <span
                  key={tg}
                  className="font-normal text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                >
                  {tg}
                </span>
              ))}
            </div>
          )
        }
        wide
      >
        {openView && (
          <div
            className="rounded-xl border border-gray-200 p-6
             bg-white text-slate-900
             prose prose-slate max-w-none prose-xl
             prose-headings:font-extrabold prose-headings:tracking-tight
             prose-h1:mb-4 prose-h1:border-b prose-h1:border-gray-200 prose-h1:pb-3
             prose-h2:mt-10 prose-h2:mb-2 prose-h2:border-b prose-h2:border-gray-200 prose-h2:pb-2
             prose-a:text-[#2563eb] hover:prose-a:underline
             prose-hr:border-gray-200 prose-img:rounded-xl prose-pre:shadow-lg"
          >
            <MarkdownRenderer content={openView.contentMd} />
          </div>
        )}
      </Modal>
    </div>
  );
}
