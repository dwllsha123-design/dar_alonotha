-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN "orderId" TEXT;
ALTER TABLE "inventory_movements" ADD COLUMN "reason" TEXT;

-- CreateTable
CREATE TABLE "stock_reservations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "warehouseId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "agentUserId" TEXT NOT NULL,
    "pageId" TEXT,
    "orderId" TEXT,
    "expiresAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "releasedAt" DATETIME,
    "consumedAt" DATETIME,
    CONSTRAINT "stock_reservations_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_reservations_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_reservations_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "facebook_pages" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "referral_visits" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "pageCode" INTEGER NOT NULL,
    "agentUserId" TEXT,
    "agentCode" INTEGER,
    "attributionToken" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "landingPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "referral_visits_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "facebook_pages" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "code_sequences" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "counter" INTEGER NOT NULL DEFAULT 1000
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_facebook_page_employees" (
    "pageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'AGENT',
    "agentCode" INTEGER,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("pageId", "userId"),
    CONSTRAINT "facebook_page_employees_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "facebook_pages" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "facebook_page_employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_facebook_page_employees" ("assignedAt", "pageId", "userId") SELECT "assignedAt", "pageId", "userId" FROM "facebook_page_employees";
DROP TABLE "facebook_page_employees";
ALTER TABLE "new_facebook_page_employees" RENAME TO "facebook_page_employees";
CREATE UNIQUE INDEX "facebook_page_employees_agentCode_key" ON "facebook_page_employees"("agentCode");
CREATE INDEX "facebook_page_employees_agentCode_idx" ON "facebook_page_employees"("agentCode");

CREATE TABLE "new_facebook_pages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "publicCode" INTEGER NOT NULL,
    "pageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "managerId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "facebook_pages_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_facebook_pages" ("createdAt", "id", "name", "notes", "pageId", "publicCode", "status", "updatedAt")
SELECT "createdAt", "id", "name", "notes", "pageId", 1025, "status", "updatedAt" FROM "facebook_pages";
DROP TABLE "facebook_pages";
ALTER TABLE "new_facebook_pages" RENAME TO "facebook_pages";
CREATE UNIQUE INDEX "facebook_pages_publicCode_key" ON "facebook_pages"("publicCode");
CREATE UNIQUE INDEX "facebook_pages_pageId_key" ON "facebook_pages"("pageId");

CREATE TABLE "new_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "orderBarcode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "paymentMethod" TEXT NOT NULL DEFAULT 'COD',
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "deliveryType" TEXT NOT NULL DEFAULT 'INTERNAL',
    "customerId" TEXT,
    "salesAgentId" TEXT,
    "cashierId" TEXT,
    "facebookPageId" TEXT,
    "warehouseId" TEXT,
    "pagePublicCode" INTEGER,
    "agentPublicCode" INTEGER,
    "referralVisitId" TEXT,
    "attributionSource" TEXT,
    "subtotal" DECIMAL NOT NULL,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0,
    "deliveryFee" DECIMAL NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LYD',
    "shippingName" TEXT,
    "shippingPhone" TEXT,
    "city" TEXT,
    "area" TEXT,
    "address" TEXT,
    "landmark" TEXT,
    "notes" TEXT,
    "stockDeductedAt" DATETIME,
    "returnedToStockAt" DATETIME,
    "confirmedAt" DATETIME,
    "deliveredAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "orders_salesAgentId_fkey" FOREIGN KEY ("salesAgentId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "orders_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "orders_facebookPageId_fkey" FOREIGN KEY ("facebookPageId") REFERENCES "facebook_pages" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "orders_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "orders_referralVisitId_fkey" FOREIGN KEY ("referralVisitId") REFERENCES "referral_visits" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_orders" (
  "address", "area", "cancelledAt", "cashierId", "city", "confirmedAt", "createdAt", "currency", "customerId",
  "deliveredAt", "deliveryFee", "deliveryType", "discountAmount", "facebookPageId", "id", "landmark", "notes",
  "orderBarcode", "orderNumber", "paymentMethod", "paymentStatus", "salesAgentId", "shippingName", "shippingPhone",
  "source", "status", "subtotal", "taxAmount", "totalAmount", "updatedAt", "warehouseId"
)
SELECT
  "address", "area", "cancelledAt", "cashierId", "city", "confirmedAt", "createdAt", "currency", "customerId",
  "deliveredAt", "deliveryFee", "deliveryType", "discountAmount", "facebookPageId", "id", "landmark", "notes",
  "orderNumber", "orderNumber", "paymentMethod", "paymentStatus", "salesAgentId", "shippingName", "shippingPhone",
  "source", "status", "subtotal", "taxAmount", "totalAmount", "updatedAt", "warehouseId"
FROM "orders";
DROP TABLE "orders";
ALTER TABLE "new_orders" RENAME TO "orders";
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");
CREATE UNIQUE INDEX "orders_orderBarcode_key" ON "orders"("orderBarcode");
CREATE INDEX "orders_status_idx" ON "orders"("status");
CREATE INDEX "orders_source_idx" ON "orders"("source");
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");
CREATE INDEX "orders_salesAgentId_idx" ON "orders"("salesAgentId");
CREATE INDEX "orders_facebookPageId_idx" ON "orders"("facebookPageId");
CREATE INDEX "orders_orderBarcode_idx" ON "orders"("orderBarcode");
CREATE INDEX "orders_pagePublicCode_agentPublicCode_idx" ON "orders"("pagePublicCode", "agentPublicCode");

CREATE TABLE "new_product_variants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "color" TEXT,
    "size" TEXT,
    "costPrice" DECIMAL,
    "wholesalePrice" DECIMAL,
    "retailPrice" DECIMAL NOT NULL DEFAULT 0,
    "price" DECIMAL NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_product_variants" (
  "barcode", "color", "costPrice", "createdAt", "id", "isActive", "nameAr", "nameEn",
  "price", "productId", "retailPrice", "size", "sku", "updatedAt"
)
SELECT
  "barcode", "color", "costPrice", "createdAt", "id", "isActive", "nameAr", "nameEn",
  "price", "productId", "price", "size", "sku", "updatedAt"
FROM "product_variants";
DROP TABLE "product_variants";
ALTER TABLE "new_product_variants" RENAME TO "product_variants";
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");
CREATE UNIQUE INDEX "product_variants_barcode_key" ON "product_variants"("barcode");
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");
CREATE INDEX "product_variants_barcode_idx" ON "product_variants"("barcode");

CREATE TABLE "new_products" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "categoryId" TEXT,
    "brand" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "costPrice" DECIMAL,
    "wholesalePrice" DECIMAL,
    "retailPrice" DECIMAL NOT NULL,
    "basePrice" DECIMAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'LYD',
    "isTrackStock" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_products" (
  "basePrice", "brand", "categoryId", "costPrice", "createdAt", "currency", "description",
  "id", "isTrackStock", "nameAr", "nameEn", "retailPrice", "sku", "status", "updatedAt"
)
SELECT
  "basePrice", "brand", "categoryId", "costPrice", "createdAt", "currency", "description",
  "id", "isTrackStock", "nameAr", "nameEn", "basePrice", "sku", "status", "updatedAt"
FROM "products";
DROP TABLE "products";
ALTER TABLE "new_products" RENAME TO "products";
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");
CREATE INDEX "products_status_idx" ON "products"("status");
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE INDEX "stock_reservations_status_variantId_idx" ON "stock_reservations"("status", "variantId");
CREATE INDEX "stock_reservations_agentUserId_idx" ON "stock_reservations"("agentUserId");
CREATE UNIQUE INDEX "referral_visits_attributionToken_key" ON "referral_visits"("attributionToken");
CREATE INDEX "referral_visits_pageCode_agentCode_idx" ON "referral_visits"("pageCode", "agentCode");
CREATE INDEX "referral_visits_attributionToken_idx" ON "referral_visits"("attributionToken");
CREATE INDEX "inventory_movements_orderId_idx" ON "inventory_movements"("orderId");

INSERT OR IGNORE INTO "code_sequences" ("key", "counter") VALUES ('page_public_code', 1025);
INSERT OR IGNORE INTO "code_sequences" ("key", "counter") VALUES ('agent_public_code', 2050);
INSERT OR IGNORE INTO "code_sequences" ("key", "counter") VALUES ('variant_barcode', 100000);
