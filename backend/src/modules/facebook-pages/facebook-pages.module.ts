import { Module } from '@nestjs/common';
import { FacebookPagesService } from './facebook-pages.service';
import { FacebookPagesAnalyticsService } from './facebook-pages-analytics.service';
import { FacebookPagesController } from './facebook-pages.controller';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [FacebookPagesController],
  providers: [FacebookPagesService, FacebookPagesAnalyticsService],
  exports: [FacebookPagesService],
})
export class FacebookPagesModule {}
