'use client';

import { Table, Button, Space, Modal, Form, Input, InputNumber, Select, DatePicker } from 'antd';
import { PlusOutlined, SendOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { message } from 'antd';
import { useState } from 'react';
import dayjs from 'dayjs';

export default function CouponsPage() {
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number>(0);
  const [form] = Form.useForm();
  const [issueForm] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['coupons', page],
    queryFn: () => apiGet<{ list: any[]; total: number }>('/coupons', { page, pageSize: 10 }),
  });

  const createMutation = useMutation({
    mutationFn: (v: any) =>
      apiPost('/coupons', { ...v, startAt: v.range[0].toISOString(), endAt: v.range[1].toISOString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      setModalOpen(false);
      message.success('优惠券已创建');
    },
  });

  const issueMutation = useMutation({
    mutationFn: (v: any) => apiPost(`/coupons/${selectedId}/issue`, v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      setIssueOpen(false);
      message.success('已发放');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/coupons/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] });
      message.success('已删除');
    },
  });

  return (
    <div>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => {
          form.resetFields();
          setModalOpen(true);
        }}
        style={{ marginBottom: 16 }}
      >
        新建优惠券
      </Button>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.list || []}
        pagination={{ current: page, total: data?.total, onChange: setPage }}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '码', dataIndex: 'code' },
          { title: '类型', dataIndex: 'type', render: (v: string) => (v === 'fixed' ? '固定金额' : '百分比') },
          { title: '面值', dataIndex: 'value', render: (v: string) => `¥${v}` },
          { title: '已用/总量', key: 'usage', render: (_: any, r: any) => `${r.usedCount}/${r.totalCount}` },
          {
            title: '操作',
            key: 'actions',
            render: (_: any, r: any) => (
              <Space>
                <Button
                  size="small"
                  icon={<SendOutlined />}
                  onClick={() => {
                    setSelectedId(r.id);
                    issueForm.resetFields();
                    setIssueOpen(true);
                  }}
                >
                  发放
                </Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteMutation.mutate(r.id)}>
                  删除
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal title="新建优惠券" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="code" label="优惠码" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="类型" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '固定金额', value: 'fixed' },
                { label: '百分比', value: 'percentage' },
              ]}
            />
          </Form.Item>
          <Form.Item name="value" label="面值" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="minAmount" label="最低消费">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="totalCount" label="总数量" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="range" label="有效期" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title="发放优惠券" open={issueOpen} onCancel={() => setIssueOpen(false)} onOk={() => issueForm.submit()}>
        <Form form={issueForm} layout="vertical" onFinish={(v) => issueMutation.mutate(v)}>
          <Form.Item name="userIds" label="用户ID列表（逗号分隔）" rules={[{ required: true }]}>
            <Select mode="tags" placeholder="输入用户ID，回车添加" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
