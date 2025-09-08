// app/api/rentals/long-term/rental/route.ts
import { NextResponse } from "next/server";
import {
  getRentalLogs,
  saveRentalLogs,
  getStock,
  saveStock,
  getProductById,
} from "@/lib/db";
import { v4 as uuid } from "uuid";

type PMInput = {
  stockId: string;
  renter: string;
  borrower: string;
  loanType: "short_term" | "long_term";
  loanDate: string; // ISO
  dueDate: string; // ISO
};

type NonPMInput = {
  productId: string;
  locationId: string;
  quantity: number;
  renter: string;
  borrower: string;
  loanType: "short_term" | "long_term";
  loanDate: string; // ISO
  dueDate: string; // ISO
};

type MixedInput = PMInput | NonPMInput;

function isPM(i: any): i is PMInput {
  return !!i?.stockId;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 正規化成陣列
  const items: MixedInput[] = Array.isArray(body) ? body : [body];
  if (!items.length) {
    return NextResponse.json({ error: "Empty payload" }, { status: 400 });
  }

  // 基本欄位驗證（先檢查輸入格式是否正確）
  for (const [idx, it] of items.entries()) {
    if (isPM(it)) {
      const { stockId, renter, borrower, loanType, loanDate, dueDate } = it;
      if (
        !stockId ||
        !renter ||
        !borrower ||
        (loanType !== "short_term" && loanType !== "long_term") ||
        !loanDate ||
        !dueDate
      ) {
        return NextResponse.json(
          {
            error: `Item #${idx + 1}: Missing or invalid fields for property-managed (stockId=${stockId ?? "null"})`,
          },
          { status: 400 }
        );
      }
    } else {
      const {
        productId,
        locationId,
        quantity,
        renter,
        borrower,
        loanType,
        loanDate,
        dueDate,
      } = it as NonPMInput;
      if (
        !productId ||
        !locationId ||
        typeof quantity !== "number" ||
        quantity < 1 ||
        !renter ||
        !borrower ||
        (loanType !== "short_term" && loanType !== "long_term") ||
        !loanDate ||
        !dueDate
      ) {
        return NextResponse.json(
          {
            error: `Item #${idx + 1}: Missing or invalid fields for non property-managed (productId=${productId ?? "null"}, locationId=${locationId ?? "null"})`,
          },
          { status: 400 }
        );
      }
    }
  }

  // 載入快照
  const logs = getRentalLogs();
  const stockItems = getStock();

  // 用 working copy 模擬「預約」，避免部分成功
  const stockById = new Map(stockItems.map((s) => [s.id, { ...s }]));

  // Non‑PM 的候選清單索引（同一批請求中重複 productId+locationId 時，會逐筆消耗）
  const nonPMKey = (pid: string, lid: string) => `${pid}::${lid}`;
  const pickers = new Map<string, { list: string[]; index: number }>();

  // —— 第一輪：預檢查與暫存預約 —— //
  for (const [idx, it] of items.entries()) {
    if (isPM(it)) {
      // 財產（單筆）
      const s = stockById.get(it.stockId);
      if (!s) {
        return NextResponse.json(
          { error: `Item #${idx + 1}: Stock not found (stockId=${it.stockId})` },
          { status: 404 }
        );
      }
      if (s.discarded) {
        return NextResponse.json(
          { error: `Item #${idx + 1}: Stock has been discarded (stockId=${it.stockId})` },
          { status: 400 }
        );
      }

      const product = getProductById(s.productId);
      if (!product) {
        return NextResponse.json(
          {
            error: `Item #${idx + 1}: Product not found for stock.productId=${s.productId}`,
          },
          { status: 404 }
        );
      }
      if (!product.isPropertyManaged) {
        return NextResponse.json(
          {
            error: `Item #${idx + 1}: Not property-managed; use nonPM fields (stockId=${it.stockId})`,
          },
          { status: 400 }
        );
      }
      if (s.currentStatus !== "in_stock") {
        return NextResponse.json(
          { error: `Item #${idx + 1}: Stock not available (stockId=${it.stockId})` },
          { status: 400 }
        );
      }

      // 暫時保留
      s.currentStatus = it.loanType;
    } else {
      // 非財產（多筆數量）
      const { productId, locationId, quantity, loanType } = it as NonPMInput;

      const product = getProductById(productId);
      if (!product) {
        return NextResponse.json(
          {
            error: `Item #${idx + 1}: Product not found (productId=${productId})`,
          },
          { status: 404 }
        );
      }
      if (product.isPropertyManaged) {
        return NextResponse.json(
          {
            error: `Item #${idx + 1}: Product is property-managed; use stockId (productId=${productId})`,
          },
          { status: 400 }
        );
      }

      if (productId.length < 24) {
        return NextResponse.json({ error: `Invalid productId format (did you split by "-" instead of "::"?)` }, { status: 400 });
      }
      
      const key = nonPMKey(productId, locationId);
      if (!pickers.has(key)) {
        const list = stockItems
          .filter(
            (s) =>
              s.productId === productId &&
              s.locationId === locationId &&
              s.currentStatus === "in_stock" &&
              !s.discarded
          )
          .map((s) => s.id);
        pickers.set(key, { list, index: 0 });
      }

      const picker = pickers.get(key)!;
      const remain = picker.list.length - picker.index;
      if (remain < quantity) {
        return NextResponse.json(
          {
            error: `Item #${idx + 1}: Not enough stock, requested ${quantity}, available ${remain} (productId=${productId}, locationId=${locationId})`,
          },
          { status: 400 }
        );
      }

      // 暫時保留 N
      for (let i = 0; i < quantity; i++) {
        const sid = picker.list[picker.index++];
        const s = stockById.get(sid)!;
        s.currentStatus = loanType;
      }
    }
  }

  // —— 第二輪：落庫 + 建立紀錄 —— //
  const updatedStockArray = stockItems.map((orig) => {
    const w = stockById.get(orig.id);
    return w ? w : orig;
  });

  const newRecords: any[] = [];

  // 為了讓 Non‑PM 的紀錄與第一輪保留一致，重建 picker 指標
  const recordPickers = new Map<string, { list: string[]; index: number }>();
  for (const [k, v] of pickers) {
    recordPickers.set(k, { list: [...v.list], index: 0 });
  }

  for (const it of items) {
    if (isPM(it)) {
      const s = stockById.get(it.stockId)!;
      newRecords.push({
        id: uuid(),
        stockId: s.id,
        productId: s.productId,
        locationId: s.locationId,
        renter: it.renter,
        borrower: it.borrower,
        loanType: it.loanType,
        loanDate: it.loanDate,
        dueDate: it.dueDate,
        returnDate: null,
      });
    } else {
      const {
        productId,
        locationId,
        quantity,
        renter,
        borrower,
        loanType,
        loanDate,
        dueDate,
      } = it as NonPMInput;

      const picker = recordPickers.get(nonPMKey(productId, locationId))!;
      for (let i = 0; i < quantity; i++) {
        const sid = picker.list[picker.index++];
        const s = stockById.get(sid)!;
        newRecords.push({
          id: uuid(),
          stockId: s.id,
          productId,
          locationId,
          renter,
          borrower,
          loanType,
          loanDate,
          dueDate,
          returnDate: null,
        });
      }
    }
  }

  // 永久化
  saveStock(updatedStockArray);
  logs.push(...newRecords);
  saveRentalLogs(logs);

  return NextResponse.json(newRecords, { status: 201 });
}