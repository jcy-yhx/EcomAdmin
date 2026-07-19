import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { HeaderResolver, I18nModule } from 'nestjs-i18n';
import * as path from 'path';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './modules/health/health.module';
import { UserModule } from './modules/user/user.module';
import { AuthModule } from './modules/auth/auth.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { CategoryModule } from './modules/category/category.module';
import { BrandModule } from './modules/brand/brand.module';
import { SpecModule } from './modules/spec/spec.module';
import { ProductModule } from './modules/product/product.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { UploadModule } from './modules/upload/upload.module';
import { CartModule } from './modules/cart/cart.module';
import { OrderModule } from './modules/order/order.module';
import { OrderQueueModule } from './modules/order/order-queue.module';
import { CouponModule } from './modules/coupon/coupon.module';
import { PaymentModule } from './modules/payment/payment.module';
import { NotificationModule } from './modules/notification/notification.module';
import { OperationLogModule } from './modules/operation-log/operation-log.module';

import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/rbac/guards/roles.guard';
import { PermissionsGuard } from './modules/rbac/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.local'] }),

    I18nModule.forRoot({
      fallbackLanguage: 'zh',
      loaderOptions: { path: path.join(__dirname, '..', 'i18n'), watch: true },
      resolvers: [new HeaderResolver(['accept-language'])],
    }),

    // Global database & cache
    PrismaModule,
    RedisModule,

    // Business modules — Phase 2
    HealthModule,
    UserModule,
    AuthModule,
    RbacModule,

    // Business modules — Phase 3
    CategoryModule,
    BrandModule,
    SpecModule,
    ProductModule,
    InventoryModule,
    UploadModule,

    // Business modules — Phase 4
    CartModule,
    OrderModule,
    OrderQueueModule,

    // Business modules — Phase 5
    CouponModule,
    PaymentModule,
    NotificationModule,
    OperationLogModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
