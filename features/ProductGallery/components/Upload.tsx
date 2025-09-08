//pages\ProductGallery\components\Upload.tsx
import React, { useState } from 'react';
import FileUploadModal from './FileUploadModal';
import { useLanguage } from '@/components/LanguageSwitcher';
import zhTW from '@/app/data/language/zh-TW.json';
import enUS from '@/app/data/language/en-US.json';
import hiIN from "@/app/data/language/hi.json";
import deDE from "@/app/data/language/de.json";

interface UploadProps {
  productId: string;
}

const Upload: React.FC<UploadProps> = ({ productId }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { language } = useLanguage();
  const translationMap: Record<string, any> = {
    'zh-TW': zhTW,
    'en-US': enUS,
    'hi-IN': hiIN,
    'de': deDE,
  };
  const currentLanguageData = translationMap[language] || zhTW;

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  return (
    <>
      <button
        className="absolute top-2 right-2 bg-gray-800 text-white w-8 h-8 flex items-center justify-center rounded-full opacity-80 hover:opacity-100 transition text-base"
        onClick={openModal}
        title={currentLanguageData.Product.upload_files}
      >
        ⬆️
      </button>

      <FileUploadModal
        isOpen={isModalOpen}
        onClose={closeModal}
        productId={productId}
        currentLanguageData={currentLanguageData}
      />
    </>
  );
};

export default Upload;
