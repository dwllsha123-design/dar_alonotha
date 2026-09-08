-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "product_images" ADD COLUMN "color" TEXT;

-- CreateIndex
CREATE INDEX "product_images_productId_color_idx" ON "product_images"("productId", "color");
