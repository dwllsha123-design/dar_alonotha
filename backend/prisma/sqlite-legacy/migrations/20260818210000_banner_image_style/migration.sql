-- AlterTable
ALTER TABLE "banners" ADD COLUMN "imageFit" TEXT NOT NULL DEFAULT 'cover';
ALTER TABLE "banners" ADD COLUMN "imageZoom" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "banners" ADD COLUMN "imagePosX" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "banners" ADD COLUMN "imagePosY" INTEGER NOT NULL DEFAULT 50;

-- Remove product photos from the homepage hero slider
DELETE FROM "banners"
WHERE "placement" = 'HERO'
  AND (
    "imageUrl" LIKE '%/product-%'
    OR "imageUrl" LIKE '%hero-slide-4.jpg'
    OR "imageUrl" LIKE '%hero-slide-5.jpg'
    OR "imageUrl" LIKE '%hero-slide-6.jpg'
  );
