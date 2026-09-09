-- Additive: per-gender delivery availability on Tripoli zones.
-- Defaults keep existing zones enabled for both genders.
ALTER TABLE "delivery_zones" ADD COLUMN IF NOT EXISTS "maleEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "delivery_zones" ADD COLUMN IF NOT EXISTS "femaleEnabled" BOOLEAN NOT NULL DEFAULT true;
