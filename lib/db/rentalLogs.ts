// lib/rentalLogs.ts
import fs from 'fs';
import path from 'path';

const RENTALLOGS_PATH = path.resolve(process.cwd(), 'app/data/rentalLogs.json');

export interface RentedItem {
  id: string;
  stockId: string;
  productId: string;
  locationId: string;
  renter: string;
  borrower: string;
  loanType: 'short_term' | 'long_term';
  loanDate: string;
  dueDate: string;
  returnDate: string | null;
}

export function getRentalLogs(): RentedItem[] {
  try {
    const raw = fs.readFileSync(RENTALLOGS_PATH, 'utf-8');
    return JSON.parse(raw) as RentedItem[];
  } catch {
    return [];
  }
}

export function saveRentalLogs(logs: RentedItem[]): void {
  fs.writeFileSync(RENTALLOGS_PATH, JSON.stringify(logs, null, 2), 'utf-8');
}