-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'WEB',
    "appVersion" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "deviceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "pushToken" TEXT,
    "pushProvider" TEXT,
    "appVersion" TEXT,
    "osVersion" TEXT,
    "locale" TEXT DEFAULT 'ar',
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refreshTokenHash_key" ON "auth_sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_revokedAt_idx" ON "auth_sessions"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "devices_deviceId_key" ON "devices"("deviceId");

-- CreateIndex
CREATE INDEX "devices_userId_idx" ON "devices"("userId");

-- CreateIndex
CREATE INDEX "devices_pushToken_idx" ON "devices"("pushToken");

-- Default mobile app settings (upsert by key)
INSERT INTO "settings" ("id", "key", "value", "group", "updatedAt")
SELECT 'set_mobile_android_package', 'mobile.android_package', 'ly.daronotha.store', 'mobile', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mobile.android_package');

INSERT INTO "settings" ("id", "key", "value", "group", "updatedAt")
SELECT 'set_mobile_ios_bundle', 'mobile.ios_bundle_id', 'ly.daronotha.store', 'mobile', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mobile.ios_bundle_id');

INSERT INTO "settings" ("id", "key", "value", "group", "updatedAt")
SELECT 'set_mobile_ios_team', 'mobile.ios_team_id', '', 'mobile', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mobile.ios_team_id');

INSERT INTO "settings" ("id", "key", "value", "group", "updatedAt")
SELECT 'set_mobile_android_min', 'mobile.android_min_version', '1.0.0', 'mobile', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mobile.android_min_version');

INSERT INTO "settings" ("id", "key", "value", "group", "updatedAt")
SELECT 'set_mobile_ios_min', 'mobile.ios_min_version', '1.0.0', 'mobile', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mobile.ios_min_version');

INSERT INTO "settings" ("id", "key", "value", "group", "updatedAt")
SELECT 'set_mobile_android_latest', 'mobile.android_latest_version', '1.0.0', 'mobile', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mobile.android_latest_version');

INSERT INTO "settings" ("id", "key", "value", "group", "updatedAt")
SELECT 'set_mobile_ios_latest', 'mobile.ios_latest_version', '1.0.0', 'mobile', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mobile.ios_latest_version');

INSERT INTO "settings" ("id", "key", "value", "group", "updatedAt")
SELECT 'set_mobile_android_force', 'mobile.android_force_update', 'false', 'mobile', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mobile.android_force_update');

INSERT INTO "settings" ("id", "key", "value", "group", "updatedAt")
SELECT 'set_mobile_ios_force', 'mobile.ios_force_update', 'false', 'mobile', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mobile.ios_force_update');

INSERT INTO "settings" ("id", "key", "value", "group", "updatedAt")
SELECT 'set_mobile_play_url', 'mobile.play_store_url', '', 'mobile', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mobile.play_store_url');

INSERT INTO "settings" ("id", "key", "value", "group", "updatedAt")
SELECT 'set_mobile_appstore_url', 'mobile.app_store_url', '', 'mobile', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mobile.app_store_url');

INSERT INTO "settings" ("id", "key", "value", "group", "updatedAt")
SELECT 'set_mobile_scheme', 'mobile.deep_link_scheme', 'daronotha', 'mobile', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mobile.deep_link_scheme');

INSERT INTO "settings" ("id", "key", "value", "group", "updatedAt")
SELECT 'set_mobile_host', 'mobile.universal_link_host', 'dar-alunotha.ly', 'mobile', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mobile.universal_link_host');

INSERT INTO "settings" ("id", "key", "value", "group", "updatedAt")
SELECT 'set_mobile_maintenance', 'mobile.maintenance', 'false', 'mobile', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mobile.maintenance');

INSERT INTO "settings" ("id", "key", "value", "group", "updatedAt")
SELECT 'set_mobile_maintenance_msg', 'mobile.maintenance_message', '', 'mobile', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mobile.maintenance_message');

INSERT INTO "settings" ("id", "key", "value", "group", "updatedAt")
SELECT 'set_mobile_sha256', 'mobile.android_sha256_fingerprints', '', 'mobile', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "settings" WHERE "key" = 'mobile.android_sha256_fingerprints');

