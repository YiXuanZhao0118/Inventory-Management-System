// app/api/users/register/verify-only/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signupVerifyOnlySchema } from "@/lib/validation";
import { verifyCode } from "@/lib/hash";
import { issueSignupTicket } from "@/lib/ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICKET_EXPIRES_SEC = 600; // 10 分鐘

export async function POST(req: NextRequest) {
  try {
    const { email, code } = signupVerifyOnlySchema.parse(await req.json());
    const now = new Date();

    const token = await prisma.verificationCode.findFirst({
      where: { email, purpose: "signup", consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
    });
    if (!token) return NextResponse.json({ ok: false, message: "Code expired. Please resend." }, { status: 400 });

    const ok = await verifyCode(code, token.codeHash);
    if (!ok) {
      await prisma.verificationCode.update({
        where: { id: token.id },
        data: { attempts: { increment: 1 }, consumedAt: new Date() },
      });
      return NextResponse.json({ ok: false, message: "Invalid code. Please request a new one." }, { status: 400 });
    }

    const payload = token.payload as { username: string } | null;
    if (!payload?.username) {
      await prisma.verificationCode.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
      return NextResponse.json({ ok: false, message: "Missing payload. Please restart sign-up." }, { status: 400 });
    }

    // 作廢驗證碼，簽發可用 10 分鐘的註冊票券
    await prisma.verificationCode.update({ where: { id: token.id }, data: { consumedAt: new Date() } });

    const ticket = await issueSignupTicket({ email, username: payload.username }, TICKET_EXPIRES_SEC);
    const ticketExpiresAt = new Date(Date.now() + TICKET_EXPIRES_SEC * 1000).toISOString();

    return NextResponse.json({ ok: true, ticket, ticketExpiresAt });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Verify failed" }, { status: 400 });
  }
}
