import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

async function main() {
  console.log('🌱 Seeding database...');

  // ──── Permissions ────
  const permissionDefs = [
    { name: '用户查看', code: 'user:read', description: '查看用户列表与详情' },
    { name: '用户创建', code: 'user:create', description: '创建新用户' },
    { name: '用户编辑', code: 'user:update', description: '编辑用户信息' },
    { name: '用户删除', code: 'user:delete', description: '删除用户（软删除）' },
    { name: '角色管理', code: 'role:manage', description: '角色的创建、编辑、删除、分配' },
    { name: '商品查看', code: 'product:read', description: '查看商品列表与详情' },
    { name: '商品管理', code: 'product:manage', description: '商品的创建、编辑、删除' },
    { name: '订单查看', code: 'order:read', description: '查看订单列表与详情' },
    { name: '订单管理', code: 'order:manage', description: '订单状态流转、退款操作' },
    { name: '优惠券管理', code: 'coupon:manage', description: '优惠券的创建与管理' },
    { name: '操作日志', code: 'log:read', description: '查看操作日志' },
    { name: '系统设置', code: 'system:config', description: '修改系统配置' },
  ];

  const permissions: Record<string, number> = {};
  for (const def of permissionDefs) {
    const p = await prisma.permission.upsert({
      where: { code: def.code },
      update: {},
      create: def,
    });
    permissions[def.code] = p.id;
  }
  console.log(`  ✓ Created ${permissionDefs.length} permissions`);

  // ──── Roles ────
  const superAdminRole = await prisma.role.upsert({
    where: { code: 'super_admin' },
    update: {},
    create: {
      name: '超级管理员',
      code: 'super_admin',
      description: '拥有系统所有权限',
    },
  });
  console.log('  ✓ Created super_admin role');

  const adminRole = await prisma.role.upsert({
    where: { code: 'admin' },
    update: {},
    create: {
      name: '普通管理员',
      code: 'admin',
      description: '拥有有限的系统管理权限',
    },
  });
  console.log('  ✓ Created admin role');

  // ──── Assign all permissions to super_admin ────
  for (const permId of Object.values(permissions)) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: permId } },
      update: {},
      create: { roleId: superAdminRole.id, permissionId: permId },
    });
  }
  console.log('  ✓ Assigned all permissions to super_admin');

  // ──── Assign limited permissions to admin ────
  const adminPerms = [
    'user:read',
    'product:read',
    'product:manage',
    'order:read',
    'order:manage',
    'coupon:manage',
    'log:read',
  ];
  for (const code of adminPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permissions[code] } },
      update: {},
      create: { roleId: adminRole.id, permissionId: permissions[code] },
    });
  }
  console.log('  ✓ Assigned limited permissions to admin');

  // ──── Default super admin user ────
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const superUser = await prisma.user.upsert({
    where: { email: 'admin@ecom.com' },
    update: {},
    create: {
      email: 'admin@ecom.com',
      username: 'superadmin',
      password: hashedPassword,
      isActive: true,
    },
  });
  console.log(`  ✓ Created super admin user (admin@ecom.com / admin123)`);

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: superUser.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: superUser.id, roleId: superAdminRole.id },
  });
  console.log('  ✓ Assigned super_admin role to admin user');

  console.log('\n✅ Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
