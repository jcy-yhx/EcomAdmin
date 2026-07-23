'use client';

import { useState } from 'react';
import { Table, Button, Tag, Space, Input, Modal, Form, Select, InputNumber } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { message } from 'antd';
import CategorySelect from '@/components/CategorySelect';
import BrandSelect from '@/components/BrandSelect';

export default function ProductsPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, keyword],
    queryFn: () => apiGet<{ list: any[]; total: number }>('/products', { page, pageSize: 10, keyword }),
  });

  const saveMutation = useMutation({
    mutationFn: ({ editingId: _eid, ...values }: any) => {
      const data: any = {
        name: values.name,
        slug: values.slug,
        description: values.description || undefined,
        status: values.status,
        categoryId: values.categoryId || undefined,
        brandId: values.brandId || undefined,
      };
      // Create SKU from price/stock if provided (new product or update)
      if (values.price != null && values.price > 0) {
        data.skus = [
          {
            skuCode: values.skuCode || values.slug,
            price: values.price,
            stock: values.stock || 0,
          },
        ];
      }
      return _eid ? apiPatch(`/products/${_eid}`, data) : apiPost('/products', data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setModalOpen(false);
      message.success(variables.editingId ? '已更新' : '已创建');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || '操作失败';
      message.error(Array.isArray(msg) ? msg.join(', ') : msg);
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
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ status: 'draft' });
    setModalOpen(true);
  };
  const openEdit = (record: any) => {
    setEditingId(record.id);
    const firstSku = record.skus?.[0];
    form.setFieldsValue({
      name: record.name,
      slug: record.slug,
      description: record.description,
      status: record.status,
      categoryId: record.categoryId,
      brandId: record.brandId,
      skuCode: firstSku?.skuCode || undefined,
      price: firstSku ? Number(firstSku.price) : undefined,
      stock: firstSku?.stock ?? undefined,
    });
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
            title: '价格',
            key: 'price',
            render: (_: any, r: any) => {
              const p = r.skus?.[0]?.price;
              return p ? `¥${Number(p).toFixed(2)}` : '-';
            },
          },
          { title: '库存', key: 'stock', render: (_: any, r: any) => r.skus?.[0]?.stock ?? '-' },
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
        title={editingId ? '编辑商品' : '新建商品'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saveMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(v) => saveMutation.mutate({ editingId, ...v })}>
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
          <Form.Item name="categoryId" label="分类">
            <CategorySelect />
          </Form.Item>
          <Form.Item name="brandId" label="品牌">
            <BrandSelect />
          </Form.Item>
          <Form.Item name="skuCode" label="SKU 编码" tooltip="留空则自动使用别名">
            <Input placeholder="如 IP15P-BLACK-128G" />
          </Form.Item>
          <Form.Item name="price" label="价格 (¥)" rules={[{ required: true, message: '请输入价格' }]}>
            <InputNumber min={0.01} step={0.01} precision={2} style={{ width: '100%' }} placeholder="0.00" />
          </Form.Item>
          <Form.Item name="stock" label="库存">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
