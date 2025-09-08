// app/api/rentals/short-term/available/route.ts
import { NextResponse } from "next/server";
import { getStock, getProducts, getLocationTree, getRentalLogs } from "@/lib/db";

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
  const stock = getStock();
  const products = getProducts();
  const locations = getLocationTree();
  const logs = getRentalLogs();
  const pathMap = buildPathMap(locations);

  const prodMap = new Map(products.map((p: any) => [p.id, p]));
  const active = new Set(
    logs.filter((l: any) => l.loanType === "short_term" && !l.returnDate).map((l: any) => l.stockId)
  );

  const items = stock
    .filter((s: any) =>
      s.currentStatus === "in_stock" &&
      s.discarded !== true &&
      !active.has(s.id) &&
      prodMap.get(s.productId)?.isPropertyManaged === true
    )
    .map((s: any) => {
      const p = prodMap.get(s.productId);
      return {
        stockId: s.id,
        product: { id: p.id, name: p.name, model: p.model, brand: p.brand },
        locationId: s.locationId,
        locationPath: pathMap.get(s.locationId) ?? [],
      };
    });

  return NextResponse.json({ items });
}
