'use client';

import { useState } from 'react';
import { Table, Button, Tag, Space, Input, Modal, Form, Select, InputNumber } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { message } from 'antd';

export default function ProductsPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, keyword],
    queryFn: () => apiGet<{ list: any[]; total: number }>('/products', { page, pageSize: 10, keyword }),
  });

  const saveMutation = useMutation({
    mutationFn: (values: any) => (editing ? apiPatch(`/products/${editing.id}`, values) : apiPost('/products', values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setModalOpen(false);
      message.success(editing ? '已更新' : '已创建');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/products/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      message.success('已删除');
    },
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ status: 'draft' });
    setModalOpen(true);
  };
  const openEdit = (record: any) => {
    setEditing(record);
    form.setFieldsValue(record);
    setModalOpen(true);
  };

  const statusMap: Record<string, string> = { draft: '草稿', on_sale: '在售', off_sale: '下架' };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search placeholder="搜索商品..." onSearch={setKeyword} style={{ width: 300 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建商品
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.list || []}
        pagination={{ current: page, total: data?.total, onChange: setPage }}
        columns={[
          { title: '名称', dataIndex: 'name', key: 'name' },
          { title: '别名', dataIndex: 'slug', key: 'slug' },
          {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            render: (s: string) => (
              <Tag color={s === 'on_sale' ? 'green' : s === 'draft' ? 'default' : 'red'}>{statusMap[s]}</Tag>
            ),
          },
          { title: '品牌', key: 'brand', render: (_: any, r: any) => r.brand?.name || '-' },
          { title: '分类', key: 'category', render: (_: any, r: any) => r.category?.name || '-' },
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
        title={editing ? '编辑商品' : '新建商品'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate(v)}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="slug" label="别名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              options={[
                { label: '草稿', value: 'draft' },
                { label: '在售', value: 'on_sale' },
                { label: '下架', value: 'off_sale' },
              ]}
            />
          </Form.Item>
          <Form.Item name="categoryId" label="分类ID">
            <InputNumber />
          </Form.Item>
          <Form.Item name="brandId" label="品牌ID">
            <InputNumber />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
