// app/api/qa/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Block = { id: string; type: "text" | "image" | "video"; value: string };

function blocksToMd(blocks: Block[] = []) {
  return (
    blocks
      .map((b) =>
        b.type === "text"
          ? b.value || ""
          : b.type === "image"
          ? `![image](${b.value || ""})`
          : `<video controls src="${b.value || ""}" style="max-width:100%"></video>`
      )
      .join("\n\n")
      .trim() + (blocks.length ? "\n" : "")
  );
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // ← params 是 Promise
) {
  const { id } = await ctx.params;         // ← 必須 await
  const body = await req.json().catch(() => null);

  const exists = await prisma.qAItem.findUnique({ where: { id } });
  if (!exists) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data: any = {};
  if (typeof body?.title === "string") data.title = body.title.trim();
  if (Array.isArray(body?.tags))
    data.tags = body.tags.map((t: any) => String(t).trim()).filter(Boolean);
  if (typeof body?.contentMd === "string") data.contentMd = body.contentMd;
  else if (Array.isArray(body?.blocks)) data.contentMd = blocksToMd(body.blocks as Block[]);
  if (typeof body?.order === "number") data.order = body.order;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: true, item: exists }); // 沒東西改就回舊值
  }

  const updated = await prisma.qAItem.update({ where: { id }, data });
  return NextResponse.json({ ok: true, item: updated });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // ← params 是 Promise
) {
  const { id } = await ctx.params;         // ← 必須 await

  const victim = await prisma.qAItem.findUnique({ where: { id } });
  if (!victim) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.qAItem.delete({ where: { id } }),
    prisma.qAItem.updateMany({
      where: { order: { gt: victim.order } },
      data: { order: { decrement: 1 } },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
