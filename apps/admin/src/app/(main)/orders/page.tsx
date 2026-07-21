'use client';

import { useState } from 'react';
import { Table, Tag, Space, Input, Select, Button, Modal, Descriptions } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '@/lib/api';
import { message } from 'antd';

const statusMap: Record<string, { label: string; color: string }> = {
  pending_payment: { label: '待支付', color: 'orange' },
  paid: { label: '已支付', color: 'blue' },
  shipped: { label: '已发货', color: 'cyan' },
  completed: { label: '已完成', color: 'green' },
  cancelled: { label: '已取消', color: 'default' },
  refunding: { label: '退款中', color: 'purple' },
  refunded: { label: '已退款', color: 'red' },
};

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>();
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page, status],
    queryFn: () => apiGet<{ list: any[]; total: number }>('/orders', { page, pageSize: 10, status }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => apiPatch(`/orders/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      message.success('状态已更新');
      setDetailOpen(false);
    },
  });

  const viewDetail = (order: any) => {
    setSelectedOrder(order);
    setDetailOpen(true);
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="订单状态"
          allowClear
          style={{ width: 140 }}
          onChange={setStatus}
          options={Object.entries(statusMap).map(([k, v]) => ({ label: v.label, value: k }))}
        />
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.list || []}
        pagination={{ current: page, total: data?.total, onChange: setPage }}
        columns={[
          { title: '订单号', dataIndex: 'orderNo' },
          { title: '金额', dataIndex: 'totalAmount', render: (v: string) => `¥${v}` },
          {
            title: '状态',
            dataIndex: 'status',
            render: (s: string) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.label || s}</Tag>,
          },
          { title: '收货人', key: 'receiver', render: (_: any, r: any) => r.address?.receiverName || '-' },
          { title: '时间', dataIndex: 'createdAt', render: (t: string) => new Date(t).toLocaleString() },
          {
            title: '操作',
            key: 'actions',
            render: (_: any, r: any) => (
              <Button size="small" icon={<EyeOutlined />} onClick={() => viewDetail(r)}>
                详情
              </Button>
            ),
          },
        ]}
      />
      <Modal title="订单详情" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={640}>
        {selectedOrder && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="订单号">{selectedOrder.orderNo}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusMap[selectedOrder.status]?.color}>{statusMap[selectedOrder.status]?.label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="总金额">¥{Number(selectedOrder.totalAmount)}</Descriptions.Item>
            <Descriptions.Item label="备注">{selectedOrder.remark || '-'}</Descriptions.Item>
            {selectedOrder.address && (
              <>
                <Descriptions.Item label="收货人">{selectedOrder.address.receiverName}</Descriptions.Item>
                <Descriptions.Item label="电话">{selectedOrder.address.phone}</Descriptions.Item>
                <Descriptions.Item label="地址" span={2}>
                  {selectedOrder.address.province}
                  {selectedOrder.address.city}
                  {selectedOrder.address.district} {selectedOrder.address.detail}
                </Descriptions.Item>
              </>
            )}
          </Descriptions>
        )}
        {selectedOrder?.items?.length > 0 && (
          <Table
            rowKey="id"
            style={{ marginTop: 16 }}
            size="small"
            dataSource={selectedOrder.items}
            pagination={false}
            columns={[
              { title: '商品', dataIndex: 'productName' },
              { title: 'SKU', dataIndex: 'skuCode' },
              { title: '单价', dataIndex: 'price', render: (v: string) => `¥${v}` },
              { title: '数量', dataIndex: 'quantity' },
            ]}
          />
        )}
        {selectedOrder && statusMap[selectedOrder.status] && (
          <Space style={{ marginTop: 16 }}>
            <span>操作：</span>
            {selectedOrder.status === 'pending_payment' && (
              <Button onClick={() => statusMutation.mutate({ id: selectedOrder.id, status: 'paid' })}>
                标记已支付
              </Button>
            )}
            {selectedOrder.status === 'paid' && (
              <Button onClick={() => statusMutation.mutate({ id: selectedOrder.id, status: 'shipped' })}>
                标记已发货
              </Button>
            )}
            {selectedOrder.status === 'shipped' && (
              <Button onClick={() => statusMutation.mutate({ id: selectedOrder.id, status: 'completed' })}>
                标记已完成
              </Button>
            )}
            {['pending_payment', 'paid'].includes(selectedOrder.status) && (
              <Button danger onClick={() => statusMutation.mutate({ id: selectedOrder.id, status: 'cancelled' })}>
                取消订单
              </Button>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}
