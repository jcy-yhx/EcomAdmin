'use client';

import { Layout, Menu, Input, Button, Space, Badge, theme } from 'antd';
import { ShoppingCartOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const { Header } = Layout;

export default function StoreHeader() {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const { token } = theme.useToken();

  // Count cart items from localStorage
  const cartCount = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('cart') || '[]').length : 0;

  const onSearch = () => {
    if (keyword) router.push(`/?keyword=${encodeURIComponent(keyword)}`);
  };

  return (
    <Header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: token.colorBgContainer,
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        padding: '0 48px',
      }}
    >
      <div
        style={{ fontSize: 20, fontWeight: 700, color: token.colorPrimary, cursor: 'pointer' }}
        onClick={() => router.push('/')}
      >
        EcomStore
      </div>
      <Space.Compact style={{ width: 400 }}>
        <Input
          placeholder="搜索商品..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={onSearch}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={onSearch} />
      </Space.Compact>
      <Space size="large">
        <Badge count={cartCount} showZero>
          <Button icon={<ShoppingCartOutlined />} onClick={() => router.push('/cart')}>
            购物车
          </Button>
        </Badge>
        <Button icon={<UserOutlined />} onClick={() => router.push('/order-lookup')}>
          订单查询
        </Button>
      </Space>
    </Header>
  );
}
