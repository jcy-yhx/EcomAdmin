import { Module } from '@nestjs/common';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';

@Module({
  providers: [RolesGuard, PermissionsGuard],
  exports: [RolesGuard, PermissionsGuard],
})
export class RbacModule {}
