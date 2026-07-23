'use client';

import { useState } from 'react';
import { Card, Input, Button, Space, Table, Tag, Empty, Descriptions } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import StoreHeader from '@/components/StoreHeader';
import { apiGet } from '@/lib/api';

const statusMap: Record<string, { label: string; color: string }> = {
  pending_payment: { label: '待支付', color: 'orange' },
  paid: { label: '已支付', color: 'blue' },
  shipped: { label: '已发货', color: 'cyan' },
  completed: { label: '已完成', color: 'green' },
  cancelled: { label: '已取消', color: 'default' },
  refunded: { label: '已退款', color: 'red' },
};

export default function OrderLookupPage() {
  const [keyword, setKeyword] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!keyword) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await apiGet<{ list: any[]; total: number }>('/orders', { keyword, pageSize: 50 });
      setOrders(data.list || []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <StoreHeader />
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
        <h2 style={{ fontSize: 24, marginBottom: 24 }}>📦 订单查询</h2>
        <Card>
          <Space style={{ width: '100%', marginBottom: 24 }}>
            <Input
              placeholder="输入订单号查询"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onPressEnter={search}
              style={{ width: 400 }}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={search} loading={loading}>
              查询
            </Button>
          </Space>

          {searched && orders.length === 0 && <Empty description="未找到订单" />}

          {orders.map((o: any) => (
            <Card
              key={o.id}
              style={{ marginBottom: 16 }}
              title={`订单号：${o.orderNo}`}
              extra={<Tag color={statusMap[o.status]?.color}>{statusMap[o.status]?.label || o.status}</Tag>}
            >
              <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
                <Descriptions.Item label="金额">¥{Number(o.totalAmount).toFixed(2)}</Descriptions.Item>
                <Descriptions.Item label="时间">{new Date(o.createdAt).toLocaleString()}</Descriptions.Item>
                {o.address && (
                  <>
                    <Descriptions.Item label="收货人">{o.address.receiverName}</Descriptions.Item>
                    <Descriptions.Item label="电话">{o.address.phone}</Descriptions.Item>
                    <Descriptions.Item label="地址" span={2}>
                      {o.address.province}
                      {o.address.city}
                      {o.address.district} {o.address.detail}
                    </Descriptions.Item>
                  </>
                )}
              </Descriptions>
              <Table
                rowKey="id"
                size="small"
                dataSource={o.items || []}
                pagination={false}
                columns={[
                  { title: '商品', dataIndex: 'productName' },
                  { title: 'SKU', dataIndex: 'skuCode' },
                  { title: '规格', dataIndex: 'specDesc', render: (v: string) => v || '-' },
                  { title: '单价', dataIndex: 'price', render: (v: string) => `¥${v}` },
                  { title: '数量', dataIndex: 'quantity' },
                ]}
              />
            </Card>
          ))}
        </Card>
      </div>
    </div>
  );
}
