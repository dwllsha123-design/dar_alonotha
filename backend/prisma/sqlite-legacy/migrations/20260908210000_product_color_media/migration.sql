-- Additive only: per-color media (images + optional short video).
-- Does NOT modify product_images or existing storage paths.

CREATE TABLE "product_color_media" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_color_media_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "product_color_media_productId_color_idx" ON "product_color_media"("productId", "color");
CREATE INDEX "product_color_media_productId_color_kind_idx" ON "product_color_media"("productId", "color", "kind");
