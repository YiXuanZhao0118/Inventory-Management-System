-- CreateEnum
CREATE TYPE "public"."StockStatus" AS ENUM ('in_stock', 'short_term', 'long_term', 'discarded');

-- CreateEnum
CREATE TYPE "public"."LoanType" AS ENUM ('short_term', 'long_term');

-- CreateTable
CREATE TABLE "public"."Product" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "brand" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "specifications" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(12,2),
    "imageLink" TEXT,
    "localImage" TEXT,
    "isPropertyManaged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Location" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "parentId" UUID,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Stock" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "currentStatus" "public"."StockStatus" NOT NULL DEFAULT 'in_stock',
    "discarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Discarded" (
    "id" UUID NOT NULL,
    "stockId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "discardReason" TEXT,
    "discardOperator" TEXT,
    "discardDate" TIMESTAMP(3),

    CONSTRAINT "Discarded_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductFile" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "path" TEXT NOT NULL,
    "P/N" TEXT NOT NULL,
    "description" TEXT,
    "files" JSONB NOT NULL DEFAULT '{}',
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Device" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IamsMapping" (
    "stockId" UUID NOT NULL,
    "iamsId" TEXT NOT NULL,

    CONSTRAINT "IamsMapping_pkey" PRIMARY KEY ("stockId")
);

-- CreateTable
CREATE TABLE "public"."ProductCategory" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductCategoryItem" (
    "categoryId" UUID NOT NULL,
    "productId" UUID NOT NULL,

    CONSTRAINT "ProductCategoryItem_pkey" PRIMARY KEY ("categoryId","productId")
);

-- CreateTable
CREATE TABLE "public"."Rental" (
    "id" UUID NOT NULL,
    "stockId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "borrower" TEXT NOT NULL,
    "renter" TEXT NOT NULL,
    "loanType" "public"."LoanType" NOT NULL DEFAULT 'short_term',
    "loanDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "returnDate" TIMESTAMP(3),

    CONSTRAINT "Rental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Transfer" (
    "id" UUID NOT NULL,
    "stockId" UUID NOT NULL,
    "fromLocation" UUID NOT NULL,
    "toLocation" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "public"."Product"("name");

-- CreateIndex
CREATE INDEX "Product_brand_model_idx" ON "public"."Product"("brand", "model");

-- CreateIndex
CREATE INDEX "Location_parentId_idx" ON "public"."Location"("parentId");

-- CreateIndex
CREATE INDEX "Location_label_idx" ON "public"."Location"("label");

-- CreateIndex
CREATE INDEX "Stock_productId_idx" ON "public"."Stock"("productId");

-- CreateIndex
CREATE INDEX "Stock_locationId_idx" ON "public"."Stock"("locationId");

-- CreateIndex
CREATE INDEX "Stock_currentStatus_idx" ON "public"."Stock"("currentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Discarded_stockId_key" ON "public"."Discarded"("stockId");

-- CreateIndex
CREATE INDEX "Discarded_productId_idx" ON "public"."Discarded"("productId");

-- CreateIndex
CREATE INDEX "Discarded_locationId_idx" ON "public"."Discarded"("locationId");

-- CreateIndex
CREATE INDEX "Discarded_discardDate_idx" ON "public"."Discarded"("discardDate");

-- CreateIndex
CREATE INDEX "ProductFile_productId_idx" ON "public"."ProductFile"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "IamsMapping_iamsId_key" ON "public"."IamsMapping"("iamsId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_name_key" ON "public"."ProductCategory"("name");

-- CreateIndex
CREATE INDEX "ProductCategoryItem_productId_idx" ON "public"."ProductCategoryItem"("productId");

-- CreateIndex
CREATE INDEX "Rental_stockId_idx" ON "public"."Rental"("stockId");

-- CreateIndex
CREATE INDEX "Rental_productId_idx" ON "public"."Rental"("productId");

-- CreateIndex
CREATE INDEX "Rental_locationId_idx" ON "public"."Rental"("locationId");

-- CreateIndex
CREATE INDEX "Rental_loanType_idx" ON "public"."Rental"("loanType");

-- CreateIndex
CREATE INDEX "Transfer_stockId_idx" ON "public"."Transfer"("stockId");

-- CreateIndex
CREATE INDEX "Transfer_fromLocation_idx" ON "public"."Transfer"("fromLocation");

-- CreateIndex
CREATE INDEX "Transfer_toLocation_idx" ON "public"."Transfer"("toLocation");

-- AddForeignKey
ALTER TABLE "public"."Location" ADD CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Stock" ADD CONSTRAINT "Stock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Stock" ADD CONSTRAINT "Stock_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Discarded" ADD CONSTRAINT "Discarded_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "public"."Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Discarded" ADD CONSTRAINT "Discarded_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Discarded" ADD CONSTRAINT "Discarded_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductFile" ADD CONSTRAINT "ProductFile_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IamsMapping" ADD CONSTRAINT "IamsMapping_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "public"."Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductCategoryItem" ADD CONSTRAINT "ProductCategoryItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductCategoryItem" ADD CONSTRAINT "ProductCategoryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Rental" ADD CONSTRAINT "Rental_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "public"."Stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Rental" ADD CONSTRAINT "Rental_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Rental" ADD CONSTRAINT "Rental_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transfer" ADD CONSTRAINT "Transfer_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "public"."Stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transfer" ADD CONSTRAINT "Transfer_fromLocation_fkey" FOREIGN KEY ("fromLocation") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transfer" ADD CONSTRAINT "Transfer_toLocation_fkey" FOREIGN KEY ("toLocation") REFERENCES "public"."Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
