-- CreateTable
CREATE TABLE "delivery_zones" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "city" TEXT NOT NULL DEFAULT 'طرابلس',
    "area" TEXT NOT NULL,
    "maleFee" DECIMAL NOT NULL DEFAULT 15,
    "femaleFee" DECIMAL NOT NULL DEFAULT 20,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zones_city_area_key" ON "delivery_zones"("city", "area");

-- CreateIndex
CREATE INDEX "delivery_zones_city_isActive_idx" ON "delivery_zones"("city", "isActive");

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "deliveryGender" TEXT;
