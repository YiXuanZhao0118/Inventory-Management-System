-- CreateTable
CREATE TABLE "public"."VerificationCode" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "userId" UUID,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationCode_email_idx" ON "public"."VerificationCode"("email");

-- CreateIndex
CREATE INDEX "VerificationCode_userId_idx" ON "public"."VerificationCode"("userId");

-- CreateIndex
CREATE INDEX "VerificationCode_purpose_expiresAt_idx" ON "public"."VerificationCode"("purpose", "expiresAt");
