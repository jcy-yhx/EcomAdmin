'use client';

import { useEffect, useState } from 'react';
import { Table, Button, InputNumber, Space, Empty, Card } from 'antd';
import { DeleteOutlined, ShoppingOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import StoreHeader from '@/components/StoreHeader';

interface CartItem {
  skuId: number;
  quantity: number;
  productName: string;
  skuCode: string;
  price: number;
  image: string | null;
}

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(JSON.parse(localStorage.getItem('cart') || '[]'));
  }, []);

  const updateQuantity = (skuId: number, quantity: number) => {
    const updated = items.map((item) => (item.skuId === skuId ? { ...item, quantity } : item));
    setItems(updated);
    localStorage.setItem('cart', JSON.stringify(updated));
  };

  const removeItem = (skuId: number) => {
    const updated = items.filter((item) => item.skuId !== skuId);
    setItems(updated);
    localStorage.setItem('cart', JSON.stringify(updated));
  };

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <div>
      <StoreHeader />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
        <h2 style={{ fontSize: 24, marginBottom: 24 }}>🛒 购物车</h2>

        {items.length === 0 ? (
          <Card>
            <Empty description="购物车是空的" />
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Button type="primary" size="large" icon={<ShoppingOutlined />} onClick={() => router.push('/')}>
                去逛逛
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <Table
              rowKey="skuId"
              dataSource={items}
              pagination={false}
              columns={[
                { title: '商品', dataIndex: 'productName', key: 'productName' },
                { title: 'SKU', dataIndex: 'skuCode', key: 'skuCode' },
                { title: '单价', dataIndex: 'price', key: 'price', render: (v: number) => `¥${v.toFixed(2)}` },
                {
                  title: '数量',
                  key: 'quantity',
                  render: (_: any, r: CartItem) => (
                    <InputNumber
                      min={1}
                      max={99}
                      value={r.quantity}
                      onChange={(v) => updateQuantity(r.skuId, v || 1)}
                    />
                  ),
                },
                {
                  title: '小计',
                  key: 'subtotal',
                  render: (_: any, r: CartItem) => `¥${(r.price * r.quantity).toFixed(2)}`,
                },
                {
                  title: '操作',
                  key: 'action',
                  render: (_: any, r: CartItem) => (
                    <Button danger icon={<DeleteOutlined />} onClick={() => removeItem(r.skuId)} />
                  ),
                },
              ]}
            />
            <div style={{ textAlign: 'right', padding: '24px 0', fontSize: 20 }}>
              合计：<span style={{ color: '#f5222d', fontWeight: 700, fontSize: 28 }}>¥{total.toFixed(2)}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Button type="primary" size="large" onClick={() => router.push('/checkout')}>
                去结算
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
