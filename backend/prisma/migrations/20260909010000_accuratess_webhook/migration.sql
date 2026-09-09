-- Accuratess shipment id/code mapping support (additive only — no drops)

ALTER TABLE "deliveries" ADD COLUMN "accuratessShipmentId" TEXT;
ALTER TABLE "deliveries" ADD COLUMN "accuratessShipmentStatusCode" TEXT;
ALTER TABLE "deliveries" ADD COLUMN "accuratessReturnTypeCode" TEXT;
ALTER TABLE "deliveries" ADD COLUMN "accuratessDeliveryTypeCode" TEXT;
ALTER TABLE "deliveries" ADD COLUMN "accuratessDeliveredAmount" DECIMAL(65,30);
ALTER TABLE "deliveries" ADD COLUMN "accuratessCollectedFees" DECIMAL(65,30);
ALTER TABLE "deliveries" ADD COLUMN "accuratessDeliveryDate" TIMESTAMP(3);
ALTER TABLE "deliveries" ADD COLUMN "accuratessCancellationReasonId" TEXT;
ALTER TABLE "deliveries" ADD COLUMN "accuratessWebhookNotes" TEXT;
ALTER TABLE "deliveries" ADD COLUMN "accuratessLastWebhookAt" TIMESTAMP(3);
ALTER TABLE "deliveries" ADD COLUMN "accuratessLastEventFingerprint" TEXT;

CREATE INDEX "deliveries_accuratessShipmentId_idx" ON "deliveries"("accuratessShipmentId");

-- Event log table reserved for future webhook (inactive in this deploy — no public routes)
CREATE TABLE "accuratess_webhook_events" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "typeCode" TEXT,
    "fingerprint" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "deliveryId" TEXT,
    "orderId" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "accuratess_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accuratess_webhook_events_fingerprint_key" ON "accuratess_webhook_events"("fingerprint");
CREATE INDEX "accuratess_webhook_events_shipmentId_idx" ON "accuratess_webhook_events"("shipmentId");
CREATE INDEX "accuratess_webhook_events_createdAt_idx" ON "accuratess_webhook_events"("createdAt");
