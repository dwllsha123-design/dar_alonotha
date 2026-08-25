import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ProductsModule } from './modules/products/products.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { OrdersModule } from './modules/orders/orders.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { FacebookPagesModule } from './modules/facebook-pages/facebook-pages.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PosModule } from './modules/pos/pos.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ReferralModule } from './modules/referral/referral.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { BarcodesModule } from './modules/barcodes/barcodes.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { CommissionsModule } from './modules/commissions/commissions.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StoreModule } from './modules/store/store.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { AuditModule } from './modules/audit/audit.module';
import { MobileModule } from './modules/mobile/mobile.module';
import { BranchesModule } from './modules/branches/branches.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    ProductsModule,
    CategoriesModule,
    OrdersModule,
    InventoryModule,
    FacebookPagesModule,
    SettingsModule,
    PosModule,
    DeliveryModule,
    ReportsModule,
    ReferralModule,
    ReservationsModule,
    BarcodesModule,
    ReturnsModule,
    CommissionsModule,
    MobileModule,
    NotificationsModule,
    StoreModule,
    MarketingModule,
    AuditModule,
    BranchesModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
