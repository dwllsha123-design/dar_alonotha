-- Catch-up: columns and tables that exist in Prisma schema but were never migrated.

-- AlterTable orders
ALTER TABLE "orders" ADD COLUMN "fulfillmentType" TEXT;
ALTER TABLE "orders" ADD COLUMN "localStatus" TEXT;
ALTER TABLE "orders" ADD COLUMN "courierId" TEXT;
ALTER TABLE "orders" ADD COLUMN "pageSource" TEXT;
ALTER TABLE "orders" ADD COLUMN "promoCodeId" TEXT;
ALTER TABLE "orders" ADD COLUMN "promoCode" TEXT;
ALTER TABLE "orders" ADD COLUMN "externalTrackingNumber" TEXT;
ALTER TABLE "orders" ADD COLUMN "shippingLabelUrl" TEXT;
ALTER TABLE "orders" ADD COLUMN "externalResponsePayload" TEXT;
ALTER TABLE "orders" ADD COLUMN "fulfillmentError" TEXT;

CREATE INDEX IF NOT EXISTS "orders_fulfillmentType_idx" ON "orders"("fulfillmentType");
CREATE INDEX IF NOT EXISTS "orders_localStatus_idx" ON "orders"("localStatus");
CREATE INDEX IF NOT EXISTS "orders_courierId_idx" ON "orders"("courierId");

-- AlterTable deliveries
ALTER TABLE "deliveries" ADD COLUMN "externalRef" TEXT;
ALTER TABLE "deliveries" ADD COLUMN "trackingUrl" TEXT;
ALTER TABLE "deliveries" ADD COLUMN "lastSyncedAt" DATETIME;

CREATE INDEX IF NOT EXISTS "deliveries_externalRef_idx" ON "deliveries"("externalRef");

-- CreateTable
CREATE TABLE IF NOT EXISTS "promo_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "nameAr" TEXT,
    "type" TEXT NOT NULL DEFAULT 'PERCENT',
    "value" DECIMAL NOT NULL,
    "minOrder" DECIMAL NOT NULL DEFAULT 0,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "promo_codes_code_key" ON "promo_codes"("code");
CREATE INDEX IF NOT EXISTS "promo_codes_active_startsAt_endsAt_idx" ON "promo_codes"("active", "startsAt", "endsAt");

-- CreateTable
CREATE TABLE IF NOT EXISTS "banners" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageUrl" TEXT,
    "linkUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "banners_active_sortOrder_idx" ON "banners"("active", "sortOrder");
