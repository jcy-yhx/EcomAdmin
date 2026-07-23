## 阶段 7：《用户端 Storefront（极简版）》学习文档

### 1. 本阶段目标

构建面向 C 端用户的电商商城，实现从"商品浏览 → 规格选择 → 加购 → 下单 → 支付"的完整闭环，同时提供订单查询入口，打通全栈交易链路。

---

### 2. 核心知识点总结

- **Next.js 动态路由**：`app/products/[slug]/page.tsx` — 用 `useParams<{ slug }>()` 匹配商品别名
- **`useSearchParams` + `Suspense`**：Next.js 中 `useSearchParams()` 必须包裹在 `<Suspense>` 中，防止静态生成时崩溃
- **localStorage 购物车**：Guest 用户购物车存在浏览器 `localStorage`，登录用户走 Redis（通过后端 Cart API）
- **SKU 规格选择 UI**：从前端 SKU 列表中动态提取 `specGroups`（Map 去重），`Radio.Group` 渲染规格选择器
- **搜索参数同步**：URL `?keyword=xxx` → `useSearchParams()` 读取 → 自动填入搜索框 → 触发 API 查询
- **公开 API 设计**：商品浏览、分类树等读接口加 `@Public()` 装饰器，写操作（下单）仍需认证
- **Checkout 流程**：localStorage cart → API 同步到 Redis cart → 创建订单 → 获取 Stripe Checkout URL → 重定向支付
- **订单查询**：按订单号搜索，展示全量信息（地址 + 商品明细 + 状态标签）

---

### 3. 关键实现与代码解析

#### 3.1 localStorage 购物车 (`src/app/cart/page.tsx` + `src/app/checkout/page.tsx`)

```typescript
// 加入购物车 — 直接操作 localStorage
const addToCart = () => {
  const cart = JSON.parse(localStorage.getItem('cart') || '[]');
  const existing = cart.find((c: any) => c.skuId === selectedSkuId);
  if (existing) {
    existing.quantity += quantity; // 已存在则叠加数量
  } else {
    cart.push({ skuId, quantity, productName, skuCode, price, image });
  }
  localStorage.setItem('cart', JSON.stringify(cart));
};
```

**为什么未登录用户不存在 Redis/DB**：Storefront 面向游客开放浏览，不应强制登录。localStorage 的缺点：跨设备不同步、清除浏览器数据会丢失。实际生产环境可以：检测到登录后自动将 localStorage cart 合并到 Redis cart。

**下单时 Cart 同步**：Checkout 页先将 localStorage 的 cart 通过 `POST /cart` 逐个写入后端 Redis，再调 `POST /orders` 创建订单。这和阶段 4 的 Admin 下单流程一致——都是"从 Redis cart → 创建订单"。

#### 3.2 SKU 规格选择器 (`src/app/products/[slug]/page.tsx`)

```typescript
// 从 SKU 列表中动态构建规格分组
const specGroups = new Map<number, { name: string; values: Map<number, string> }>();
product.skus.forEach((sku) => {
  sku.skuSpecs.forEach((ss) => {
    if (!specGroups.has(ss.spec.id)) specGroups.set(ss.spec.id, { name: ss.spec.name, values: new Map() });
    specGroups.get(ss.spec.id)!.values.set(ss.specValue.id, ss.specValue.value);
  });
});
```

**为什么要前端构建规格分组而不是后端返回**：后端返回的是 SKU 列表（含 `skuSpecs`），前端按 `specId` 去重聚合即可得到"可选的规格维度"。这样可以减少一次 API 调用（不需要额外的 `/specs` 请求）。

**选择 SKU 的逻辑**：用户点击某个规格值按钮 → 遍历所有 SKU → 找到 `skuSpecs` 中包含选定规格值且其他已选规格也匹配的 SKU → `setSelectedSkuId(match.id)` → 价格实时切换。

#### 3.3 动态路由 + useSearchParams (`src/app/page.tsx`)

```typescript
// 页面组件 — useSearchParams 必须包在 Suspense 中
export default function StoreHomePage() {
  return (
    <div>
      <StoreHeader />
      <Suspense fallback={<Spin />}>
        <ProductList />
      </Suspense>
    </div>
  );
}

// 子组件 — 使用 useSearchParams
function ProductList() {
  const searchParams = useSearchParams();
  const [keyword, setKeyword] = useState(searchParams.get('keyword') || '');
  // ...API 查询基于 keyword
}
```

**为什么必须 `<Suspense>`**：Next.js 16 在构建时尝试静态预渲染所有页面。`useSearchParams()` 在静态渲染阶段没有 search params，会崩溃。`<Suspense>` 告诉 Next.js "这部分是动态的，跳过预渲染"。另一种方案是页面加 `export const dynamic = 'force-dynamic'`，但 `<Suspense>` 更细粒度——只有搜索参数部分动态渲染。

#### 3.4 公开 API 端点 (`@Public()` 装饰器)

```typescript
// products.controller.ts
@Public()
@Get()
findAll(@Query() query: QueryProductDto) { ... }

@Public()
@Get(':id')
findOne(@Param('id', ParseIntPipe) id: number) { ... }
```

**权限模型**：

| 接口类型        | 示例                       | 是否需要 JWT                                  |
| --------------- | -------------------------- | --------------------------------------------- |
| 商品浏览 (GET)  | `/products`, `/products/1` | ❌ `@Public()`                                |
| 分类 (GET)      | `/categories/tree`         | ❌ `@Public()`                                |
| 品牌/规格 (GET) | `/brands`, `/specs`        | ❌ `@Public()`                                |
| 商品创建 (POST) | `/products`                | ✅ `@ApiBearerAuth()`                         |
| 购物车          | `/cart`                    | ✅ `@UseGuards(JwtAuthGuard)` (Controller 级) |
| 下单            | `/orders`                  | ✅ `@UseGuards(JwtAuthGuard)`                 |
| 订单查询        | `/orders`                  | ✅ 全局 JwtAuthGuard                          |

#### 3.5 订单号搜索流程 (`src/app/order-lookup/page.tsx`)

```typescript
const search = async () => {
  const data = await apiGet<{ list: any[] }>('/orders', { keyword, pageSize: 50 });
  setOrders(data.list || []);
};
```

利用后端已有的订单列表搜索功能——`keyword` 参数已支持按 `orderNo` 模糊匹配（`where.orderNo = { contains: keyword }`）。不需要单独开发按手机号/订单号查询接口。

---

### 4. 常见问题与解决方案

| 问题                                | 原因                                   | 解决方案                                                          |
| ----------------------------------- | -------------------------------------- | ----------------------------------------------------------------- |
| `useSearchParams` 导致 Build 失败   | Next.js 静态预渲染时没有 search params | 包裹在 `<Suspense>` 中                                            |
| SKU 选择器选中一个规格后其他不联动  | 选择 SKU 的匹配逻辑只匹配当前 spec     | 遍历所有 SKU，同时匹配已选规格和当前新选规格                      |
| Checkout 时购物车为空               | localStorage 数据被手动清除            | `useEffect` 检查 cart 为空时 `router.push('/cart')`               |
| `apiGet` 返回 `undefined`           | 后端统一响应格式 `data.data` 嵌套      | Storefront 的 `apiGet` 解包了两层（axios response → `data.data`） |
| 商品详情页价格显示"起"但 SKU 未选择 | 初始 `selectedSkuId = 0`               | 条件判断 `selectedSku ? price : prices[0] + ' 起'`                |

---

### 5. 面试高频问题

**Q1: 用户未登录时购物车存在哪？已登录时呢？为什么这样设计？**

> 未登录：`localStorage` — 简单快速，无服务端开销。已登录：Redis Hash（`cart:<userId>`）— 跨设备同步、持久化、高并发读写。电商通常先让用户浏览加购，结账时才要求登录，避免登录门槛导致流失。登录后通过 API 将 localStorage 购物车合并到 Redis。

**Q2: 产品列表页的搜索是如何实现的？**

> 前端：输入框 + URL search params → `useSearchParams()` 获取 keyword → 作为参数传给 `/products?keyword=xxx`。后端：`product.service.ts` 中 `where.OR = [{ name: { contains: keyword } }, { slug: { contains: keyword } }]` — Prisma 的 `contains` 实现了 LIKE 模糊搜索。如需全文搜索可加 PostgreSQL 的 `tsvector` + `@@` 运算符（Prisma `fullTextSearch`）。

**Q3: 商品规格选择（SKU 切换）的前端逻辑是怎样的？**

> (1) 从后端获取 Product（含 skus 和 skuSpecs）；(2) 遍历 skus → 按 specId 去重 → 生成 specGroups（Map）；(3) 渲染 Radio.Group 给每个 spec；点击某个 value → 找到匹配的 SKU（所有已选 spec 的 value 都匹配）→ setSelectedSkuId → 价格/库存实时切换；(4) 如果没有 SKU 匹配（如只选了一个规格，另一个未选），不自动选择。

**Q4: 为什么商品浏览接口要 `@Public()`？**

> 商城首页和商品详情页是公开页面，不应要求用户登录就能浏览。用户先逛再加购，结账时才需要身份。如果商品浏览也要求登录，会极大增加跳出率。但创建/编辑商品的管理操作仍需 `@ApiBearerAuth()` 认证。

**Q5: 如何防止恶意用户直接调用下单 API？**

> 三层：(1) JWT 认证 — 必须在登录状态下才能下单；(2) 后端 Rate Limiting — 限制单用户下单频率（阶段 8 会加 `@nestjs/throttler`）；(3) Stripe Checkout 有内置的 fraud detection。对于学习项目，JWT 认证已经足够防止未授权下单。

---

### 6. 本阶段亮点与简历描述建议

#### 本阶段亮点

- 构建面向 C 端用户的完整购物流程（浏览→选择→加购→下单→支付）
- localStorage + Redis 双层购物车存储策略
- 动态路由 + 规格 SKU 联动选择器（价格/库存实时切换）
- 公开/受保护 API 的分层设计
- `useSearchParams` + `<Suspense>` 解决 Next.js SSR 搜索参数问题

#### 简历描述模板（追加）

> - 实现独立用户端 Storefront，完成商品浏览→规格选择→加购→下单→支付完整闭环
> - 设计 localStorage + Redis 双层购物车存储，兼顾未登录用户体验与已登录跨设备同步
> - 通过 `@Public()` 装饰器实现公开/受保护 API 分层，前端支撑游客浏览 + 登录下单
> - 使用 Next.js 动态路由 + `useSearchParams` + `<Suspense>` 实现商品搜索、SKU 规格联动选择

---

### 7. 下阶段预告

**阶段 8：测试、优化与部署**

- 后端单元测试（Service 层） + e2e 测试（核心流程）
- Rate Limiting（`@nestjs/throttler` + Redis）
- 性能优化（数据库索引 + N+1 查询检查）
- 完整 Swagger 文档
- Docker Compose 生产部署
- README.md 项目介绍 + 架构图
- Vercel 前端部署 + GitHub Actions CD
