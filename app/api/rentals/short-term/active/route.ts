// app/api/rentals/short-term/active/route.ts
import { NextResponse } from "next/server";
import { getRentalLogs, getProducts, getStock, getLocationTree } from "@/lib/db";

function buildPathMap(locations: any[]) {
  const map = new Map<string, string[]>();
  const dfs = (node: any, trail: string[]) => {
    const next = [...trail, node.label];
    map.set(node.id, next);
    node.children?.forEach((c: any) => dfs(c, next));
  };
  locations?.forEach((root: any) => dfs(root, []));
  return map;
}

export async function GET() {
  const logs = getRentalLogs();
  const products = getProducts();
  const stock = getStock();
  const locations = getLocationTree();
  const pathMap = buildPathMap(locations);

  const prodMap = new Map(products.map((p: any) => [p.id, p]));
  const stockMap = new Map(stock.map((s: any) => [s.id, s]));

  const items = logs
    .filter((l: any) => l.loanType === "short_term" && !l.returnDate)
    .map((l: any) => {
      const s = stockMap.get(l.stockId);
      const p = s ? prodMap.get(s.productId) : null;
      return {
        id: l.id,
        stockId: l.stockId,
        product: p ? { id: p.id, name: p.name, model: p.model, brand: p.brand } : { id: "", name: "", model: "", brand: "" },
        locationId: s?.locationId ?? "",
        locationPath: s ? (pathMap.get(s.locationId) ?? []) : [],
        borrowerId: l.borrower,
        borrower: l.borrower,
        loanDate: l.loanDate,
        dueDate: l.dueDate,
      };
    });

  return NextResponse.json({ items });
}
