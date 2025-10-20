// app/api/devices/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isUUID(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/** 驗證是否已存在：GET /api/devices?id=<uuid> → { exists: boolean } */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim();
  if (!id || !isUUID(id)) {
    return NextResponse.json({ ok: false, message: "Invalid id" }, { status: 400 });
  }
  try {
    const exists = !!(await prisma.device.findUnique({ where: { id } }));
    return NextResponse.json({ ok: true, exists });
  } catch (error) {
    return handlePrismaError("lookup", error);
  }
}

/** 註冊：POST /api/devices  body: { id, name } */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const id = (body?.id || "").trim();
  const name = (body?.name || "").trim();

  if (!id || !isUUID(id)) {
    return NextResponse.json({ ok: false, message: "Invalid id" }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ ok: false, message: "Name is required" }, { status: 400 });
  }

  // 用 upsert 讓這個 API 具備「重送不壞」的特性：已存在就更新名稱
  try {
    const saved = await prisma.device.upsert({
      where: { id },
      update: { name },
      create: { id, name },
      select: { id: true, name: true, createdAt: true },
    });

    return NextResponse.json({ ok: true, device: saved });
  } catch (error) {
    return handlePrismaError("upsert", error);
  }
}

function handlePrismaError(action: "lookup" | "upsert", error: unknown) {
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P1001")
  ) {
    console.error(`Device ${action} failed: database unreachable.`, error);
    return NextResponse.json(
      {
        ok: false,
        message:
          "Database is unavailable. Start the PostgreSQL instance (e.g. `docker compose up -d db`) and try again.",
      },
      { status: 503 },
    );
  }

  console.error(`Device ${action} failed with an unexpected error.`, error);
  return NextResponse.json({ ok: false, message: "Internal server error" }, { status: 500 });
}
