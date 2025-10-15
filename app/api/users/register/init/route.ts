// app\api\users\register\init\route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";
import { signupInitSchema } from "@/lib/validation";
import { generateCode } from "@/app/api/users/_util/code";
import { hashCode } from "@/lib/hash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPIRES_SEC = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, email } = signupInitSchema.parse(body);

    const [userByName, userByEmail] = await Promise.all([
      prisma.user.findUnique({ where: { username } }),
      prisma.user.findUnique({ where: { email } }),
    ]);
    if (userByName) return NextResponse.json({ ok: false, message: "Username already exists" }, { status: 409 });
    if (userByEmail) return NextResponse.json({ ok: false, message: "Email already in use" }, { status: 409 });

    await prisma.verificationCode.deleteMany({ where: { email, purpose: "signup", consumedAt: null } });

    const code = generateCode();
    const codeHash = await hashCode(code);
    const expiresAt = new Date(Date.now() + EXPIRES_SEC * 1000);

    await prisma.verificationCode.create({
      data: {
        email,
        purpose: "signup",
        codeHash,
        expiresAt,
        payload: { username }, // ← 密碼不在這一步存
      },
    });

    await sendVerificationEmail({
      to: email,
      subject: "Verify your sign-up",
      code,
      purpose: "signup",
      expiresInSec: EXPIRES_SEC,
    });

    return NextResponse.json({ ok: true, expiresAt });
  } catch (err: any) {
    return NextResponse.json({ ok: false, message: err?.message || "Failed to start sign-up" }, { status: 400 });
  }
}
