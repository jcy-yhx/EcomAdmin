'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, Row, Col, Input, Tag, Select, Pagination, Spin, Empty } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/api';
import StoreHeader from '@/components/StoreHeader';

function ProductList() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState(searchParams.get('keyword') || '');
  const [categoryId, setCategoryId] = useState<number | undefined>();

  const { data: cats } = useQuery({
    queryKey: ['cat-list'],
    queryFn: () => apiGet<{ list: any[] }>('/categories', { pageSize: 100 }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, keyword, categoryId],
    queryFn: () =>
      apiGet<{ list: any[]; total: number }>('/products', {
        page,
        pageSize: 12,
        keyword,
        categoryId,
        status: 'on_sale',
      }),
  });

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索商品..."
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setPage(1);
          }}
          style={{ width: 300 }}
        />
        <Select
          placeholder="全部分类"
          allowClear
          style={{ width: 180 }}
          onChange={(v) => {
            setCategoryId(v);
            setPage(1);
          }}
          options={cats?.list?.map((c: any) => ({ label: c.name, value: c.id })) || []}
        />
      </div>

      <Spin spinning={isLoading}>
        {data?.list?.length ? (
          <Row gutter={[16, 16]}>
            {data.list.map((p: any) => (
              <Col key={p.id} xs={24} sm={12} md={8} lg={6}>
                <Card
                  hoverable
                  cover={
                    p.images?.[0] ? (
                      <img alt={p.name} src={p.images[0].url} style={{ height: 200, objectFit: 'cover' }} />
                    ) : (
                      <div
                        style={{
                          height: 200,
                          background: '#f5f5f5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        暂无图片
                      </div>
                    )
                  }
                  onClick={() => router.push(`/products/${p.slug}`)}
                >
                  <Card.Meta
                    title={p.name}
                    description={
                      <div>
                        <div style={{ color: '#f5222d', fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                          ¥{p.skus?.[0] ? Number(p.skus[0].price).toFixed(2) : '—'}
                        </div>
                        <Tag>{p.status === 'on_sale' ? '在售' : p.status}</Tag>
                        {p.brand && <Tag color="blue">{p.brand.name}</Tag>}
                      </div>
                    }
                  />
                </Card>
              </Col>
            ))}
          </Row>
        ) : (
          !isLoading && <Empty description="暂无商品" />
        )}
      </Spin>

      {data && data.total > 12 && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Pagination current={page} total={data.total} pageSize={12} onChange={setPage} showSizeChanger={false} />
        </div>
      )}
    </div>
  );
}

export default function StoreHomePage() {
  return (
    <div>
      <StoreHeader />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px' }}>
        <h1 style={{ fontSize: 24, marginBottom: 24 }}>全部商品</h1>
        <Suspense fallback={<Spin />}>
          <ProductList />
        </Suspense>
      </div>
    </div>
  );
}
