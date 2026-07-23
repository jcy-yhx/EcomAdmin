'use client';

import { useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, InputNumber, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';

export default function BrandsPage() {
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['brands', page],
    queryFn: () => apiGet<{ list: any[]; total: number }>('/brands', { page, pageSize: 10 }),
  });

  const saveMutation = useMutation({
    mutationFn: ({ editingId: _eid, ...values }: any) =>
      _eid ? apiPatch(`/brands/${_eid}`, values) : apiPost('/brands', values),
    onSuccess: (_data, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      setModalOpen(false);
      message.success(variables.editingId ? '已更新' : '已创建');
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || '操作失败');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/brands/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brands'] });
      message.success('已删除');
    },
  });

  const openCreate = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ sortOrder: 0 });
    setModalOpen(true);
  };
  const openEdit = (r: any) => {
    setEditingId(r.id);
    form.setFieldsValue(r);
    setModalOpen(true);
  };

  return (
    <div>
      <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ marginBottom: 16 }}>
        新建品牌
      </Button>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.list || []}
        pagination={{ current: page, total: data?.total, onChange: setPage }}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '官网', dataIndex: 'website', render: (v: string) => v || '-' },
          { title: '排序', dataIndex: 'sortOrder' },
          {
            title: '操作',
            key: 'actions',
            render: (_: any, r: any) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
                  编辑
                </Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteMutation.mutate(r.id)}>
                  删除
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editingId ? '编辑品牌' : '新建品牌'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate({ editingId, ...v })}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="logo" label="Logo URL">
            <Input />
          </Form.Item>
          <Form.Item name="website" label="官网">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
