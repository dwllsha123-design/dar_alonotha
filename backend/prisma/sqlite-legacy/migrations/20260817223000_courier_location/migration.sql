-- CreateTable
CREATE TABLE IF NOT EXISTS "couriers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "city" TEXT NOT NULL DEFAULT 'طرابلس',
    "lastLat" REAL,
    "lastLng" REAL,
    "lastSeenAt" DATETIME,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "couriers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "couriers_userId_key" ON "couriers"("userId");
CREATE INDEX IF NOT EXISTS "couriers_isActive_idx" ON "couriers"("isActive");
CREATE INDEX IF NOT EXISTS "couriers_city_idx" ON "couriers"("city");
