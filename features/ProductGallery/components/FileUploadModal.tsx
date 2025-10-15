"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
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

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  /** 仍保留相容：若有傳入，會覆寫對應鍵；通常可傳空物件即可 */
  currentLanguageData?: any;
}

interface FileItem {
  id: string;
  name: string;
  type: string;
  size: number;
  preview?: string;
  originalFile: File;
}

function SortableItem({
  item,
  onRemove,
  removeLabel,
}: {
  item: FileItem;
  onRemove: () => void;
  removeLabel: string;
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
      className="flex items-center border p-2 rounded dark:border-gray-700 dark:bg-gray-800"
    >
      {item.preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.preview}
          className="w-12 h-12 object-cover rounded mr-4"
          alt=""
        />
      )}
      <span
        {...attributes}
        {...listeners}
        className="flex-1 truncate cursor-grab dark:text-gray-300"
        title={item.name}
        aria-label={item.name}
      >
        {item.name}
      </span>
      <button
        onClick={onRemove}
        className="ml-2 text-red-600 cursor-pointer hover:underline"
        title={removeLabel}
        aria-label={removeLabel}
      >
        ✕
      </button>
    </li>
  );
}

// 小工具：模板字串
const fmt = (tpl: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), tpl);

const FileUploadModal: React.FC<FileUploadModalProps> = ({
  isOpen,
  onClose,
  productId,
  currentLanguageData,
}) => {
  // i18n
  const { language } = useLanguage();
  const tMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    de: deDE,
  };
  const dict = tMap[language] || zhTW;
  // 允許 prop 覆寫（回溯相容）
  const baseT = dict?.ProductGallery?.FileUploadModal ?? {};
  const override = currentLanguageData?.FileUploadModal ?? {};
  const t = { ...baseT, ...override };

  // State and refs
  const [imageFiles, setImageFiles] = useState<FileItem[]>([]);
  const [docFiles, setDocFiles] = useState<FileItem[]>([]);
  const [videoFiles, setVideoFiles] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [serialOrPN, setSerialOrPN] = useState("");
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "uploading" | "success" | "error"
  >("idle");
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setImageFiles([]);
      setDocFiles([]);
      setVideoFiles([]);
      setSerialOrPN("");
      setUploadStatus("idle");
      setUploadMessage(null);
    }
  }, [isOpen]);

  // Early return if closed
  if (!isOpen) return null;

  const handleFiles = (files: FileList) => {
    setUploadStatus("idle");
    setUploadMessage(null);
    const filesArray: FileItem[] = Array.from(files)
      .filter(
        (file) => typeof file.name === "string" && typeof file.type === "string"
      )
      .map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        name: file.name,
        type: file.type,
        size: file.size,
        preview: undefined,
        originalFile: file,
      }));
    const imageExtensions = [
      ".jpg",".jpeg",".png",".gif",".bmp",".tiff",".tif",".webp",".heic",".svg",
      ".raw",".cr2",".nef",".arw",".ico",".psd",".ai",".eps"
    ];
    const pdfExtensions = [
      ".pdf",".docx",".doc",".txt",".rtf",".odt",".xls",".xlsx",".ppt",".pptx",
      ".csv",".md",".html",".xml",".json",".epub",".tex"
    ];
    const videoExtensions = [
      ".mp4",".mov",".avi",".mkv",".flv",".wmv",".webm",".mpeg",".mpg",
      ".3gp",".ts",".m4v",".ogv"
    ];
    const imageFilesNew = filesArray.filter(
      (item) =>
        item.type.startsWith("image/") ||
        imageExtensions.some((ext) => item.name.toLowerCase().endsWith(ext))
    );
    const pdfFilesNew = filesArray.filter(
      (item) =>
        item.type === "application/pdf" ||
        pdfExtensions.some((ext) => item.name.toLowerCase().endsWith(ext))
    );
    const videoFilesNew = filesArray.filter(
      (item) =>
        item.type.startsWith("video/") ||
        videoExtensions.some((ext) => item.name.toLowerCase().endsWith(ext))
    );
    imageFilesNew.forEach((item) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        item.preview = e.target?.result as string;
        setImageFiles((prev) => [...prev, item]);
      };
      reader.readAsDataURL(item.originalFile);
    });
    setDocFiles((prev) => [...prev, ...pdfFilesNew]);
    setVideoFiles((prev) => [...prev, ...videoFilesNew]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    setImageFiles((prev) => {
      const oldIndex = prev.findIndex((f) => f.id === activeId);
      const newIndex = prev.findIndex((f) => f.id === overId);
      return oldIndex < 0 || newIndex < 0
        ? prev
        : arrayMove(prev, oldIndex, newIndex);
    });
    setDocFiles((prev) => {
      const oldIndex = prev.findIndex((f) => f.id === activeId);
      const newIndex = prev.findIndex((f) => f.id === overId);
      return oldIndex < 0 || newIndex < 0
        ? prev
        : arrayMove(prev, oldIndex, newIndex);
    });
    setVideoFiles((prev) => {
      const oldIndex = prev.findIndex((f) => f.id === activeId);
      const newIndex = prev.findIndex((f) => f.id === overId);
      return oldIndex < 0 || newIndex < 0
        ? prev
        : arrayMove(prev, oldIndex, newIndex);
    });
  };

  const removeFile = (id: string, type: "images" | "docs" | "videos") => {
    if (type === "images")
      setImageFiles((prev) => prev.filter((f) => f.id !== id));
    if (type === "docs") setDocFiles((prev) => prev.filter((f) => f.id !== id));
    if (type === "videos")
      setVideoFiles((prev) => prev.filter((f) => f.id !== id));
    setUploadStatus("idle");
    setUploadMessage(null);
  };

  const handleUpload = async () => {
    setUploadStatus("uploading");
    setUploadMessage(null);

    const formData = new FormData();
    formData.append("productId", productId);
    formData.append("partNumber", serialOrPN.trim());
    formData.append("description", "");

    imageFiles.forEach((item) =>
      formData.append("files", item.originalFile, item.name)
    );
    docFiles.forEach((item) =>
      formData.append("files", item.originalFile, item.name)
    );
    videoFiles.forEach((item) =>
      formData.append("files", item.originalFile, item.name)
    );

    try {
      const response = await fetch("/api/product-files", {
        method: "POST",
        body: formData,
      });
      if (response.ok) {
        setUploadStatus("success");
        setUploadMessage(t.upload_success || "Upload succeeded!");
        onClose(); // 會觸發外層刷新
      } else {
        const err = await response.text();
        setUploadStatus("error");
        setUploadMessage((t.upload_failed_prefix || "Upload failed: ") + err);
      }
    } catch (error: any) {
      setUploadStatus("error");
      setUploadMessage((t.upload_failed_prefix || "Upload failed: ") + error.message);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex justify-center items-center z-50"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col dark:bg-gray-800">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold dark:text-white">
            {fmt(t.titleTpl || "Upload product files ({productId})", { productId })}
          </h2>
        </div>

        {uploadMessage && (
          <div
            className={`mb-4 text-center font-medium ${
              uploadStatus === "success"
                ? "text-green-600 dark:text-green-400"
                : "text-red-600 dark:text-red-400"
            }`}
          >
            {uploadMessage}
          </div>
        )}

        <div className="mb-4">
          <label
            htmlFor="serialOrPN"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            {t.serial_or_pn_label || "Serial / Part Number (P/N):"}
          </label>
          <input
            type="text"
            id="serialOrPN"
            value={serialOrPN}
            onChange={(e) => setSerialOrPN(e.target.value)}
            className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder={t.serial_or_pn_placeholder || "Enter a serial number or P/N"}
            aria-label={t.serial_or_pn_label || "Serial / Part Number (P/N):"}
          />
        </div>

        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer ${
            isDragging ? "border-blue-500" : "border-gray-300"
          } dark:border-gray-600 dark:text-gray-400`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files) {
              handleFiles(e.dataTransfer.files);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          aria-label={t.dropzone_text || "Drop files here, or click to choose"}
          title={t.dropzone_text || "Drop files here, or click to choose"}
        >
          <input
            type="file"
            ref={fileInputRef}
            multiple
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className="hidden"
          />
          {t.dropzone_text || "Drop files here, or click to choose"}
        </div>

        {/* File List */}
        {(imageFiles.length > 0 ||
          docFiles.length > 0 ||
          videoFiles.length > 0) && (
          <div className="mt-6 max-h-60 overflow-y-auto">
            <h3 className="text-lg font-medium mb-2 dark:text-white">
              {t.file_list_header || "Files"}
            </h3>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={[...imageFiles, ...docFiles, ...videoFiles]}
                strategy={verticalListSortingStrategy}
              >
                <ul className="space-y-2">
                  {imageFiles.length > 0 && (
                    <>
                      <li className="font-semibold dark:text-white">
                        {(t.file_type_header || "Type") +
                          `: ${t.type?.image || "Image"} (${imageFiles.length})`}
                      </li>
                      {imageFiles.map((item) => (
                        <SortableItem
                          key={item.id}
                          item={item}
                          onRemove={() => removeFile(item.id, "images")}
                          removeLabel={t.cancel || "Cancel"}
                        />
                      ))}
                    </>
                  )}
                  {docFiles.length > 0 && (
                    <>
                      <li className="font-semibold dark:text-white">
                        {(t.file_type_header || "Type") +
                          `: ${t.type?.document || "Document"} (${docFiles.length})`}
                      </li>
                      {docFiles.map((item) => (
                        <SortableItem
                          key={item.id}
                          item={item}
                          onRemove={() => removeFile(item.id, "docs")}
                          removeLabel={t.cancel || "Cancel"}
                        />
                      ))}
                    </>
                  )}
                  {videoFiles.length > 0 && (
                    <>
                      <li className="font-semibold dark:text-white">
                        {(t.file_type_header || "Type") +
                          `: ${t.type?.video || "Video"} (${videoFiles.length})`}
                      </li>
                      {videoFiles.map((item) => (
                        <SortableItem
                          key={item.id}
                          item={item}
                          onRemove={() => removeFile(item.id, "videos")}
                          removeLabel={t.cancel || "Cancel"}
                        />
                      ))}
                    </>
                  )}
                </ul>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* Upload Button and Cancel Button */}
        <div className="mt-6 flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-md font-semibold bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-700 text-gray-800 dark:text-white transition"
          >
            {t.cancel || "Cancel"}
          </button>
          <button
            onClick={handleUpload}
            disabled={serialOrPN.trim() === "" || uploadStatus === "uploading"}
            className={`px-6 py-2 rounded-md font-semibold ${
              serialOrPN.trim() === "" || uploadStatus === "uploading"
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800"
            } text-white transition`}
          >
            {uploadStatus === "uploading"
              ? t.uploading_button || "Uploading…"
              : t.upload_button || "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileUploadModal;
