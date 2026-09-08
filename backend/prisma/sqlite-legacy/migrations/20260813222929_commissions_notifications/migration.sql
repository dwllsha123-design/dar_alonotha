-- CreateTable
CREATE TABLE "commission_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nameAr" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PERCENT',
    "ratePercent" DECIMAL DEFAULT 0,
    "fixedAmount" DECIMAL DEFAULT 0,
    "pageId" TEXT,
    "agentUserId" TEXT,
    "source" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "commission_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "agentUserId" TEXT NOT NULL,
    "pageId" TEXT,
    "ruleId" TEXT,
    "orderTotal" DECIMAL NOT NULL,
    "ratePercent" DECIMAL NOT NULL DEFAULT 0,
    "amount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LYD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "paidAt" DATETIME,
    CONSTRAINT "commission_entries_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "commission_entries_agentUserId_fkey" FOREIGN KEY ("agentUserId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "bodyAr" TEXT,
    "type" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "commission_rules_pageId_agentUserId_isActive_idx" ON "commission_rules"("pageId", "agentUserId", "isActive");

-- CreateIndex
CREATE INDEX "commission_entries_agentUserId_status_idx" ON "commission_entries"("agentUserId", "status");

-- CreateIndex
CREATE INDEX "commission_entries_createdAt_idx" ON "commission_entries"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "commission_entries_orderId_agentUserId_key" ON "commission_entries"("orderId", "agentUserId");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");
