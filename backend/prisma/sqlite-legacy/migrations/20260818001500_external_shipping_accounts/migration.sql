-- CreateTable
CREATE TABLE "external_shipping_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "facebookPageId" TEXT NOT NULL,
    "label" TEXT,
    "pageIdentifier" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'ACCURATESS',
    "apiToken" TEXT NOT NULL,
    "endpoint" TEXT,
    "senderZoneId" TEXT,
    "senderSubzoneId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "external_shipping_accounts_facebookPageId_fkey" FOREIGN KEY ("facebookPageId") REFERENCES "facebook_pages" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "external_shipping_accounts_facebookPageId_key" ON "external_shipping_accounts"("facebookPageId");

-- CreateIndex
CREATE INDEX "external_shipping_accounts_pageIdentifier_idx" ON "external_shipping_accounts"("pageIdentifier");

-- CreateIndex
CREATE INDEX "external_shipping_accounts_isActive_idx" ON "external_shipping_accounts"("isActive");
