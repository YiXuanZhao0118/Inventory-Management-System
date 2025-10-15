"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// i18n
import { useLanguage } from "@/src/components/LanguageSwitcher";
import zhTW from "@/app/data/language/zh-TW.json";
import enUS from "@/app/data/language/en-US.json";
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

type Cat = "image" | "pdf" | "video";
type ProductFileRow = {
  id: string;
  path: string;
  partNumber: string;
  description: string | null;
  files: { image?: string[]; pdf?: string[]; video?: string[] };
};

type Props = {
  isOpen: boolean;
  onClose: (changed?: boolean) => void; // changed=true 時外層應刷新
  productFile: ProductFileRow;
};

type ExistingItem = { id: string; name: string; kind: "existing" };
type NewItem = {
  id: string;
  name: string;
  kind: "new";
  file: File;
  preview?: string;
};
type Item = ExistingItem | NewItem;

function splitName(name: string) {
  const i = name.lastIndexOf(".");
  if (i <= 0) return { base: name, ext: "" };
  return { base: name.slice(0, i), ext: name.slice(i) }; // ext 含 dot
}

function SortableItem({
  item,
  onRemove,
  onRename,
  t,
}: {
  item: Item;
  onRemove: () => void;
  onRename: () => void;
  t: any;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: "none",
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center border p-2 rounded-lg dark:border-gray-700 dark:bg-gray-800"
    >
      {"file" in item && item.preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.preview}
          className="w-10 h-10 object-cover rounded mr-3"
          alt=""
        />
      ) : (
        <div className="w-10 h-10 rounded bg-gray-200 mr-3" />
      )}
      <span
        {...attributes}
        {...listeners}
        className="flex-1 truncate cursor-grab text-sm dark:text-gray-200"
        title={item.name}
        aria-label={item.name}
      >
        {item.name}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onRename}
          className="px-2 py-1 rounded border text-xs hover:bg-gray-100 dark:hover:bg-gray-700 dark:border-gray-600"
          title={t.renameBtn}
          aria-label={t.renameBtn}
        >
          {t.renameBtn}
        </button>
        <button
          onClick={onRemove}
          className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-xs"
          title={t.removeBtn}
          aria-label={t.removeBtn}
        >
          {t.removeBtn}
        </button>
      </div>
    </li>
  );
}

export default function ProductFileEditModal({
  isOpen,
  onClose,
  productFile,
}: Props) {
  // i18n
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const dict = tMap[language] || zhTW;
  const t =
    dict?.ProductGallery?.FileEditModal ?? // fallback
    {
      title: "Edit Files (P/N & Attachments)",
      close: "Close",
      save: "Save Changes",
      saving: "Saving…",
      pn: "P/N",
      description: "Description",
      dropzone: "Drop files here, or click to choose (auto-categorized)",
      section: { image: "Image", pdfDocs: "PDF/Docs", video: "Video", empty: "(none)" },
      renameBtn: "Rename",
      removeBtn: "Remove",
      rename: {
        title: "Rename file",
        hint:
          "Only the filename will be changed; extension remains. If duplicate, the server will append (1), (2)… on save.",
        cancel: "Cancel",
        apply: "Apply",
        emptyError: "Filename cannot be empty.",
        dupHint:
          "Target filename already exists. The server will handle duplicates on save (e.g., add (1), (2)…).",
      },
      reorderTip:
        "Newly added files are appended to the end of each category. To reorder them too, save once then reopen.",
    };

  const [pn, setPn] = useState(productFile.partNumber || "");
  const [desc, setDesc] = useState(productFile.description || "");

  // 既有檔案 → 轉成 Item
  const [images, setImages] = useState<Item[]>([]);
  const [pdfs, setPdfs] = useState<Item[]>([]);
  const [videos, setVideos] = useState<Item[]>([]);

  // rename 視窗狀態（上方彈出）
  const [renameTarget, setRenameTarget] = useState<{
    cat: Cat;
    id: string; // item.id
    from: string; // 原完整檔名（含副檔名）
    isNew: boolean;
    ext: string; // 含 dot
  } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  // 後送到 PATCH 的 renames（僅舊檔）
  const [renames, setRenames] = useState<Map<string, string>>(new Map());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  useEffect(() => {
    if (!isOpen) return;
    const toItems = (arr?: string[]) =>
      (arr || []).map(
        (n) => ({ id: `old-${n}`, name: n, kind: "existing" } as ExistingItem)
      );
    setImages(toItems(productFile.files?.image));
    setPdfs(toItems(productFile.files?.pdf));
    setVideos(toItems(productFile.files?.video));
    setPn(productFile.partNumber || "");
    setDesc(productFile.description || "");
    setRenames(new Map());
    // 關閉 rename 視窗
    setRenameTarget(null);
    setRenameDraft("");
    setRenameError(null);
  }, [isOpen, productFile]);

  if (!isOpen) return null;

  // 當前清單的所有檔名（提示重名）
  const allCurrentNames = useMemo(() => {
    const s = new Set<string>();
    [...images, ...pdfs, ...videos].forEach((it) => s.add(it.name));
    return s;
  }, [images, pdfs, videos]);

  // 新增檔案：自動分類（依副檔名/類型），不可改分類
  const onPickFiles = (list: FileList) => {
    const append =
      (setter: React.Dispatch<React.SetStateAction<Item[]>>) =>
      (item: NewItem) =>
        setter((prev) => [...prev, item]);

    Array.from(list).forEach((file) => {
      const lower = file.name.toLowerCase();
      const isImg =
        file.type.startsWith("image/") ||
        /\.(jpg|jpeg|png|gif|bmp|tiff?|webp|heic|svg|raw|cr2|nef|arw|ico|psd|ai|eps)$/.test(
          lower
        );
      const isPdf =
        file.type === "application/pdf" ||
        /\.(pdf|docx?|rtf|odt|xls[x]?|ppt[x]?|csv|md|html|xml|json|epub|tex)$/.test(
          lower
        );
      const isVid =
        file.type.startsWith("video/") ||
        /\.(mp4|mov|avi|mkv|flv|wmv|webm|mpeg|mpg|3gp|ts|m4v|ogv)$/.test(lower);

      const item: NewItem = {
        id: `new-${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        name: file.name,
        kind: "new",
        file,
      };
      if (isImg) {
        const reader = new FileReader();
        reader.onload = (e) => {
          item.preview = e.target?.result as string;
          append(setImages)(item);
        };
        reader.readAsDataURL(file);
      } else if (isPdf) append(setPdfs)(item);
      else if (isVid) append(setVideos)(item);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onRemove = (cat: Cat, id: string) => {
    const map: Record<Cat, React.Dispatch<React.SetStateAction<Item[]>>> = {
      image: setImages,
      pdf: setPdfs,
      video: setVideos,
    };
    map[cat]((prev) => prev.filter((x) => x.id !== id));
  };

  const onDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over) return;
    const reorder = (list: Item[]) => {
      const ai = list.findIndex((x) => x.id === active.id);
      const oi = list.findIndex((x) => x.id === over.id);
      return ai < 0 || oi < 0 ? list : arrayMove(list, ai, oi);
    };
    setImages((prev) => reorder(prev));
    setPdfs((prev) => reorder(prev));
    setVideos((prev) => reorder(prev));
  };

  // 打開 rename 視窗
  const openRename = (cat: Cat, it: Item) => {
    const { base, ext } = splitName(it.name);
    setRenameTarget({ cat, id: it.id, from: it.name, isNew: it.kind === "new", ext });
    setRenameDraft(base);
    setRenameError(null);
  };

  // 套用 rename
  const applyRename = () => {
    if (!renameTarget) return;
    const draft = renameDraft.trim();
    if (!draft) {
      setRenameError(t.rename.emptyError);
      return;
    }
    const to = `${draft}${renameTarget.ext}`;
    if (to === renameTarget.from) {
      closeRename();
      return;
    }

    if (renameTarget.isNew) {
      const editList = (setter: React.Dispatch<React.SetStateAction<Item[]>>) =>
        setter((prev) =>
          prev.map((x) => (x.id === renameTarget.id ? { ...x, name: to } : x))
        );
      if (renameTarget.cat === "image") editList(setImages);
      else if (renameTarget.cat === "pdf") editList(setPdfs);
      else editList(setVideos);
    } else {
      setRenames((m) => {
        const next = new Map(m);
        next.set(renameTarget.from, to);
        return next;
      });
      const editList = (setter: React.Dispatch<React.SetStateAction<Item[]>>) =>
        setter((prev) =>
          prev.map((x) =>
            x.id === renameTarget.id ? ({ ...x, name: to } as Item) : x
          )
        );
      if (renameTarget.cat === "image") editList(setImages);
      else if (renameTarget.cat === "pdf") editList(setPdfs);
      else editList(setVideos);
    }

    if (allCurrentNames.has(to)) {
      setRenameError(t.rename.dupHint);
      setTimeout(() => closeRename(), 800);
      return;
    }

    closeRename();
  };

  const closeRename = () => {
    setRenameTarget(null);
    setRenameDraft("");
    setRenameError(null);
  };

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSave = async () => {
    if (!productFile?.id) {
      setErr(`${t.errorPrefix}: missing productFile.id`);
      return;
    }

    setSaving(true);
    setErr(null);
    try {
      // 要移除的舊檔名（原始集合 - 目前仍存在的舊檔）
      const removed: string[] = [];
      const origSet = {
        image: new Set(productFile.files?.image || []),
        pdf: new Set(productFile.files?.pdf || []),
        video: new Set(productFile.files?.video || []),
      };
      const currentNames = {
        image: images.filter((i) => i.kind === "existing").map((i) => i.name),
        pdf: pdfs.filter((i) => i.kind === "existing").map((i) => i.name),
        video: videos.filter((i) => i.kind === "existing").map((i) => i.name),
      };
      for (const n of origSet.image) if (!currentNames.image.includes(n)) removed.push(n);
      for (const n of origSet.pdf) if (!currentNames.pdf.includes(n)) removed.push(n);
      for (const n of origSet.video) if (!currentNames.video.includes(n)) removed.push(n);

      const newImages = images.filter((i) => i.kind === "new") as NewItem[];
      const newPdfs = pdfs.filter((i) => i.kind === "new") as NewItem[];
      const newVideos = videos.filter((i) => i.kind === "new") as NewItem[];

      const order = {
        image: currentNames.image,
        pdf: currentNames.pdf,
        video: currentNames.video,
      };

      const form = new FormData();
      form.append("id", productFile.id);
      if (pn.trim()) form.append("partNumber", pn.trim());
      form.append("description", (desc || "").trim());
      form.append("remove", JSON.stringify(removed));
      form.append("order", JSON.stringify(order));

      // 舊檔 rename
      if (renames.size > 0) {
        const arr = Array.from(renames.entries()).map(([from, to]) => ({ from, to }));
        form.append("renames", JSON.stringify(arr));
      }

      // 新檔上傳
      [...newImages, ...newPdfs, ...newVideos].forEach((it) =>
        form.append("files", it.file, it.name)
      );

      const res = await fetch("/api/product-files", { method: "PATCH", body: form });
      const txt = await res.text();
      let json: any = null;
      try {
        json = txt ? JSON.parse(txt) : null;
      } catch {}
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);

      onClose(true);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const Section = ({
    label,
    items,
    cat,
  }: {
    label: string;
    items: Item[];
    cat: Cat;
  }) => (
    <div>
      <div className="text-xs uppercase text-gray-500 mb-2">{label}</div>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {items.map((it) => (
            <SortableItem
              key={it.id}
              item={it}
              onRemove={() => onRemove(cat, it.id)}
              onRename={() => openRename(cat, it)}
              t={t}
            />
          ))}
          {items.length === 0 && (
            <li className="text-xs text-gray-400">{t.section.empty}</li>
          )}
        </ul>
      </SortableContext>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col relative">
        {/* 上方 Rename 視窗 */}
        {renameTarget && (
          <div className="absolute left-1/2 -translate-x-1/2 top-3 z-20 w-[min(92%,720px)] rounded-xl border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-800 shadow-lg">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="font-medium text-gray-900 dark:text-gray-100">{t.rename.title}</div>
              <div className="mt-1 text-xs text-gray-500">{t.rename.hint}</div>
            </div>
            <div className="px-4 py-3 flex items-center gap-2">
              <input
                autoFocus
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                placeholder={t.rename.title}
                value={renameDraft}
                onChange={(e) => {
                  setRenameDraft(e.target.value);
                  setRenameError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyRename();
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    closeRename();
                  }
                }}
                aria-label={t.rename.title}
              />
              <span className="text-sm text-gray-600 dark:text-gray-300 shrink-0">
                {renameTarget.ext}
              </span>
            </div>
            {renameError && (
              <div className="px-4 pb-2 -mt-1 text-xs text-rose-600 dark:text-rose-400">
                {renameError}
              </div>
            )}
            <div className="px-4 pb-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
                onClick={closeRename}
              >
                {t.rename.cancel}
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-sm"
                onClick={applyRename}
              >
                {t.rename.apply}
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700">
          <div className="font-semibold text-gray-900 dark:text-gray-100">
            {t.title}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onClose()}
              className="px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-sm"
            >
              {t.close}
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-60"
            >
              {saving ? t.saving : t.save}
            </button>
          </div>
        </div>

        <div className="p-4 overflow-auto">
          {/* P/N & Description */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">{t.pn}</div>
              <input
                value={pn}
                onChange={(e) => setPn(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="md:col-span-2">
              <div className="text-xs text-gray-500 mb-1">{t.description}</div>
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* 新增檔案（自動分類） */}
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer border-gray-300 dark:border-gray-600 dark:text-gray-400 mb-4"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.dataTransfer.files && onPickFiles(e.dataTransfer.files);
            }}
            aria-label={t.dropzone}
            title={t.dropzone}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && onPickFiles(e.target.files)}
            />
            {t.dropzone}
          </div>

          {/* 檔案分組 + 拖曳排序 */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Section label={t.section.image} items={images} cat="image" />
              <Section label={t.section.pdfDocs} items={pdfs} cat="pdf" />
              <Section label={t.section.video} items={videos} cat="video" />
            </div>
          </DndContext>

          <div className="mt-4 text-xs text-gray-500">
            {t.reorderTip}
          </div>

          {/** 錯誤訊息（如有） */}
          {/* 不在頂端彈，避免被 rename 覆蓋 */}
        </div>
      </div>
    </div>
  );
}
