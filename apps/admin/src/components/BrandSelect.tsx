'use client';

import { Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

export default function BrandSelect(props: { value?: number; onChange?: (v: number) => void }) {
  const { data } = useQuery({
    queryKey: ['brands-list'],
    queryFn: () => apiGet<{ list: any[] }>('/brands', { pageSize: 100 }),
  });

  return (
    <Select
      placeholder="选择品牌"
      allowClear
      showSearch
      optionFilterProp="label"
      value={props.value || undefined}
      onChange={props.onChange}
      loading={!data}
      options={data?.list?.map((b: any) => ({ label: b.name, value: b.id })) || []}
    />
  );
}
