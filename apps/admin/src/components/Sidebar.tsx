'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  ShoppingOutlined,
  OrderedListOutlined,
  UserOutlined,
  GiftOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { useAuth } from '@/lib/auth';

const { Sider } = Layout;

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/products', icon: <ShoppingOutlined />, label: '商品管理', permission: 'product:read' },
  { key: '/orders', icon: <OrderedListOutlined />, label: '订单管理', permission: 'order:read' },
  { key: '/users', icon: <UserOutlined />, label: '用户管理', permission: 'user:read' },
  { key: '/coupons', icon: <GiftOutlined />, label: '优惠券管理', permission: 'coupon:manage' },
  { key: '/logs', icon: <FileTextOutlined />, label: '操作日志', permission: 'log:read' },
];

export default function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { hasPermission } = useAuth();

  const visibleItems = menuItems
    .filter((item) => !item.permission || hasPermission(item.permission))
    .map(({ permission, ...rest }) => rest);

  return (
    <Sider trigger={null} collapsible collapsed={collapsed} theme="dark">
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 700,
          fontSize: collapsed ? 14 : 18,
        }}
      >
        {collapsed ? 'Ecom' : 'EcomAdmin'}
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[pathname]}
        items={visibleItems}
        onClick={({ key }) => router.push(key)}
      />
    </Sider>
  );
}
