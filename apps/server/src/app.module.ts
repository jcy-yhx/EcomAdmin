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

import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/rbac/guards/roles.guard';
import { PermissionsGuard } from './modules/rbac/guards/permissions.guard';

@Module({
  imports: [
    // Global env configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),

    // i18n — detect language from Accept-Language header or query ?lang=zh
    I18nModule.forRoot({
      fallbackLanguage: 'zh',
      loaderOptions: {
        path: path.join(__dirname, '..', 'i18n'),
        watch: true,
      },
      resolvers: [new HeaderResolver(['accept-language'])],
    }),

    // Global database & cache
    PrismaModule,
    RedisModule,

    // Business modules
    HealthModule,
    UserModule,
    AuthModule,
    RbacModule,
  ],
  providers: [
    // Global auth guards (applied to all routes, @Public() to bypass)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
