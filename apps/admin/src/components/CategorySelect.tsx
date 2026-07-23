'use client';

import { Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

interface CategoryOption {
  label: string;
  value: number;
}

function flattenTree(nodes: any[]): CategoryOption[] {
  const result: CategoryOption[] = [];
  function walk(list: any[], prefix: string) {
    list.forEach((c) => {
      const label = prefix ? `${prefix} > ${c.name}` : c.name;
      result.push({ label, value: c.id });
      if (c.children?.length) walk(c.children, label);
    });
  }
  walk(nodes, '');
  return result;
}

export default function CategorySelect(props: { value?: number; onChange?: (v: number) => void }) {
  const { data } = useQuery({
    queryKey: ['categories-tree'],
    queryFn: () => apiGet<any[]>('/categories/tree'),
  });

  return (
    <Select
      placeholder="选择分类"
      allowClear
      showSearch
      optionFilterProp="label"
      value={props.value || undefined}
      onChange={props.onChange}
      loading={!data}
      options={data ? flattenTree(data) : []}
    />
  );
}
