// scripts/sortProducts.js (ESM)
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(process.cwd(), 'app', 'data', 'database.json');

function isASCII(str) {
  return /^[\x00-\x7F]*$/.test(str || '');
}
function sortByName(a, b) {
  const aEng = isASCII(a?.name ?? '');
  const bEng = isASCII(b?.name ?? '');
  if (aEng && !bEng) return -1;
  if (!aEng && bEng) return 1;
  const locale = aEng ? 'en' : 'zh';
  return String(a?.name ?? '').localeCompare(String(b?.name ?? ''), locale);
}

export async function sortProductsInPlace(dbPath = DB_PATH) {
  const raw = await fs.readFile(dbPath, 'utf-8');
  const data = JSON.parse(raw);
  const products = Array.isArray(data.products) ? [...data.products] : [];

  const groups = {};
  for (const prod of products) {
    const rawBrand = String(prod?.brand ?? '').trim();
    const brand = rawBrand === '' ? '-' : rawBrand;
    (groups[brand] ||= []).push(prod);
  }

  const dashGroup = groups['-'] ?? [];
  delete groups['-'];

  const brands = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
  for (const br of brands) groups[br].sort(sortByName);
  dashGroup.sort(sortByName);

  const sorted = brands.flatMap(b => groups[b]).concat(dashGroup);
  data.products = sorted;

  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf-8');
}

// 允許用 node 直接跑：node scripts/sortProducts.js
if (import.meta.url === pathToFileURL(__filename).href) {
  sortProductsInPlace().then(() => {
    console.log('Products sorted.');
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
