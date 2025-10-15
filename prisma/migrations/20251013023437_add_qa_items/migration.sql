-- CreateTable
CREATE TABLE "public"."QAItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contentMd" TEXT NOT NULL,

    CONSTRAINT "QAItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QAItem_order_idx" ON "public"."QAItem"("order");

-- CreateIndex
CREATE INDEX "QAItem_updatedAt_idx" ON "public"."QAItem"("updatedAt");
