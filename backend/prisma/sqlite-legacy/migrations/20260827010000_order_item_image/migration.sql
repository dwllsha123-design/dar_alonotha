-- Persist product snapshot image on each order line for picking/packing
ALTER TABLE "order_items" ADD COLUMN "imageUrl" TEXT;
