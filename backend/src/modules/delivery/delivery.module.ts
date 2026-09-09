import { Module } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';
import { StoreModule } from '../store/store.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FulfillmentModule } from './fulfillment.module';
import { CommissionsModule } from '../commissions/commissions.module';

/**
 * Accuratess public webhook controllers are intentionally NOT registered.
 * Carrier webhook authentication is unconfirmed — keep outbound saveShipment only.
 * Local webhook implementation remains in-repo but inactive until ACCURATESS_WEBHOOK_ENABLED
 * is approved and controllers are re-wired behind that flag.
 */
@Module({
  imports: [StoreModule, InventoryModule, NotificationsModule, FulfillmentModule, CommissionsModule],
  controllers: [DeliveryController],
  providers: [DeliveryService],
  exports: [DeliveryService, FulfillmentModule],
})
export class DeliveryModule {}
