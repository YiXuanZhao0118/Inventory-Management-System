// app/api/users/register/complete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signupCompleteSchema } from "@/lib/validation";
import { verifySignupTicket } from "@/lib/ticket";
import { hashPassword } from "@/lib/hash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readJsonSafe(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    return null; // 讓我們可以回傳清楚的 JSON 錯誤
  }
}

export async function POST(req: NextRequest) {
  try {
    const raw = await readJsonSafe(req);
    if (!raw) {
      return NextResponse.json(
        { ok: false, message: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { ticket, password } = signupCompleteSchema.parse(raw); // 內含 passwordConfirm 比對
    const { email, username } = await verifySignupTicket<{ email: string; username: string }>(ticket);

    // 再做一次唯一性檢查避免競態
    const conflict = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
    if (conflict) {
      return NextResponse.json(
        { ok: false, message: "Username or email taken. Choose another." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    await prisma.user.create({ data: { username, email, passwordHash } });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // 確保所有錯誤都用 JSON 格式回去
    return NextResponse.json(
      { ok: false, message: err?.message || "Complete sign-up failed" },
      { status: 400 }
    );
  }
}
