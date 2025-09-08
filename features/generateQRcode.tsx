// pages/generateQRcode.tsx
'use client';
import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useLanguage } from '@/components/LanguageSwitcher';
import zhTW from '@/app/data/language/zh-TW.json';
import enUS from '@/app/data/language/en-US.json';
import hiIN from '@/app/data/language/hi.json';
import deDE from '@/app/data/language/de.json';

interface Product {
  id: string;
  name: string;
  model: string;
  brand: string;
  isPropertyManaged: boolean;
  [key: string]: any;
}

interface StockItem {
  id: string;
  productId: string;
  locationId: string;
  currentStatus: 'in_stock' | 'short_term' | 'long_term' | 'discarded';
  discarded: boolean;
  [key: string]: any;
}

interface LocationNode {
  id: string;
  label: string;
  children?: LocationNode[];
}

// Helper: find path from root to targetId in a nested locations tree
function findLocationPath(
  nodes: LocationNode[],
  targetId: string
): LocationNode[] | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return [node];
    }
    if (node.children) {
      const childPath = findLocationPath(node.children, targetId);
      if (childPath) {
        return [node, ...childPath];
      }
    }
  }
  return null;
}

const GenerateQRcode: React.FC = () => {
  const { language } = useLanguage();
  const translationMap: Record<string, any> = {
    'zh-TW': zhTW,
    'en-US': enUS,
    'hi-IN': hiIN,
    de: deDE,
  };
  const translations = translationMap[language] || zhTW;
  const t = translations.QRCodePage;

  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [allStock, setAllStock] = useState<StockItem[]>([]);
  const [locations, setLocations] = useState<LocationNode[]>([]);
  const [propertyManagedProductIds, setPropertyManagedProductIds] = useState<string[]>([]);
  const [propertyManagedProducts, setPropertyManagedProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Fetch products, stock, and locations
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/db');
        if (!res.ok) throw new Error(`Error fetching data: ${res.statusText}`);
        const data = await res.json();
        setAllProducts(data.products as Product[]);
        setPropertyManagedProductIds(
          (data.products as Product[])
            .filter(p => p.isPropertyManaged)
            .map(p => p.id)
        );
        setAllStock((data.stock as StockItem[]).filter(s => !s.discarded && s.currentStatus !== 'discarded'));
        setLocations(data.locations as LocationNode[]);
        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Build list of managed products enriched with details
  useEffect(() => {
    const managedStock = allStock.filter(s => propertyManagedProductIds.includes(s.productId));
    const enriched = managedStock.map(stockItem => {
      const prod = allProducts.find(p => p.id === stockItem.productId) || {};
      return { stockId: stockItem.id, ...stockItem, ...prod };
    });
    setPropertyManagedProducts(enriched);
  }, [allProducts, allStock, propertyManagedProductIds]);

  // QR download helper
  const handleDownloadQRCode = (svg: SVGSVGElement, filename: string) => {
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svg);
    if (!/^<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/.test(source)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!/^<svg[^>]+xmlns:xlink="http:\/\/www.w3.org\/1999\/xlink"/.test(source)) {
      source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }
    source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadClick = (e: React.MouseEvent<HTMLButtonElement>, filename: string) => {
    const container = e.currentTarget.closest('.qr-code-container');
    const svg = container?.querySelector('svg');
    if (svg) handleDownloadQRCode(svg as SVGSVGElement, filename);
  };

  if (loading) return <div className="p-4">{t.loading}...</div>;
  if (error) return <div className="p-4 text-red-500">{t.error}: {error}</div>;

  // Filter logic
  const filteredProducts = allProducts.filter(p =>
    Object.values(p).some(v => v?.toString().toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const filteredManaged = propertyManagedProducts.filter(item =>
    Object.values(item).some(v => v?.toString().toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="max-w-full mx-auto bg-white dark:bg-gray-900 p-8 rounded-lg shadow space-y-6">
      <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white">📱 {t.title}</h1>

      <input
        type="text"
        placeholder={t.searchPlaceholder}
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        className="w-full p-2 border rounded"
      />

      <div className="grid grid-cols-2 gap-8">
        {/* All Products */}
        <div>
          <h2 className="text-xl font-semibold mb-2">{t.allProductsTitle}</h2>
          <div className="border p-4 h-[70vh] overflow-auto">
            {filteredProducts.map((prod: Product) => (
              <div key={prod.id} className="flex items-center mb-4 p-2 border-b last:border-b-0">
                <div className="qr-code-container mr-4 flex flex-col items-center">
                  <QRCodeSVG value={prod.id} size={80} level="H" />
                  <button
                    onClick={e => handleDownloadClick(e, `product_${prod.id}.svg`)}
                    className="mt-2 px-2 py-1 bg-green-500 text-white rounded text-sm"
                  >
                    {t.downloadButton}
                  </button>
                </div>
                <div>
                  <p><strong>{t.productIdLabel}</strong> {prod.id}</p>
                  <p><strong>{t.productNameLabel}</strong> {prod.name}</p>
                  <p><strong>{t.productModelLabel}</strong> {prod.model}</p>
                  <p><strong>{t.productBrandLabel}</strong> {prod.brand}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Managed Products */}
        <div>
          <h2 className="text-xl font-semibold mb-2">{t.managedProductsTitle}</h2>
          <div className="border p-4 h-[70vh] overflow-auto">
            {filteredManaged.map((item: any) => {
              const path = findLocationPath(locations, item.locationId);
              const pathLabel = path?.map(n => n.label).join(' > ') || 'N/A';
              return (
                <div key={item.stockId} className="flex items-center mb-4 p-2 border-b last:border-b-0">
                  <div className="qr-code-container mr-4 flex flex-col items-center">
                    <QRCodeSVG value={item.stockId} size={80} level="H" />
                    <button
                      onClick={e => handleDownloadClick(e, `stock_${item.stockId}.svg`)}
                      className="mt-2 px-2 py-1 bg-green-500 text-white rounded text-sm"
                    >
                      {t.downloadButton}
                    </button>
                  </div>
                  <div>
                    <p><strong>{t.stockIdLabel}</strong> {item.stockId}</p>
                    {item.name && <p><strong>{t.productNameLabel}</strong> {item.name}</p>}
                    {item.model && <p><strong>{t.productModelLabel}</strong> {item.model}</p>}
                    {item.brand && <p><strong>{t.productBrandLabel}</strong> {item.brand}</p>}
                    <p><strong>{t.locationPathLabel}</strong> {pathLabel}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GenerateQRcode;
