// app/api/qa/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Block = { id: string; type: "text" | "image" | "video"; value: string };

const nid = () =>
  "qa_" + Date.now().toString(36) + crypto.randomBytes(4).toString("hex");

function blocksToMd(blocks: Block[] = []): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (b.type === "text") parts.push(b.value || "");
    else if (b.type === "image") parts.push(`![image](${b.value || ""})`);
    else if (b.type === "video")
      parts.push(
        `<video controls src="${b.value || ""}" style="max-width:100%"></video>`
      );
  }
  return parts.join("\n\n").trim() + (parts.length ? "\n" : "");
}

export async function GET() {
  const list = await prisma.qAItem.findMany({
    orderBy: { order: "asc" },
  });
  // 維持舊介面形狀：{ items: [...] }
  return NextResponse.json({ items: list });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const { _max } = await prisma.qAItem.aggregate({ _max: { order: true } });
  const nextOrder = (_max.order ?? -1) + 1;

  const contentMd =
    typeof body.contentMd === "string"
      ? body.contentMd
      : Array.isArray(body.blocks)
      ? blocksToMd(body.blocks as Block[])
      : String(body.content ?? "");

  const created = await prisma.qAItem.create({
    data: {
      id: nid(),
      title: body.title.trim(),
      tags: Array.isArray(body.tags)
        ? body.tags.map((t: any) => String(t).trim()).filter(Boolean)
        : [],
      order: nextOrder,
      contentMd,
    },
  });

  return NextResponse.json({ ok: true, item: created });
}
