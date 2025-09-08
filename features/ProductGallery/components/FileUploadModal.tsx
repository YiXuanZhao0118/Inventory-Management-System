import React, { useState, useRef, ChangeEvent, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface FileUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  currentLanguageData: any;
}

interface FileItem {
  id: string;
  name: string;
  type: string;
  size: number;
  preview?: string;
  originalFile: File;
}

function SortableItem({ item, onRemove }: { item: FileItem; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'none',
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center border p-2 rounded dark:border-gray-700 dark:bg-gray-750"
    >
      {item.preview && <img src={item.preview} className="w-12 h-12 object-cover rounded mr-4" />}
      <span {...attributes} {...listeners} className="flex-1 truncate cursor-grab dark:text-gray-300">
        {item.name}
      </span>
      <button onClick={onRemove} className="ml-2 text-red-500 cursor-pointer">
        ✕
      </button>
    </li>
  );
}

const FileUploadModal: React.FC<FileUploadModalProps> = ({ isOpen, onClose, productId, currentLanguageData }) => {
  // State and refs
  const [imageFiles, setImageFiles] = useState<FileItem[]>([]);
  const [docFiles, setDocFiles] = useState<FileItem[]>([]);
  const [videoFiles, setVideoFiles] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [serialOrPN, setSerialOrPN] = useState('');
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
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
      setSerialOrPN('');
      setUploadStatus('idle');
      setUploadMessage(null);
    }
  }, [isOpen]);

  // Early return if closed
  if (!isOpen) return null;

  const handleFiles = (files: FileList) => {
    console.log('Handling files:', files);
    setUploadStatus('idle');
    setUploadMessage(null);
    const filesArray: FileItem[] = Array.from(files)
      .filter(file => typeof file.name === 'string' && typeof file.type === 'string')
      .map(file => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        name: file.name,
        type: file.type,
        size: file.size,
        preview: undefined,
        originalFile: file,
      }));
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp', '.heic', '.svg', '.raw', '.cr2', '.nef', '.arw', '.ico', '.psd', '.ai', '.eps'];
    const pdfExtensions = ['.pdf', '.docx', '.doc', '.txt', '.rtf', '.odt', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.md', '.html', '.xml', '.json', '.epub', '.tex'];
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.webm', '.mpeg', '.mpg', '.3gp', '.ts', '.m4v', '.ogv'];
    const imageFilesNew = filesArray.filter(item => item.type.startsWith('image/') || imageExtensions.some(ext => item.name.toLowerCase().endsWith(ext)));
    const pdfFilesNew = filesArray.filter(item => item.type === 'application/pdf' || pdfExtensions.some(ext => item.name.toLowerCase().endsWith(ext)));
    const videoFilesNew = filesArray.filter(item => item.type.startsWith('video/') || videoExtensions.some(ext => item.name.toLowerCase().endsWith(ext)));
    imageFilesNew.forEach(item => {
      const reader = new FileReader();
      reader.onload = e => {
        item.preview = e.target?.result as string;
        setImageFiles(prev => [...prev, item]);
      };
      reader.readAsDataURL(item.originalFile);
    });
    setDocFiles(prev => [...prev, ...pdfFilesNew]);
    setVideoFiles(prev => [...prev, ...videoFilesNew]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    setImageFiles(prev => {
      const oldIndex = prev.findIndex(f => f.id === activeId);
      const newIndex = prev.findIndex(f => f.id === overId);
      return oldIndex < 0 || newIndex < 0 ? prev : arrayMove(prev, oldIndex, newIndex);
    });
    setDocFiles(prev => {
      const oldIndex = prev.findIndex(f => f.id === activeId);
      const newIndex = prev.findIndex(f => f.id === overId);
      return oldIndex < 0 || newIndex < 0 ? prev : arrayMove(prev, oldIndex, newIndex);
    });
    setVideoFiles(prev => {
      const oldIndex = prev.findIndex(f => f.id === activeId);
      const newIndex = prev.findIndex(f => f.id === overId);
      return oldIndex < 0 || newIndex < 0 ? prev : arrayMove(prev, oldIndex, newIndex);
    });
  };

  const removeFile = (id: string, type: 'images' | 'docs' | 'videos') => {
    if (type === 'images') setImageFiles(prev => prev.filter(f => f.id !== id));
    if (type === 'docs') setDocFiles(prev => prev.filter(f => f.id !== id));
    if (type === 'videos') setVideoFiles(prev => prev.filter(f => f.id !== id));
    setUploadStatus('idle');
    setUploadMessage(null);
  };

  const handleUpload = async () => {
    setUploadStatus('uploading');
    setUploadMessage(null);
    const formData = new FormData();
    formData.append('productId', productId);
    formData.append('serialOrPN', serialOrPN);
    const fileMetadata = [
      ...imageFiles.map((file, index) => ({ name: file.name, category: 'Figure', order: index + 1 })),
      ...docFiles.map((file, index) => ({ name: file.name, category: 'Documents', order: index + 1 })),
      ...videoFiles.map((file, index) => ({ name: file.name, category: 'Video', order: index + 1 })),
    ];
    imageFiles.forEach(item => formData.append('files', item.originalFile, item.name));
    docFiles.forEach(item => formData.append('files', item.originalFile, item.name));
    videoFiles.forEach(item => formData.append('files', item.originalFile, item.name));
    formData.append('fileMetadata', JSON.stringify(fileMetadata));
    try {
      const response = await fetch('/api/upload_product_files', { method: 'POST', body: formData });
      if (response.ok) {
        setUploadStatus('success');
        setUploadMessage(currentLanguageData?.FileUploadModal?.upload_success || '上傳成功！');
        onClose();
      } else {
        const errorText = await response.text();
        setUploadStatus('error');
        setUploadMessage(`${currentLanguageData?.FileUploadModal?.upload_error || '上傳失敗：'}${errorText}`);
      }
    } catch (error: any) {
      setUploadStatus('error');
      setUploadMessage(`${currentLanguageData?.FileUploadModal?.upload_error || '上傳失敗：'}${error.message}`);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50"
      onContextMenu={e => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col dark:bg-gray-800">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold dark:text-white">{currentLanguageData?.FileUploadModal?.title?.replace('{{productId}}', productId) || `上傳產品檔案 (${productId})`}</h2>
        </div>

        {uploadMessage && (
          <div className={`mb-4 text-center font-medium ${uploadStatus === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{uploadMessage}</div>
        )}

        <div className="mb-4">
          <label htmlFor="serialOrPN" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {currentLanguageData?.FileUploadModal?.serial_or_pn_label || '序號 / 料號 (Serial Num / P/N):'}
          </label>
          <input
            type="text"
            id="serialOrPN"
            value={serialOrPN}
            onChange={e => setSerialOrPN(e.target.value)}
            className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder={currentLanguageData?.FileUploadModal?.serial_or_pn_placeholder || '請輸入序號或料號'}
          />
        </div>

        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer ${isDragging ? 'border-blue-500' : 'border-gray-300'} dark:border-gray-600 dark:text-gray-400`}
          onDragOver={e => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files) {
              handleFiles(e.dataTransfer.files);
            }
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            multiple
            onChange={e => e.target.files && handleFiles(e.target.files)}
            className="hidden"
          />
          {currentLanguageData?.FileUploadModal?.dropzone_text || '將檔案拖放到此處，或點擊選擇檔案'}
        </div>

        {/* File List */}
        {(imageFiles.length > 0 || docFiles.length > 0 || videoFiles.length > 0) && (
          <div className="mt-6 max-h-60 overflow-y-auto">
            <h3 className="text-lg font-medium mb-2 dark:text-white">{currentLanguageData?.FileUploadModal?.file_list_header || '檔案列表:'}</h3>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={[...imageFiles, ...docFiles, ...videoFiles]} strategy={verticalListSortingStrategy}>
                <ul className="space-y-2">
                  {imageFiles.length > 0 && (
                    <>
                      <li className="font-semibold dark:text-white">{(currentLanguageData?.FileUploadModal?.file_type_header || '檔案類型')}: Image ({imageFiles.length})</li>
                      {imageFiles.map(item => (
                        <SortableItem key={item.id} item={item} onRemove={() => removeFile(item.id, 'images')} />
                      ))}
                    </>
                  )}
                  {docFiles.length > 0 && (
                    <>
                      <li className="font-semibold dark:text-white">{(currentLanguageData?.FileUploadModal?.file_type_header || '檔案類型')}: Document ({docFiles.length})</li>
                      {docFiles.map(item => (
                        <SortableItem key={item.id} item={item} onRemove={() => removeFile(item.id, 'docs')} />
                      ))}
                    </>
                  )}
                  {videoFiles.length > 0 && (
                    <>
                      <li className="font-semibold dark:text-white">{(currentLanguageData?.FileUploadModal?.file_type_header || '檔案類型')}: Video ({videoFiles.length})</li>
                      {videoFiles.map(item => (
                        <SortableItem key={item.id} item={item} onRemove={() => removeFile(item.id, 'videos')} />
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
            {currentLanguageData?.FileUploadModal?.cancel || '取消'}
          </button>
          <button
            onClick={handleUpload}
            disabled={serialOrPN.trim() === '' || uploadStatus === 'uploading'}
            className={`px-6 py-2 rounded-md font-semibold ${serialOrPN.trim() === '' || uploadStatus === 'uploading' ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800'} text-white transition`}
          >
            {uploadStatus === 'uploading' ? (currentLanguageData?.FileUploadModal?.uploading_button || '上傳中...') : (currentLanguageData?.FileUploadModal?.upload_button || '上傳')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileUploadModal;