'use client';

import { useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, Tag, Switch, message } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SafetyOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [roleForm] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: rolesData } = useQuery({
    queryKey: ['roles-list'],
    queryFn: () => apiGet<any[]>('/users/roles/list'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['users', page],
    queryFn: () => apiGet<{ list: any[]; total: number }>('/users', { page, pageSize: 10 }),
  });

  const createMutation = useMutation({
    mutationFn: (v: any) => apiPost('/auth/register', { email: v.email, username: v.username, password: v.password }),
    onSuccess: async (_data, v) => {
      // If role selected, assign after creation
      if (v.roleId) {
        // Find newly created user by email
        const users = await apiGet<{ list: any[] }>('/users', { keyword: v.email, pageSize: 1 });
        const newUser = users.list[0];
        if (newUser) {
          await apiPost(`/users/${newUser.id}/roles`, { roleIds: [v.roleId] });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setCreateOpen(false);
      message.success('用户已创建');
    },
    onError: (err: any) => message.error(err?.response?.data?.message || '创建失败'),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, ...v }: any) => apiPatch(`/users/${id}`, v),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditOpen(false);
      message.success('已更新');
    },
    onError: (err: any) => message.error(err?.response?.data?.message || '更新失败'),
  });

  const assignRoleMutation = useMutation({
    mutationFn: ({ userId, roleIds }: { userId: number; roleIds: number[] }) =>
      apiPost(`/users/${userId}/roles`, { roleIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setRoleOpen(false);
      message.success('角色已分配');
    },
    onError: (err: any) => message.error(err?.response?.data?.message || '分配失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      message.success('已删除');
    },
  });

  const openEdit = (user: any) => {
    setSelectedUser(user);
    editForm.setFieldsValue({ email: user.email, username: user.username, isActive: user.isActive });
    setEditOpen(true);
  };

  const openRoles = (user: any) => {
    setSelectedUser(user);
    roleForm.setFieldsValue({ roleId: user.roles?.[0]?.id || undefined });
    setRoleOpen(true);
  };

  const roleOptions = rolesData?.map((r: any) => ({ label: `${r.name} (${r.code})`, value: r.id })) || [];

  return (
    <div>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => {
          createForm.resetFields();
          setCreateOpen(true);
        }}
        style={{ marginBottom: 16 }}
      >
        新建用户
      </Button>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.list || []}
        pagination={{ current: page, total: data?.total, onChange: setPage }}
        columns={[
          { title: '邮箱', dataIndex: 'email' },
          { title: '用户名', dataIndex: 'username' },
          {
            title: '角色',
            dataIndex: 'roles',
            render: (roles: any[]) => (
              <Space size={4} wrap>
                {roles?.length > 0 ? (
                  roles.map((r: any) => (
                    <Tag key={r.id} color={r.code === 'super_admin' ? 'red' : 'blue'}>
                      {r.name}
                    </Tag>
                  ))
                ) : (
                  <Tag>普通用户</Tag>
                )}
              </Space>
            ),
          },
          {
            title: '状态',
            dataIndex: 'isActive',
            render: (v: boolean) => <Tag color={v ? 'green' : 'red'}>{v ? '正常' : '禁用'}</Tag>,
          },
          { title: '注册时间', dataIndex: 'createdAt', render: (t: string) => new Date(t).toLocaleString() },
          {
            title: '操作',
            key: 'actions',
            render: (_: any, r: any) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>
                  编辑
                </Button>
                <Button size="small" icon={<SafetyOutlined />} onClick={() => openRoles(r)}>
                  角色
                </Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => deleteMutation.mutate(r.id)}>
                  删除
                </Button>
              </Space>
            ),
          },
        ]}
      />

      {/* Create User Modal */}
      <Modal
        title="新建用户"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
      >
        <Form form={createForm} layout="vertical" onFinish={(v) => createMutation.mutate(v)}>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="username" label="用户名" rules={[{ required: true, min: 3 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="roleId" label="角色（可选）">
            <Select allowClear placeholder="留空为普通用户（无后台权限）" options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        title="编辑用户"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => editForm.submit()}
        confirmLoading={editMutation.isPending}
      >
        <Form form={editForm} layout="vertical" onFinish={(v) => editMutation.mutate({ id: selectedUser?.id, ...v })}>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="username" label="用户名" rules={[{ required: true, min: 3 }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="新密码（留空不修改）">
            <Input.Password />
          </Form.Item>
          <Form.Item name="isActive" label="状态" valuePropName="checked">
            <Switch checkedChildren="正常" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Assign Role Modal */}
      <Modal
        title={`分配角色 — ${selectedUser?.email || ''}`}
        open={roleOpen}
        onCancel={() => setRoleOpen(false)}
        onOk={() => roleForm.submit()}
        confirmLoading={assignRoleMutation.isPending}
      >
        <Form
          form={roleForm}
          layout="vertical"
          onFinish={(v) => assignRoleMutation.mutate({ userId: selectedUser?.id, roleIds: v.roleId ? [v.roleId] : [] })}
        >
          <Form.Item name="roleId" label="角色">
            <Select placeholder="选择角色" allowClear options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
