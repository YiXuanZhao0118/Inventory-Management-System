// lib/iams.ts
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'app', 'data');
const FILE = 'iams_property.json';
const FILE_PATH = path.join(DATA_DIR, FILE);

export interface IAMSPropertyItem {
  stockid: string;
  IAMSID: string;
}

export function getIAMSProperty(): IAMSPropertyItem[] {
  try {
    const raw = fs.readFileSync(FILE_PATH, 'utf-8');
    return JSON.parse(raw) as IAMSPropertyItem[];
  } catch (e: any) {
    if (e?.code === 'ENOENT') return [];
    throw e;
  }
}

export function saveIAMSProperty(data: IAMSPropertyItem[]): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
