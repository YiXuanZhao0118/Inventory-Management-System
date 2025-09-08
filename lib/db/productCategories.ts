// lib/productCategories.ts
import fs from "fs";
import path from "path";

const PRODUCTCATEGORIES_PATH = path.resolve(process.cwd(), "app/data/productCategories.json");

export interface ProductCategory {
  id: string;
  name: string;
  productIds: string[];
}

function ensureFile() {
  const dir = path.dirname(PRODUCTCATEGORIES_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(PRODUCTCATEGORIES_PATH)) {
    fs.writeFileSync(PRODUCTCATEGORIES_PATH, JSON.stringify([], null, 2), "utf-8");
  }
}

export function getProductCategories(): ProductCategory[] {
  try {
    ensureFile();
    const raw = fs.readFileSync(PRODUCTCATEGORIES_PATH, "utf-8");
    return JSON.parse(raw) as ProductCategory[];
  } catch {
    return [];
  }
}

export function saveProductCategories(categories: ProductCategory[]): void {
  ensureFile();
  fs.writeFileSync(PRODUCTCATEGORIES_PATH, JSON.stringify(categories, null, 2), "utf-8");
}
