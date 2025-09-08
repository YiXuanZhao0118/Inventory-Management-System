// app/api/rentals/long-term/return/route.ts
import { NextResponse } from "next/server";
import {
  getRentalLogs,
  saveRentalLogs,
  getStock,
  saveStock,
  getProductById,
} from "@/lib/db";

// Payload types
type PMReturnInput = {
  rentedItemId: string;
  returnDate: string; // ISO
};

type NonPMReturnInput = {
  productId: string;
  locationId: string;
  quantity: number;
  renter: string;
  borrower: string;
  loanType: "short_term" | "long_term";
  returnDate: string; // ISO
};

type MixedReturnInput = PMReturnInput | NonPMReturnInput;
const isPM = (i: any): i is PMReturnInput => !!i?.rentedItemId;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // normalize to array
  const items: MixedReturnInput[] = Array.isArray(body) ? body : [body];
  if (items.length === 0) {
    return NextResponse.json({ error: "Empty payload" }, { status: 400 });
  }

  // basic field validation
  for (const [idx, it] of items.entries()) {
    if (isPM(it)) {
      if (!it.rentedItemId || !it.returnDate) {
        return NextResponse.json(
          { error: `Item #${idx + 1}: Missing rentedItemId or returnDate` },
          { status: 400 }
        );
      }
    } else {
      const { productId, locationId, quantity, renter, borrower, loanType, returnDate } =
        it as NonPMReturnInput;
      if (
        !productId ||
        !locationId ||
        typeof quantity !== "number" ||
        quantity < 1 ||
        !renter ||
        !borrower ||
        (loanType !== "short_term" && loanType !== "long_term") ||
        !returnDate
      ) {
        return NextResponse.json(
          {
            error: `Item #${idx + 1}: Missing/invalid fields for non-property return`,
          },
          { status: 400 }
        );
      }
    }
  }

  const logs = getRentalLogs();
  const stockItems = getStock();

  // quick lookups
  const stockById = new Map(stockItems.map((s) => [s.id, s]));
  const recordById = new Map(logs.map((r) => [r.id, r]));

  // ---- Pre-validate & collect targets (no partial commit) ----

  // 1) PM: ensure records exist & outstanding & product is PM & stock ok
  const pmSeen = new Set<string>();
  const pmTargets: Array<{ recId: string; returnDate: string }> = [];

  for (const [idx, it] of items.entries()) {
    if (!isPM(it)) continue;

    const { rentedItemId, returnDate } = it;

    if (pmSeen.has(rentedItemId)) {
      return NextResponse.json(
        { error: `Item #${idx + 1}: Duplicate rentedItemId in payload (${rentedItemId})` },
        { status: 400 }
      );
    }
    pmSeen.add(rentedItemId);

    const rec = recordById.get(rentedItemId);
    if (!rec) {
      return NextResponse.json(
        { error: `Item #${idx + 1}: Rental record not found (${rentedItemId})` },
        { status: 404 }
      );
    }
    if (rec.returnDate) {
      return NextResponse.json(
        { error: `Item #${idx + 1}: Record already returned (${rentedItemId})` },
        { status: 400 }
      );
    }

    const product = getProductById(rec.productId);
    if (!product) {
      return NextResponse.json(
        { error: `Item #${idx + 1}: Product not found for record (${rec.productId})` },
        { status: 404 }
      );
    }
    if (!product.isPropertyManaged) {
      return NextResponse.json(
        { error: `Item #${idx + 1}: Not property-managed; use non-PM fields` },
        { status: 400 }
      );
    }

    const s = stockById.get(rec.stockId);
    if (!s) {
      return NextResponse.json(
        { error: `Item #${idx + 1}: Stock not found (${rec.stockId})` },
        { status: 404 }
      );
    }
    if (s.discarded) {
      return NextResponse.json(
        { error: `Item #${idx + 1}: Stock has been discarded (${rec.stockId})` },
        { status: 400 }
      );
    }

    pmTargets.push({ recId: rentedItemId, returnDate });
  }

  // 2) Non-PM: group by identity key and sum quantities; ensure enough outstanding
  type NonPMKey = string; // productId::locationId::renter::borrower::loanType
  const keyOf = (x: NonPMReturnInput): NonPMKey =>
    `${x.productId}::${x.locationId}::${x.renter}::${x.borrower}::${x.loanType}`;

  // Collect "tasks" in order (to preserve per-item returnDate)
  const nonPMTasks: Array<{ key: NonPMKey; quantity: number; returnDate: string }> = [];
  for (const it of items) {
    if (!isPM(it)) {
      nonPMTasks.push({ key: keyOf(it), quantity: it.quantity, returnDate: it.returnDate });
    }
  }

  // Precompute candidates per key
  const nonPMCandidates = new Map<
    NonPMKey,
    { records: typeof logs; index: number; productId: string; locationId: string }
  >();

  for (const [tIdx, task] of nonPMTasks.entries()) {
    if (nonPMCandidates.has(task.key)) continue;

    const [productId, locationId, renter, borrower, loanType] = task.key.split("::");
    const product = getProductById(productId);
    if (!product) {
      return NextResponse.json(
        { error: `Non-PM task #${tIdx + 1}: Product not found (${productId})` },
        { status: 404 }
      );
    }
    if (product.isPropertyManaged) {
      return NextResponse.json(
        { error: `Non-PM task #${tIdx + 1}: Product is property-managed; use rentedItemId` },
        { status: 400 }
      );
    }

    const candidates = logs.filter(
      (r) =>
        r.productId === productId &&
        r.locationId === locationId &&
        r.renter === renter &&
        r.borrower === borrower &&
        r.loanType === loanType &&
        r.returnDate === null
    );

    // also ensure their stocks exist & not discarded (fail early)
    for (const rec of candidates) {
      const s = stockById.get(rec.stockId);
      if (!s || s.discarded) {
        return NextResponse.json(
          {
            error: `Non-PM task #${tIdx + 1}: Stock invalid for record ${rec.id} (stockId=${rec.stockId})`,
          },
          { status: 400 }
        );
      }
    }

    nonPMCandidates.set(task.key, {
      records: candidates,
      index: 0,
      productId,
      locationId,
    });
  }

  // Validate availability per task (respecting multiple tasks on same key)
  for (const [tIdx, task] of nonPMTasks.entries()) {
    const group = nonPMCandidates.get(task.key)!;
    const remain = group.records.length - group.index;
    if (remain < task.quantity) {
      return NextResponse.json(
        {
          error: `Non-PM task #${tIdx + 1}: Not enough outstanding rentals, requested ${task.quantity}, available ${remain}`,
        },
        { status: 400 }
      );
    }
    // tentatively "consume" slots (no mutation yet)
    group.index += task.quantity;
  }

  // ---- Commit: apply returns & restore stock ----

  // Reset indices for actual commit
  for (const [k, v] of nonPMCandidates) {
    nonPMCandidates.set(k, { ...v, index: 0 });
  }

  const updatedRecords: any[] = [];

  // PM commit
  for (const t of pmTargets) {
    const rec = recordById.get(t.recId)!;
    rec.returnDate = t.returnDate;
    const s = stockById.get(rec.stockId)!;
    s.currentStatus = "in_stock";
    updatedRecords.push(rec);
  }

  // Non-PM commit (preserve per-task returnDate)
  for (const task of nonPMTasks) {
    const group = nonPMCandidates.get(task.key)!;
    for (let i = 0; i < task.quantity; i++) {
      const rec = group.records[group.index++];
      rec.returnDate = task.returnDate;
      const s = stockById.get(rec.stockId)!;
      s.currentStatus = "in_stock";
      updatedRecords.push(rec);
    }
  }

  // persist
  saveStock(stockItems);
  saveRentalLogs(logs);

  return NextResponse.json(updatedRecords, { status: 200 });
}
