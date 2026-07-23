'use client';

import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Divider, message, Table, Space } from 'antd';
import { useRouter } from 'next/navigation';
import StoreHeader from '@/components/StoreHeader';
import { apiPost } from '@/lib/api';

interface CartItem {
  skuId: number;
  quantity: number;
  productName: string;
  skuCode: string;
  price: number;
  image: string | null;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    setItems(cart);
    if (cart.length === 0) {
      message.warning('购物车为空，请先添加商品');
      router.push('/cart');
    }
  }, [router]);

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const onSubmit = async (values: any) => {
    // Login first to get a token
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        message.warning('请先登录后再下单（管理中创建的用户可直接登录）');
        setLoading(false);
        return;
      }

      // Add items to Redis cart (call backend cart API)
      for (const item of items) {
        await apiPost('/cart', { skuId: item.skuId, quantity: item.quantity });
      }

      // Create order
      const order = await apiPost<any>('/orders', {
        address: {
          receiverName: values.receiverName,
          phone: values.phone,
          province: values.province,
          city: values.city,
          district: values.district,
          detail: values.detail,
        },
        remark: values.remark,
      });

      // Clear local cart
      localStorage.removeItem('cart');
      message.success(`订单创建成功！订单号: ${order.orderNo}`);

      // Redirect to Stripe checkout if available
      try {
        const payment = await apiPost<any>(`/payments/checkout/${order.id}`);
        window.location.href = payment.checkoutUrl;
      } catch {
        window.location.href = `/order-lookup?orderNo=${order.orderNo}`;
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || '下单失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <StoreHeader />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
        <h2 style={{ fontSize: 24, marginBottom: 24 }}>📝 确认订单</h2>

        {/* Order Summary */}
        <Card title="订单商品" style={{ marginBottom: 24 }}>
          <Table
            rowKey="skuId"
            dataSource={items}
            pagination={false}
            columns={[
              { title: '商品', dataIndex: 'productName' },
              { title: 'SKU', dataIndex: 'skuCode' },
              { title: '单价', dataIndex: 'price', render: (v: number) => `¥${v.toFixed(2)}` },
              { title: '数量', dataIndex: 'quantity' },
              { title: '小计', render: (_: any, r: CartItem) => `¥${(r.price * r.quantity).toFixed(2)}` },
            ]}
          />
          <div style={{ textAlign: 'right', marginTop: 16, fontSize: 24 }}>
            合计：<span style={{ color: '#f5222d', fontWeight: 700 }}>¥{total.toFixed(2)}</span>
          </div>
        </Card>

        {/* Shipping Address */}
        <Card title="收货地址">
          <Form
            form={form}
            layout="vertical"
            onFinish={onSubmit}
            initialValues={{
              receiverName: '张三',
              phone: '13800138000',
              province: '广东省',
              city: '深圳市',
              district: '南山区',
              detail: '科技园路1号创新大厦A座1201室',
            }}
          >
            <Form.Item name="receiverName" label="收货人" rules={[{ required: true, message: '请输入收货人' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="电话" rules={[{ required: true, message: '请输入电话' }]}>
              <Input />
            </Form.Item>
            <Space style={{ width: '100%' }}>
              <Form.Item name="province" label="省" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="city" label="市" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="district" label="区">
                <Input />
              </Form.Item>
            </Space>
            <Form.Item name="detail" label="详细地址" rules={[{ required: true, message: '请输入详细地址' }]}>
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="remark" label="备注">
              <Input.TextArea rows={1} placeholder="如有特殊需求请备注" />
            </Form.Item>
            <Button type="primary" size="large" htmlType="submit" loading={loading} block>
              提交订单 ¥{total.toFixed(2)}
            </Button>
          </Form>
        </Card>
      </div>
    </div>
  );
}
