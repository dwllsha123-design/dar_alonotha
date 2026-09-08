-- Align SQLite table definitions with Prisma: foreign keys for
-- orders.courierId, orders.branchId, and stock_items.branchId.
-- Columns already exist; this rebuilds the tables so constraints are real.

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_orders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "orderBarcode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "paymentMethod" TEXT NOT NULL DEFAULT 'COD',
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "deliveryType" TEXT NOT NULL DEFAULT 'INTERNAL',
    "fulfillmentType" TEXT,
    "localStatus" TEXT,
    "courierId" TEXT,
    "customerId" TEXT,
    "salesAgentId" TEXT,
    "cashierId" TEXT,
    "facebookPageId" TEXT,
    "warehouseId" TEXT,
    "branchId" TEXT,
    "pagePublicCode" INTEGER,
    "agentPublicCode" INTEGER,
    "referralVisitId" TEXT,
    "attributionSource" TEXT,
    "pageSource" TEXT,
    "subtotal" DECIMAL NOT NULL,
    "discountAmount" DECIMAL NOT NULL DEFAULT 0,
    "promoCodeId" TEXT,
    "promoCode" TEXT,
    "deliveryFee" DECIMAL NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LYD',
    "shippingName" TEXT,
    "shippingPhone" TEXT,
    "city" TEXT,
    "area" TEXT,
    "deliveryGender" TEXT,
    "address" TEXT,
    "landmark" TEXT,
    "notes" TEXT,
    "externalTrackingNumber" TEXT,
    "shippingLabelUrl" TEXT,
    "externalResponsePayload" TEXT,
    "fulfillmentError" TEXT,
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
    CONSTRAINT "orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "orders_referralVisitId_fkey" FOREIGN KEY ("referralVisitId") REFERENCES "referral_visits" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "orders_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "couriers" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_orders" ("address", "agentPublicCode", "area", "attributionSource", "branchId", "cancelledAt", "cashierId", "city", "confirmedAt", "courierId", "createdAt", "currency", "customerId", "deliveredAt", "deliveryFee", "deliveryGender", "deliveryType", "discountAmount", "externalResponsePayload", "externalTrackingNumber", "facebookPageId", "fulfillmentError", "fulfillmentType", "id", "landmark", "localStatus", "notes", "orderBarcode", "orderNumber", "pagePublicCode", "pageSource", "paymentMethod", "paymentStatus", "promoCode", "promoCodeId", "referralVisitId", "returnedToStockAt", "salesAgentId", "shippingLabelUrl", "shippingName", "shippingPhone", "source", "status", "stockDeductedAt", "subtotal", "taxAmount", "totalAmount", "updatedAt", "warehouseId") SELECT "address", "agentPublicCode", "area", "attributionSource", "branchId", "cancelledAt", "cashierId", "city", "confirmedAt", "courierId", "createdAt", "currency", "customerId", "deliveredAt", "deliveryFee", "deliveryGender", "deliveryType", "discountAmount", "externalResponsePayload", "externalTrackingNumber", "facebookPageId", "fulfillmentError", "fulfillmentType", "id", "landmark", "localStatus", "notes", "orderBarcode", "orderNumber", "pagePublicCode", "pageSource", "paymentMethod", "paymentStatus", "promoCode", "promoCodeId", "referralVisitId", "returnedToStockAt", "salesAgentId", "shippingLabelUrl", "shippingName", "shippingPhone", "source", "status", "stockDeductedAt", "subtotal", "taxAmount", "totalAmount", "updatedAt", "warehouseId" FROM "orders";
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
CREATE INDEX "orders_fulfillmentType_idx" ON "orders"("fulfillmentType");
CREATE INDEX "orders_localStatus_idx" ON "orders"("localStatus");
CREATE INDEX "orders_courierId_idx" ON "orders"("courierId");
CREATE INDEX "orders_branchId_idx" ON "orders"("branchId");
CREATE TABLE "new_stock_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "warehouseId" TEXT NOT NULL,
    "branchId" TEXT,
    "variantId" TEXT NOT NULL,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "quantityReserved" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "stock_items_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "stock_items_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stock_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_stock_items" ("branchId", "id", "quantityOnHand", "quantityReserved", "reorderLevel", "updatedAt", "variantId", "warehouseId") SELECT "branchId", "id", "quantityOnHand", "quantityReserved", "reorderLevel", "updatedAt", "variantId", "warehouseId" FROM "stock_items";
DROP TABLE "stock_items";
ALTER TABLE "new_stock_items" RENAME TO "stock_items";
CREATE INDEX "stock_items_branchId_variantId_idx" ON "stock_items"("branchId", "variantId");
CREATE UNIQUE INDEX "stock_items_warehouseId_variantId_key" ON "stock_items"("warehouseId", "variantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
