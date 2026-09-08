-- AlterTable
ALTER TABLE "banners" ADD COLUMN "placement" TEXT NOT NULL DEFAULT 'PROMO';

-- CreateIndex
CREATE INDEX "banners_placement_active_sortOrder_idx" ON "banners"("placement", "active", "sortOrder");
