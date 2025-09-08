//pages\ProductGallery\components\ViewSpec.tsx
import React, { useState } from 'react';
import useSWR from 'swr';
import { useLanguage } from '@/components/LanguageSwitcher';
import zhTW from '@/app/data/language/zh-TW.json';
import enUS from '@/app/data/language/en-US.json';
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";
import { useRouter } from 'next/navigation';

const fetcher = (url: string) =>
  fetch(url).then(res => {
    if (!res.ok) throw new Error(res.statusText);
    return res.json();
  });
  
interface FileItem {
  name: string;
  type: 'file' | 'folder';
  path: string;
}

interface ViewSpecProps {
  productId: string;
  onClose: () => void;
}

const ViewSpec: React.FC<ViewSpecProps> = ({ productId, onClose }) => {
  const { language } = useLanguage();
  const translationMap: Record<string, any> = {
    "zh-TW": zhTW,
    "en-US": enUS,
    "hi-IN": hiIN,
    "de": deDE,
  };
  const translations = translationMap[language] || zhTW;
  const t = (translations as any)?.ViewSpec || {};

  const [currentPath, setCurrentPath] = useState<string>('/');
  const router = useRouter();

  // 取得目前路徑的檔案/資料夾
  const { data, error, isLoading } = useSWR<{ files: FileItem[] }>(
    `/api/list_product_files?productId=${productId}&path=${encodeURIComponent(currentPath)}`,
    fetcher
  );

  // 返回上一層
  const goUp = () => {
    if (currentPath === '/' || currentPath === '') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath('/' + parts.join('/') + (parts.length > 0 ? '/' : ''));
  };

  // 雙擊進入資料夾
  const handleDoubleClick = (item: FileItem) => {
    if (item.type === 'folder') {
      let newPath = item.path;
      if (!newPath.startsWith('/')) newPath = '/' + newPath;
      if (!newPath.endsWith('/')) newPath += '/';
      setCurrentPath(newPath);
    } else if (item.type === 'file') {
      const fileUrl = `/product_files/${productId}${item.path}`;
      if (item.name.toLowerCase().endsWith('.pdf')) {
        window.open(fileUrl, '_blank');
      } else if (
        item.name.toLowerCase().endsWith('.png') ||
        item.name.toLowerCase().endsWith('.jpg') ||
        item.name.toLowerCase().endsWith('.jpeg') ||
        item.name.toLowerCase().endsWith('.gif') ||
        item.name.toLowerCase().endsWith('.bmp') ||
        item.name.toLowerCase().endsWith('.webp')
      ) {
        window.open(fileUrl, '_blank');
      } else if (
        item.name.toLowerCase().endsWith('.mp4') ||
        item.name.toLowerCase().endsWith('.mov') ||
        item.name.toLowerCase().endsWith('.avi') ||
        item.name.toLowerCase().endsWith('.wmv') ||
        item.name.toLowerCase().endsWith('.mkv') ||
        item.name.toLowerCase().endsWith('.webm')
      ) {
        window.open(fileUrl, '_blank');
      }
      // 你可以在這裡加上其他檔案類型的處理
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col dark:bg-gray-800">
        <h2 className="text-xl font-bold mb-4 dark:text-white">
          {t?.title?.replace('{{productId}}', productId) || `產品規格與檔案 (產品ID: ${productId})`}
        </h2>
        <div className="flex-1 overflow-y-auto">
          <div className="mb-2 flex items-center space-x-2">
            <button
              onClick={goUp}
              disabled={currentPath === '/' || currentPath === ''}
              className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-xs"
            >
              ⬆ {t?.up || '上一層'}
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-300">{currentPath}</span>
          </div>
          {error && <p className="text-red-600 dark:text-red-400">{t?.load_error || '載入檔案失敗'}: {error.message}</p>}
          {isLoading && <p className="dark:text-gray-300">{t?.loading?.replace('{{productId}}', productId) || `正在載入產品 ${productId} 的規格和檔案...`}</p>}
          {data?.files && data.files.length === 0 && <p className="dark:text-gray-300">{t?.no_files || '此產品沒有相關檔案。'}</p>}

          {data?.files && data.files.length > 0 && (
            <ul className="space-y-2">
              <li className="font-semibold dark:text-white">{t?.file_list_header || '檔案列表'}:</li>
              {data.files.map((item, idx) => (
                <li
                  key={item.path ? item.path : `${item.name}-${idx}`}
                  className={`dark:text-gray-300 cursor-pointer select-none px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center`}
                  onDoubleClick={() => handleDoubleClick(item)}
                  title={item.type === 'folder' ? t?.open_folder || '開啟資料夾' : undefined}
                >
                  {item.type === 'folder' ? '📁' : '📄'}&nbsp;{item.name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-4 text-right">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-md font-semibold bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-700 text-gray-800 dark:text-white transition"
          >
            {t?.close_button || '關閉'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewSpec;
