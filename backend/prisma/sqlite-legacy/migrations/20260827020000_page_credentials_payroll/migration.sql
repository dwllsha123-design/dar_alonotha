-- Employment types & payroll
ALTER TABLE "users" ADD COLUMN "employmentType" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "users" ADD COLUMN "monthlySalary" REAL;

-- Order creator attribution
ALTER TABLE "orders" ADD COLUMN "createdById" TEXT;
CREATE INDEX "orders_createdById_idx" ON "orders"("createdById");

-- Facebook page dedicated login
ALTER TABLE "facebook_pages" ADD COLUMN "username" TEXT;
ALTER TABLE "facebook_pages" ADD COLUMN "password_hash" TEXT;
ALTER TABLE "facebook_pages" ADD COLUMN "portalUserId" TEXT;
CREATE UNIQUE INDEX "facebook_pages_username_key" ON "facebook_pages"("username");
CREATE UNIQUE INDEX "facebook_pages_portalUserId_key" ON "facebook_pages"("portalUserId");

-- Per-piece commission tracking
ALTER TABLE "commission_entries" ADD COLUMN "itemCount" INTEGER NOT NULL DEFAULT 0;

-- Monthly salary payments
CREATE TABLE "salary_payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "salary_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "salary_payments_userId_year_month_key" ON "salary_payments"("userId", "year", "month");
CREATE INDEX "salary_payments_userId_status_idx" ON "salary_payments"("userId", "status");
