'use client';

import { useState } from 'react';
import { Table, Button, Tag, Space, Modal, Form, Input, InputNumber, Select, Popconfirm, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';

export default function CategoriesPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: treeData } = useQuery({
    queryKey: ['categories-tree'],
    queryFn: () => apiGet<any[]>('/categories/tree'),
  });

  // Flatten tree to list for table display
  function flattenForTable(nodes: any[], depth = 0): any[] {
    return nodes.flatMap((c) => [{ ...c, depth }, ...flattenForTable(c.children || [], depth + 1)]);
  }

  const flatList = treeData ? flattenForTable(treeData) : [];

  // For parent selector — show all categories as options
  const { data: catList } = useQuery({
    queryKey: ['cat-list'],
    queryFn: () => apiGet<{ list: any[] }>('/categories', { pageSize: 200 }),
  });

  const saveMutation = useMutation({
    mutationFn: ({ editingId: _eid, ...values }: any) =>
      _eid ? apiPatch(`/categories/${_eid}`, values) : apiPost('/categories', values),
    onSuccess: (_data, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ['categories-tree'] });
      queryClient.invalidateQueries({ queryKey: ['cat-list'] });
      setModalOpen(false);
      message.success(variables.editingId ? '已更新' : '已创建');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || '操作失败';
      message.error(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories-tree'] });
      queryClient.invalidateQueries({ queryKey: ['cat-list'] });
      message.success('已删除');
    },
    onError: (err: any) => {
      message.error(err?.response?.data?.message || '删除失败');
    },
  });

  const openCreate = (parentId?: number) => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ parentId: parentId || undefined, sortOrder: 0 });
    setModalOpen(true);
  };

  const openEdit = (record: any) => {
    setEditingId(record.id);
    form.setFieldsValue({
      name: record.name,
      slug: record.slug,
      icon: record.icon,
      sortOrder: record.sortOrder,
      parentId: record.parentId,
    });
    setModalOpen(true);
  };

  return (
    <div>
      <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()} style={{ marginBottom: 16 }}>
        新建分类
      </Button>
      <Table
        rowKey="id"
        dataSource={flatList}
        pagination={false}
        columns={[
          {
            title: '名称',
            dataIndex: 'name',
            render: (v: string, r: any) => (
              <span style={{ paddingLeft: r.depth * 24 }}>
                {r.depth > 0 ? '└ ' : ''}
                {v}
              </span>
            ),
          },
          { title: '别名', dataIndex: 'slug' },
          { title: '排序', dataIndex: 'sortOrder' },
          {
            title: '子分类',
            key: 'children',
            render: (_: any, r: any) => (r.children?.length ? <Tag>{r.children.length} 个</Tag> : '-'),
          },
          {
            title: '操作',
            key: 'actions',
            render: (_: any, r: any) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
                  编辑
                </Button>
                <Button size="small" icon={<PlusOutlined />} onClick={() => openCreate(r.id)}>
                  加子级
                </Button>
                <Popconfirm title="确定删除？" onConfirm={() => deleteMutation.mutate(r.id)}>
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editingId ? '编辑分类' : '新建分类'}
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
          <Form.Item name="parentId" label="父分类">
            <Select
              allowClear
              placeholder="留空为顶级分类"
              showSearch
              optionFilterProp="label"
              options={catList?.list?.map((c: any) => ({ label: c.name, value: c.id })) || []}
            />
          </Form.Item>
          <Form.Item name="icon" label="图标">
            <Input placeholder="可选" />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
