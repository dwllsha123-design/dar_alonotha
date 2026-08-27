import { Module } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { DeliveryController } from './delivery.controller';
import { StoreModule } from '../store/store.module';
import { InventoryModule } from '../inventory/inventory.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FulfillmentModule } from './fulfillment.module';
import { CommissionsModule } from '../commissions/commissions.module';

@Module({
  imports: [StoreModule, InventoryModule, NotificationsModule, FulfillmentModule, CommissionsModule],
  controllers: [DeliveryController],
  providers: [DeliveryService],
  exports: [DeliveryService, FulfillmentModule],
})
export class DeliveryModule {}
