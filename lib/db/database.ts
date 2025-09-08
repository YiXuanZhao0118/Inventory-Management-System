// lib/database.ts
import fs from 'fs';
import path from 'path';

const DATABASE_PATH = path.resolve(process.cwd(), 'app/data/database.json');

export interface DiscardLog {
  date: string;
  reason: string;
  operator: string;
}

export interface StockItem {
  id: string;
  productId: string;
  locationId: string;
  currentStatus: 'in_stock' | 'short_term' | 'long_term' | 'discarded';
  createdAt: string;     
  discarded: boolean;
  discardLog: DiscardLog | null;
}

export interface ProductItem {
  id: string;
  name: string;
  brand: string;
  model: string;
  specifications: string;
  price: number;
  imageLink: string;
  localImage: string | null;
  isPropertyManaged: boolean;
}

export interface LocationNode {
  id: string;
  label: string;
  children?: LocationNode[];
}

export interface Database {
  stock: StockItem[];
  products: ProductItem[];
  locationTree: LocationNode[];
}

export function saveDatabase(db: Database): void {
  fs.writeFileSync(
    DATABASE_PATH,
    JSON.stringify(db, null, 2),
    'utf-8'
  );
}

export function getDatabase(): Database {
  try {
    const raw = fs.readFileSync(DATABASE_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return data as Database;
  } catch {
    return {
      stock: [],
      products: [],
      locationTree: []
    };
  }
}

export function getStock(): StockItem[] {
  return getDatabase().stock;
}

export function saveStock(stock: StockItem[]): void {
  const db = getDatabase();
  db.stock = stock;
  saveDatabase(db);

}

export function getProducts(): ProductItem[] {
  return getDatabase().products;
}

export function saveProducts(products: ProductItem[]): void {
  const db = getDatabase();
  db.products = products;
  saveDatabase(db);
}

export function getLocationTree(): LocationNode[] {
  return getDatabase().locationTree;
}

export function saveLocationTree(tree: LocationNode[]): void {
  const db = getDatabase();
  db.locationTree = tree;
  saveDatabase(db);
}