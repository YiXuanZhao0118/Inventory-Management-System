//app\api\users\reset\init\route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resetInitSchema } from "@/lib/validation";
import { generateCode } from "@/app/api/users/_util/code";
import { hashCode } from "@/lib/hash";
import { sendVerificationEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPIRES_SEC = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = resetInitSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ ok: false, message: "Email not found" }, { status: 404 });
    }

    await prisma.verificationCode.deleteMany({ where: { email, purpose: "reset", consumedAt: null } });

    const code = generateCode();
    const codeHash = await hashCode(code);
    const expiresAt = new Date(Date.now() + EXPIRES_SEC * 1000);

    await prisma.verificationCode.create({
      data: { email, userId: user.id, purpose: "reset", codeHash, expiresAt },
    });

    await sendVerificationEmail({
      to: email,
      subject: "Reset your password",
      code,
      purpose: "reset",
      expiresInSec: EXPIRES_SEC,
    });

    return NextResponse.json({ ok: true, expiresAt });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Failed to start reset" }, { status: 400 });
  }
}
