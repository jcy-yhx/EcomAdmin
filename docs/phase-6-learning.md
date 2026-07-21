## 阶段 6：《管理后台前端（Admin Panel）》学习文档

### 1. 本阶段目标

使用 Next.js 16 (App Router) + Ant Design + TanStack Query + Axios 构建管理后台前端，实现登录/权限路由守卫/CRUD 页面，与后端 API 全链路打通。

---

### 2. 核心知识点总结

- **Next.js 16 App Router 架构**：`src/app/` 文件约定路由，`layout.tsx` 嵌套布局，`(main)` 路由分组
- **Ant Design v6 + `@ant-design/nextjs-registry`**：解决 Ant Design CSS-in-JS 在 SSR 中的样式闪烁问题
- **TanStack Query v5**：`useQuery` 数据获取 + `useMutation` 数据修改 + `queryClient.invalidateQueries` 自动刷新
- **Axios 拦截器链**：请求拦截器附加 JWT Token → 响应拦截器处理 401 自动刷新
- **JWT Token 解码**：`atob(token.split('.')[1])` 从 Token payload 提取用户角色/权限
- **权限路由守卫**：`(main)/layout.tsx` 的 `useEffect` 检查用户未登录则 `router.replace('/login')`
- **侧边栏权限过滤**：`menuItems.filter(item => hasPermission(item.permission))` 动态显示菜单
- **React Context + Provider**：`AuthProvider` 包裹全局提供用户状态、登录/登出方法
- **State 提升 + Form 复用**：同一 Modal 组件用于新建和编辑，通过 `editing` 状态切换
- **Next.js 16 SSR 预渲染陷阱**：Client Component 使用 Hook 需 `export const dynamic = 'force-dynamic'` 跳过 SSR
- **pnpm monorepo 前端构建**：`pnpm --filter @ecom/admin dev/build` 在 workspace 中运行 Next.js

---

### 3. 关键实现与代码解析

#### 3.1 Axios 拦截器 + Token 自动刷新 (`src/lib/api.ts`)

```typescript
// 请求拦截：自动附加 Access Token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 响应拦截：401 自动刷新 Token
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401 && !originalRequest._retry) {
      // 用 refreshToken 换新 token pair
      const { data } = await axios.post('/auth/refresh', { refreshToken });
      localStorage.setItem('accessToken', data.data.accessToken);
      localStorage.setItem('refreshToken', data.data.refreshToken);
      // 重试原始请求
      originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
      return api(originalRequest);
    }
  },
);
```

**并发刷新保护**：`isRefreshing` 标志 + `refreshSubscribers` 队列。当多个请求同时收到 401，只有第一个触发刷新，其他请求排队等待新 Token，避免多次刷新。

**类型安全的 API 封装**：

```typescript
export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await api.get(url, { params });
  return data.data; // 自动解包统一响应格式 { code, data, message }
}
```

#### 3.2 AuthProvider + JWT 用户状态 (`src/lib/auth.tsx`)

```typescript
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  // 从 localStorage 恢复登录状态
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUser({
        userId: payload.sub,
        email: payload.email,
        roles: payload.roles || [],
        permissions: payload.permissions || [],
      });
    }
  }, []);

  const hasPermission = useCallback(
    (perm: string) => user?.permissions?.includes(perm) || user?.roles?.includes('super_admin') || false,
    [user],
  );
}
```

**为什么从 JWT payload 提取角色/权限而不是调 API**：减少接口调用。JWT 的 payload 已经编码了 `roles` 和 `permissions`（在 JwtStrategy.validate 中注入），前端解码即可获得。Token 过期后 401 拦截器会自动刷新，roles 也会更新。

**为什么 `super_admin` 自动拥有所有权限**：简化权限逻辑。超级管理员不需要逐个分配 12 个权限码，一行判断即可。

#### 3.3 路由守卫 + 重定向 (`src/app/(main)/layout.tsx`)

```typescript
export default function MainLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user) return <div>加载中...</div>;

  return (
    <Layout>
      <Sidebar />
      <Content>{children}</Content>
    </Layout>
  );
}
```

**三层保护**：

1. **布局层**：`(main)/layout.tsx` 检查登录状态 → 未登录重定向到 `/login`
2. **菜单层**：`Sidebar` 根据 `hasPermission()` 过滤可见菜单项
3. **API 层**：后端 Guard 拦截无 Token 请求 → 返回 401

**为什么是 `router.replace` 而不是 `router.push`**：replace 不会在浏览器历史栈中留下记录，用户按返回键不会回到受保护页面。

#### 3.4 动态侧边栏权限过滤 (`src/components/Sidebar.tsx`)

```typescript
const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/products', icon: <ShoppingOutlined />, label: '商品管理', permission: 'product:read' },
  { key: '/orders', icon: <OrderedListOutlined />, label: '订单管理', permission: 'order:read' },
  // ...
];

const visibleItems = menuItems
  .filter((item) => !item.permission || hasPermission(item.permission))
  .map(({ permission, ...rest }) => rest); // 去除 permission 字段再传给 Menu
```

**设计**：`permission` 是前端展示用的元数据，`filter + map` 去掉后再传给 Ant Design `Menu` 组件。`super_admin` 的 `hasPermission` 永远返回 true，所以看到所有菜单。

#### 3.5 表单复用模式（新建/编辑同一 Modal）

```typescript
// 新建 → editing=null，重置表单
const openCreate = () => {
  setEditing(null);
  form.resetFields();
  form.setFieldsValue({ status: 'draft' });
  setModalOpen(true);
};

// 编辑 → editing=record，回填数据
const openEdit = (record: any) => {
  setEditing(record);
  form.setFieldsValue(record);
  setModalOpen(true);
};

// Mutation 根据 editing 判断调用 POST 还是 PATCH
const saveMutation = useMutation({
  mutationFn: (values: any) => (editing ? apiPatch(`/products/${editing.id}`, values) : apiPost('/products', values)),
  onSuccess: () => {
    queryClient.invalidateQueries(['products']);
    setModalOpen(false);
  },
});
```

**为什么不用两个 Modal**：减少代码重复。新建和编辑的字段 90% 相同，差异仅在 API 调用（POST vs PATCH）和表单初始值。一个组件 + `editing` 状态即可覆盖两种场景。

---

### 4. 常见问题与解决方案

| 问题                                                        | 原因                                                           | 解决方案                                            |
| ----------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| `useAuth must be used within AuthProvider` (SSR 预渲染报错) | Next.js 尝试在服务端预渲染 Client Component，但 Context 不存在 | 登录页加 `export const dynamic = 'force-dynamic'`   |
| Ant Design 图标/样式不显示                                  | Ant Design v5+ 使用 CSS-in-JS，SSR 时样式未注入                | 使用 `@ant-design/nextjs-registry` 包裹根布局       |
| 登录后页面空白，无重定向                                    | `router.push('/')` 没有触发布局重渲染                          | 在 `AuthProvider.login` 中 `setUser(...)` 更新状态  |
| Axios 401 自动刷新失败（循环）                              | `/auth/refresh` 接口也返回 401                                 | 在拦截器中检查 `!originalRequest._retry` 防止死循环 |
| 侧边栏菜单不变                                              | `useAuth` 的 `user` 状态未更新                                 | 在 `login()` 中重新解析 JWT payload 并 `setUser`    |

---

### 5. 面试高频问题

**Q1: Next.js App Router 和 Pages Router 有什么区别？为什么选 App Router？**

> App Router 基于 React Server Components（RSC），默认服务端渲染，`'use client'` 标记客户端组件。优势：(1) 嵌套 Layout 复用；(2) Streaming SSR；(3) Server Actions。Pages Router 所有组件默认客户端渲染，`getServerSideProps` 手动 SSR。App Router 更贴近现代 React 体系——本项目的 `(main)` 路由分组和嵌套 layout 是 App Router 的核心特性。

**Q2: `'use client'` 和 Server Component 的边界如何划分？**

> 交互组件（`useState`, `useEffect`, event handler）→ `'use client'`。数据获取和静态渲染 → Server Component。本项目所有组件都标记了 `'use client'` 因为依赖 Ant Design 和 React Context，这是管理后台的典型模式。实际项目中可以 Server Component 获取数据 → props 传给 Client Component。

**Q3: TanStack Query 的 `useQuery` 和简单的 `useEffect + fetch` 有什么区别？**

> TanStack Query 提供：(1) 自动缓存和去重（相同 key 不重复请求）；(2) 后台刷新（stale-while-revalidate）；(3) 乐观更新；(4) 分页/无限滚动支持；(5) DevTools。`useEffect + fetch` 每次组件挂载都请求，没有缓存，需手写 loading/error 状态管理。

**Q4: Axios 拦截器中的 Token 刷新如何防止并发死循环？**

> 三个机制：(1) `isRefreshing` 标志确保同一时刻只有一个刷新请求；(2) 其他 401 请求排队（`refreshSubscribers`），等新 Token 到位后重试；(3) `_retry` 标记防止刷新失败后无限循环。如果刷新也失败，清空存储并跳转登录页。

**Q5: 前端权限控制（菜单隐藏）能替代后端权限校验吗？**

> 绝对不能。前端权限只是 UI 层面的便利性优化——隐藏用户无权操作的按钮和菜单。真正的安全防护在后端 Guard。攻击者可以直接 curl 或 Postman 调用 API 绕过前端。安全原则：永远不信前端传来的任何数据。

**Q6: 为什么能直接从 JWT payload 解码用户权限而不调接口验证？**

> JWT 签名确保 payload 不被篡改——浏览器没有签名密钥，无法伪造 payload。`localStorage` 中的 token 是登录时服务端签发的，只要 Access Token 未过期，payload 就是可信的。但注意：如果后端权限变更（管理员被降权），JWT payload 不会自动更新，需要 Token 过期后刷新或主动调用 `POST /auth/refresh`。

---

### 6. 本阶段亮点与简历描述建议

#### 本阶段亮点

- Next.js 16 App Router 架构 + Ant Design 管理后台
- Axios 拦截器链实现 JWT 自动附加 + Token 自动刷新
- React Context 管理全局用户状态（登录/登出/权限判断）
- 路由守卫（未登录重定向）+ 动态权限菜单
- TanStack Query 封装数据获取与变更（CUD 自动刷新列表）
- 状态复用组件（新建/编辑同一 Modal）

#### 简历描述模板（追加）

> - 使用 Next.js 16 (App Router) + Ant Design 构建管理后台前端，支持 7 个业务页面
> - 基于 React Context 实现全局认证状态管理，支持 JWT 自动刷新与路由守卫
> - 通过 TanStack Query 封装数据请求与缓存，实现 CUD 操作后自动刷新列表
> - 设计声明式权限控制：Axios 拦截器 + 动态菜单过滤 + 后端 RBAC 三层校验

---

### 7. 下阶段预告

**阶段 7：用户端 Storefront（极简版）**

- 商品浏览 + 搜索 + 分类筛选
- 购物车（本地未登录 + Redis 已登录）
- 下单 + Stripe 支付
- 订单查询（按手机号/订单号）
