// app/api/sys/maintenance/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), ".runtime");
const STATE_FILE = path.join(DATA_DIR, "maintenance.json");

type State = {
  on: boolean;
  message: string;
  version: number;     // 每次切換+1，方便前端偵測狀態變化
  updatedAt: string;
};

async function readState(): Promise<State> {
  try {
    const buf = await fs.readFile(STATE_FILE, "utf8");
    const s = JSON.parse(buf);
    return {
      on: Boolean(s.on),
      message: String(s.message ?? ""),
      version: Number.isFinite(s.version) ? Number(s.version) : 0,
      updatedAt: String(s.updatedAt ?? new Date().toISOString()),
    };
  } catch {
    return { on: false, message: "", version: 0, updatedAt: new Date().toISOString() };
  }
}

async function writeState(next: Partial<State>) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const cur = await readState();
  const merged: State = {
    on: next.on ?? cur.on,
    message: next.message ?? cur.message,
    version: (typeof next.on === "boolean" && next.on !== cur.on)
      ? cur.version + 1
      : (Number.isFinite(next.version!) ? Number(next.version) : cur.version),
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(STATE_FILE, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

export async function GET() {
  const state = await readState();
  return NextResponse.json(state, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const on =
      typeof body.on === "boolean"
        ? body.on
        : (req.nextUrl.searchParams.get("on") === "1" ||
           req.nextUrl.searchParams.get("on") === "true");
    const message = body.message ?? req.nextUrl.searchParams.get("message") ?? "";
    const next = await writeState({ on, message });
    return NextResponse.json(next);
  } catch (e: any) {
    return new NextResponse(e?.message || "Failed to set maintenance", { status: 500 });
  }
}
