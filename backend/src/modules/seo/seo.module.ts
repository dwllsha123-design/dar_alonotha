import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

@Module({
  imports: [StoreModule],
  controllers: [SeoController],
  providers: [SeoService],
})
export class SeoModule {}
