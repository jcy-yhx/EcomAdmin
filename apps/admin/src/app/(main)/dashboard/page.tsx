'use client';

import { Card, Row, Col, Statistic, Table, Tag } from 'antd';
import { ShoppingOutlined, OrderedListOutlined, DollarOutlined, TeamOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

export default function DashboardPage() {
  const { data: products } = useQuery({
    queryKey: ['products', { pageSize: 1 }],
    queryFn: () => apiGet<{ total: number }>('/products', { pageSize: 1 }),
  });
  const { data: orders } = useQuery({
    queryKey: ['orders', { pageSize: 1 }],
    queryFn: () => apiGet<{ total: number; list: any[] }>('/orders', { pageSize: 1 }),
  });

  const stats = [
    { title: '商品总数', value: products?.total || 0, icon: <ShoppingOutlined />, color: '#1890ff' },
    { title: '订单总数', value: orders?.total || 0, icon: <OrderedListOutlined />, color: '#52c41a' },
    {
      title: '总金额(元)',
      value: orders?.list?.reduce((s: number, o: any) => s + Number(o.totalAmount), 0).toFixed(2) || 0,
      icon: <DollarOutlined />,
      color: '#faad14',
    },
    { title: '团队', value: 1, icon: <TeamOutlined />, color: '#722ed1' },
  ];

  const recentOrders =
    orders?.list
      ?.slice(0, 5)
      .map((o: any) => ({
        key: o.id,
        orderNo: o.orderNo,
        status: o.status,
        total: `¥${Number(o.totalAmount)}`,
        time: o.createdAt,
      })) || [];

  const statusMap: Record<string, string> = {
    pending_payment: '待支付',
    paid: '已支付',
    shipped: '已发货',
    completed: '已完成',
    cancelled: '已取消',
    refunded: '已退款',
  };

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 24 }}>
        {stats.map((s) => (
          <Col span={6} key={s.title}>
            <Card>
              <Statistic title={s.title} value={s.value} prefix={s.icon} valueStyle={{ color: s.color }} />
            </Card>
          </Col>
        ))}
      </Row>
      <Card title="最近订单">
        <Table
          dataSource={recentOrders}
          columns={[
            { title: '订单号', dataIndex: 'orderNo', key: 'orderNo' },
            { title: '金额', dataIndex: 'total', key: 'total' },
            {
              title: '状态',
              dataIndex: 'status',
              key: 'status',
              render: (s: string) => <Tag>{statusMap[s] || s}</Tag>,
            },
            { title: '时间', dataIndex: 'time', key: 'time', render: (t: string) => new Date(t).toLocaleString() },
          ]}
          pagination={false}
        />
      </Card>
    </div>
  );
}
