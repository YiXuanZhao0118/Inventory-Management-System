import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resetCompleteSchema } from "@/lib/validation";
import { verifyResetTicket } from "@/lib/ticket";
import { hashPassword } from "@/lib/hash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readJsonSafe(req: NextRequest) {
  try { return await req.json(); } catch { return null; }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await readJsonSafe(req);
    if (!raw) return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });

    // 這個 schema 會幫你比對 newPassword / confirm 是否一致
    const { ticket, newPassword } = resetCompleteSchema.parse(raw);

    const { email, userId } = await verifyResetTicket<{ email: string; userId: string }>(ticket);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.email !== email) {
      return NextResponse.json({ ok: false, message: "Invalid ticket" }, { status: 400 });
    }

    const newHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Complete reset failed" }, { status: 400 });
  }
}
