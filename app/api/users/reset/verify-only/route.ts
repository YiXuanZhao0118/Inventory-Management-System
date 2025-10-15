import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resetVerifyOnlySchema } from "@/lib/validation";
import { verifyCode } from "@/lib/hash";
import { issueResetTicket } from "@/lib/ticket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICKET_EXPIRES_SEC = 600; // 10 分鐘

export async function POST(req: NextRequest) {
  try {
    const { email, code } = resetVerifyOnlySchema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ ok: false, message: "Email not found" }, { status: 404 });

    const now = new Date();
    const token = await prisma.verificationCode.findFirst({
      where: { email, userId: user.id, purpose: "reset", consumedAt: null, expiresAt: { gt: now } },
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

    // 作廢驗證碼，簽發 reset 票券（10 分鐘有效）
    await prisma.verificationCode.update({ where: { id: token.id }, data: { consumedAt: new Date() } });

    const ticket = await issueResetTicket({ email, userId: user.id }, TICKET_EXPIRES_SEC);
    const ticketExpiresAt = new Date(Date.now() + TICKET_EXPIRES_SEC * 1000).toISOString();

    return NextResponse.json({ ok: true, ticket, ticketExpiresAt });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Verify failed" }, { status: 400 });
  }
}
