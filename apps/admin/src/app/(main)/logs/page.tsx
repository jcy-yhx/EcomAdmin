'use client';

import { Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useState } from 'react';

export default function LogsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['logs', page],
    queryFn: () => apiGet<{ list: any[]; total: number }>('/operation-logs', { page, pageSize: 20 }),
  });

  const methodColors: Record<string, string> = { create: 'green', update: 'blue', delete: 'red' };

  return (
    <div>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.list || []}
        pagination={{ current: page, total: data?.total, onChange: setPage }}
        columns={[
          { title: '用户', dataIndex: 'username' },
          { title: '模块', dataIndex: 'module' },
          { title: '操作', dataIndex: 'action', render: (a: string) => <Tag color={methodColors[a]}>{a}</Tag> },
          { title: '详情', dataIndex: 'detail' },
          { title: 'IP', dataIndex: 'ip' },
          { title: '时间', dataIndex: 'createdAt', render: (t: string) => new Date(t).toLocaleString() },
        ]}
      />
    </div>
  );
}
