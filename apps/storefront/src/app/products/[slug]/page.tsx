'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, Row, Col, Tag, Button, InputNumber, Radio, Space, Spin, Divider, Image, message } from 'antd';
import { ShoppingCartOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import StoreHeader from '@/components/StoreHeader';
import axios from 'axios';

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const [selectedSkuId, setSelectedSkuId] = useState<number>(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', params.slug],
    queryFn: async () => {
      // find product by slug via list API with keyword=slug
      const list = await apiGet<{ list: any[] }>('/products', { keyword: params.slug, pageSize: 1 });
      if (!list.list.length) throw new Error('商品不存在');
      // fetch detail by id
      return apiGet<any>(`/products/${list.list[0].id}`);
    },
  });

  // Build spec filter groups from SKUs
  const specGroups: Map<number, { name: string; values: Map<number, string> }> = new Map();
  product?.skus?.forEach((sku: any) => {
    sku.skuSpecs?.forEach((ss: any) => {
      if (!specGroups.has(ss.spec.id)) specGroups.set(ss.spec.id, { name: ss.spec.name, values: new Map() });
      specGroups.get(ss.spec.id)!.values.set(ss.specValue.id, ss.specValue.value);
    });
  });

  const selectedSku = product?.skus?.find((s: any) => s.id === selectedSkuId);

  const addToCart = () => {
    if (!selectedSkuId) {
      message.warning('请选择规格');
      return;
    }
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const existing = cart.find((c: any) => c.skuId === selectedSkuId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.push({
        skuId: selectedSkuId,
        quantity,
        productName: product.name,
        skuCode: selectedSku?.skuCode,
        price: Number(selectedSku?.price || 0),
        image: product.images?.[0]?.url || null,
      });
    }
    localStorage.setItem('cart', JSON.stringify(cart));
    message.success('已加入购物车');
  };

  const buyNow = () => {
    addToCart();
    router.push('/checkout');
  };

  if (isLoading)
    return (
      <div>
        <StoreHeader />
        <div style={{ textAlign: 'center', padding: 100 }}>
          <Spin size="large" />
        </div>
      </div>
    );
  if (!product)
    return (
      <div>
        <StoreHeader />
        <div style={{ textAlign: 'center', padding: 100 }}>商品不存在</div>
      </div>
    );

  return (
    <div>
      <StoreHeader />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <Row gutter={48}>
          {/* Images */}
          <Col xs={24} md={10}>
            {product.images?.length ? (
              <>
                <Image
                  src={product.images[selectedImage]?.url}
                  alt={product.name}
                  style={{ width: '100%', borderRadius: 8 }}
                />
                <Space style={{ marginTop: 8 }}>
                  {product.images.map((img: any, i: number) => (
                    <img
                      key={i}
                      src={img.url}
                      alt=""
                      style={{
                        width: 60,
                        height: 60,
                        objectFit: 'cover',
                        border: i === selectedImage ? '2px solid #1890ff' : '1px solid #d9d9d9',
                        borderRadius: 4,
                      }}
                      onClick={() => setSelectedImage(i)}
                    />
                  ))}
                </Space>
              </>
            ) : (
              <div
                style={{
                  width: '100%',
                  height: 400,
                  background: '#f5f5f5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                暂无图片
              </div>
            )}
          </Col>

          {/* Info */}
          <Col xs={24} md={14}>
            <h1 style={{ fontSize: 28, marginBottom: 8 }}>{product.name}</h1>
            <div style={{ color: '#f5222d', fontSize: 28, fontWeight: 700, marginBottom: 16 }}>
              ¥
              {selectedSku
                ? Number(selectedSku.price).toFixed(2)
                : product.skus?.length
                  ? `${Number(product.skus[0].price).toFixed(2)} 起`
                  : '—'}
            </div>

            <Divider />

            {/* Spec Selection */}
            {[...specGroups.entries()].map(([specId, group]) => (
              <div key={specId} style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{group.name}</div>
                <Radio.Group>
                  {[...group.values.entries()].map(([valId, valName]) => (
                    <Radio.Button
                      key={valId}
                      value={valId}
                      checked={product.skus?.some(
                        (s: any) => s.id === selectedSkuId && s.skuSpecs?.some((ss: any) => ss.specValue.id === valId),
                      )}
                      onClick={() => {
                        // Find matching SKU by this spec value
                        const match = product.skus?.find(
                          (s: any) =>
                            s.skuSpecs?.some((ss: any) => ss.specValue.id === valId) &&
                            [...specGroups.entries()].every(
                              ([sid]) =>
                                sid === specId ||
                                s.skuSpecs?.some(
                                  (sp: any) =>
                                    sp.specValue.id ===
                                    (() => {
                                      // keep existing selections for other specs
                                      const currentSku = product.skus?.find((sk: any) => sk.id === selectedSkuId);
                                      return currentSku?.skuSpecs?.find((sp2: any) => sp2.spec.id === sid)?.specValue
                                        .id;
                                    })(),
                                ),
                            ),
                        );
                        if (match) setSelectedSkuId(match.id);
                      }}
                    >
                      {valName}
                    </Radio.Button>
                  ))}
                </Radio.Group>
              </div>
            ))}

            <Divider />

            {/* Quantity & Actions */}
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <Space>
                <span>数量：</span>
                <InputNumber
                  min={1}
                  max={selectedSku?.stock || 99}
                  value={quantity}
                  onChange={(v) => setQuantity(v || 1)}
                />
                {selectedSku && <span style={{ color: '#999' }}>库存 {selectedSku.stock} 件</span>}
              </Space>
              <Space size="large">
                <Button type="primary" icon={<ShoppingCartOutlined />} size="large" onClick={addToCart}>
                  加入购物车
                </Button>
                <Button danger type="primary" icon={<ThunderboltOutlined />} size="large" onClick={buyNow}>
                  立即购买
                </Button>
              </Space>
            </Space>

            {/* Description */}
            {product.description && (
              <>
                <Divider>商品描述</Divider>
                <div style={{ whiteSpace: 'pre-wrap', color: '#666' }}>{product.description}</div>
              </>
            )}
          </Col>
        </Row>
      </div>
    </div>
  );
}
