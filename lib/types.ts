// lib\types.ts
export interface ProductLiteWithLocal {
  id: string;
  name: string;
  model: string;
  brand: string;
  specifications: string;
  imageLink: string;
  localImage?: string | null;
}

export interface ProductCategory {
  id: string;
  name: string;
  productIds: string[];
}

export interface ShortTermRetrievalView {
  id: string;
  stockId: string;
  product: { id: string; name: string; model: string; brand: string };
  locationId: string;
  locationPath: string[];
  borrowerId: string;     // 裝置 ID
  borrower: string;       // 後端記錄的 borrower 顯示字串（可能等於裝置 ID）
  loanDate: string;       // ISO
  dueDate: string;        // ISO
}

export type AdminProduct = {
  id: string;
  name: string;
  brand: string;
  model: string;
  specifications: string;
  price: number;
  imageLink: string;   
  localImage: string | null; 
};

export type ProductForm = {
  name: string;
  brand: string;
  model: string;
  specifications: string;
  price: number;
  imageLink: string;
  localImage: string | null;
};

export interface ReturnItem {
  id?: string;
  stockId: string;
  product: { id: string; name: string; model: string; brand: string; spec: string };
  locationId: string;
  locationPath: string[];
  renter: string;
  borrower: string;
  loanDate: string;
  dueDate: string;
  qty?: number;
  isPropertyManaged: boolean;
  loanType: "long_term";
}
