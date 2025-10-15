// app/api/rentals/long-term/loan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type LoanPMGroup =
  | { stockIds: string[]; borrower: string; renter?: string | null }
  | { stockId: string; borrower: string; renter?: string | null }; // 也接受單支

type LoanNonPMRow = {
  productId: string;
  locationId: string;
  quantity: number;
  borrower: string;
  renter?: string | null;
};

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const loanDate = body?.loanDate ? new Date(body.loanDate) : new Date();
  const dueDate = body?.dueDate ? new Date(body.dueDate) : null;

  const pmGroups = (body?.PropertyManaged ?? []) as LoanPMGroup[];
  const nonRows = (body?.nonPropertyManaged ?? []) as LoanNonPMRow[];

  const details: Array<{ stockId: string; ok: boolean; message?: string }> = [];
  let moved = 0;

  await prisma.$transaction(async (tx) => {
    // ----- PM -----
    for (const g of pmGroups) {
      const stockIds: string[] = Array.isArray((g as any).stockIds)
        ? (g as any).stockIds
        : (g as any).stockId
        ? [(g as any).stockId]
        : [];

      for (const sid of stockIds) {
        const s = await tx.stock.findUnique({
          where: { id: sid },
          select: {
            id: true,
            productId: true,
            locationId: true,
            currentStatus: true,
            discarded: true,
            product: { select: { isPropertyManaged: true } },
          },
        });

        if (!s) {
          details.push({ stockId: sid, ok: false, message: "Stock not found" });
          continue;
        }
        if (s.discarded) {
          details.push({ stockId: sid, ok: false, message: "Stock discarded" });
          continue;
        }
        if (!s.product.isPropertyManaged) {
          details.push({ stockId: sid, ok: false, message: "Not PM item" });
          continue;
        }
        if (s.currentStatus !== "in_stock") {
          details.push({ stockId: sid, ok: false, message: `Not in_stock (${s.currentStatus})` });
          continue;
        }

        await tx.stock.update({ where: { id: sid }, data: { currentStatus: "long_term" } });
        await tx.rental.create({
          data: {
            stockId: s.id,
            productId: s.productId,
            locationId: s.locationId,
            borrower: g.borrower ?? "",
            renter: g.renter ?? null,
            loanType: "long_term",
            loanDate,
            dueDate,
          },
        });

        moved++;
        details.push({ stockId: sid, ok: true });
      }
    }

    // ----- Non-PM -----
    for (const r of nonRows) {
      const want = Math.max(0, Number(r.quantity) || 0);
      if (!want) continue;

      // 選出 Non-PM、在庫的 stock N 支
      const stocks = await tx.stock.findMany({
        where: {
          productId: r.productId,
          locationId: r.locationId,
          currentStatus: "in_stock",
          discarded: false,
          product: { is: { isPropertyManaged: false } },
        },
        orderBy: { createdAt: "asc" },
        take: want,
        select: { id: true, productId: true, locationId: true },
      });

      for (const s of stocks) {
        await tx.stock.update({ where: { id: s.id }, data: { currentStatus: "long_term" } });
        await tx.rental.create({
          data: {
            stockId: s.id,
            productId: s.productId,
            locationId: s.locationId,
            borrower: r.borrower ?? "",
            renter: r.renter ?? null,
            loanType: "long_term",
            loanDate,
            dueDate,
          },
        });
        moved++;
        details.push({ stockId: s.id, ok: true });
      }

      if (stocks.length < want) {
        details.push({
          stockId: `${r.productId}@${r.locationId}`,
          ok: false,
          message: `Only ${stocks.length}/${want} available`,
        });
      }
    }
  });

  return NextResponse.json({ ok: true, moved, details });
}
