// lib/transferLogs.ts
import fs from 'fs';
import path from 'path';

const TRANSFERLOGS_PATH = path.resolve(process.cwd(), 'app/data/transferLogs.json');

export interface TransferLog {
  id: string;
  stockId: string;
  fromLocation: string;
  toLocation: string;
  date: string;
}

export function getTransferLogs(): TransferLog[] {
  const raw = fs.readFileSync(TRANSFERLOGS_PATH, 'utf-8');
  return JSON.parse(raw) as TransferLog[];
}

export function saveTransferLogs(logs: TransferLog[]): void {
  fs.writeFileSync(TRANSFERLOGS_PATH, JSON.stringify(logs, null, 2), 'utf-8');
}