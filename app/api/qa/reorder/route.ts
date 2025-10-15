// app/api/qa/reorder/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const ids = (body?.ids ?? []) as string[];
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids[] required" }, { status: 400 });
  }

  // 只更新有給到的 ids，其他保留在後面（維持舊行為）
  const existing = await prisma.qAItem.findMany({
    select: { id: true, order: true },
  });
  const set = new Set(ids);
  const rest = existing
    .filter((x) => !set.has(x.id))
    .sort((a, b) => a.order - b.order)
    .map((x) => x.id);

  const finalOrder = [...ids, ...rest];

  // 用 transaction 一次性寫入新排序
  await prisma.$transaction(
    finalOrder.map((id, idx) =>
      prisma.qAItem.update({
        where: { id },
        data: { order: idx },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
