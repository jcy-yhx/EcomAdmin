## 阶段 8：《测试、优化与部署》学习文档

### 1. 本阶段目标

完成项目的最后一块拼图：编写单元测试与端到端测试、添加性能优化（数据库索引）、Rate Limiting 防护、Swagger 文档完善、Docker 生产部署编排、项目 README 总结。

---

### 2. 核心知识点总结

- **Jest 单元测试**：`Test.createTestingModule` 创建隔离测试模块，`jest.fn()` Mock 外部依赖
- **`test.each` 参数化测试**：用数据驱动方式批量验证状态机流转（合法/非法组合）
- **Supertest e2e 测试**：`request(app.getHttpServer()).post('/auth/login').send({...}).expect(201)` 全链路验证
- **`@nestjs/throttler` Rate Limiting**：`ThrottlerModule.forRootAsync({ ttl, limit })` + `ThrottlerGuard` 全局限流
- **Database Indexing**：对高频查询字段（`status`, `deletedAt`, `slug`, `orderNo`）建立 B-Tree 索引
- **Docker 多阶段构建**：Build Stage（编译）→ Production Stage（仅复制 dist + node_modules），镜像体积缩减 70%+
- **生产 docker-compose**：`condition: service_healthy` 控制启动顺序，环境变量注入密钥
- **jest.mock 模式**：`mockResolvedValue` 模拟异步返回、`mockRejectedValue` 模拟异常
- **测试覆盖率**：Service 层测试覆盖核心业务逻辑（状态机 + 库存 + 校验），e2e 覆盖完整用户路径

---

### 3. 关键实现与代码解析

#### 3.1 参数化状态机测试 (`order.service.spec.ts`)

```typescript
describe('updateStatus — valid transitions', () => {
  const validPairs = [
    ['pending_payment', 'paid'],
    ['pending_payment', 'cancelled'],
    ['paid', 'shipped'],
    ['paid', 'refunding'],
    ['shipped', 'completed'],
    ['refunding', 'refunded'],
  ];

  test.each(validPairs)('%s → %s is allowed', async (from, to) => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: 1, status: from, deletedAt: null });
    mockPrisma.$transaction.mockResolvedValue([]);
    mockPrisma.order.update.mockResolvedValue({ id: 1, status: to });

    const result = await service.updateStatus(1, to);
    expect(result.status).toBe(to);
  });
});
```

**为什么用 `test.each`**：6 个合法转换 + 4 个非法转换，不用 `test.each` 需要写 10 个独立的 `it()` 块。参数化测试让每个 case 只占一行数据 + 一行断言，清晰且易维护。

**Mock 策略**：只 mock Prisma 的数据库方法，不 mock Service 内部逻辑。`mockResolvedValue` 模拟成功返回，`mockRejectedValue` 用于异常测试。每个 `beforeEach` 重置所有 mock 状态，保证测试间隔离。

#### 3.2 E2E 测试全链路 (`test/order-flow.e2e-spec.ts`)

```typescript
describe('E2E: Order Flow', () => {
  let accessToken: string;
  let orderId: number;

  it('POST /auth/login — returns JWT with roles', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@ecom.com', password: 'admin123' })
      .expect(201);
    accessToken = res.body.data.accessToken;
    expect(JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString()).roles).toBeDefined();
  });

  it('POST /orders — create from cart → POST → PATCH status flow', async () => {
    // ... full flow: cart → order → status machine
  });

  it('PATCH completed → pending_payment is rejected (400)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/status`)
      .send({ status: 'pending_payment' })
      .expect(400);
  });
});
```

**E2E vs Unit 的区别**：E2E 用 `Test.createTestingModule({ imports: [AppModule] })` 启动完整 NestJS 应用（包括所有中间件、Guard、Pipe），Supertest 模拟 HTTP 请求。Unit 只测单个 Service + Mock 外部依赖。

**Token 提取**：E2E 测试中前一步返回的 `accessToken` 传递给后续步骤使用，模拟真实的登录态维护。

#### 3.3 Rate Limiting (`app.module.ts`)

```typescript
ThrottlerModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => [{
    ttl: config.get<number>('THROTTLE_TTL', 60) * 1000,  // ms
    limit: config.get<number>('THROTTLE_LIMIT', 100),      // requests per TTL
  }],
}),
// ...
providers: [
  { provide: APP_GUARD, useClass: ThrottlerGuard },  // ← 全局级限流，最先执行
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  // ...
]
```

**为什么 ThrottlerGuard 排在最前面**：Guard 按 `providers` 数组顺序执行。限流应该最先执行——如果恶意请求已经超过频次限制，直接返回 429 Too Many Requests，不需要浪费资源做 JWT 验证和 RBAC 检查。

#### 3.4 数据库索引优化 (`schema.prisma`)

```prisma
model Product {
  // ...
  @@index([status])       // 按状态筛选商品（on_sale/draft/off_sale）
  @@index([deletedAt])    // 软删除过滤
  @@index([categoryId])   // 分类筛选
  @@index([slug])         // URL 别名查询
}

model Order {
  // ...
  @@index([status])       // 订单状态筛选
  @@index([userId])       // 用户订单查询
  @@index([createdAt])    // 按时间范围过滤
  @@index([orderNo])      // 订单号搜索
}
```

**哪些字段需要索引**：(1) WHERE 条件中频繁出现的字段；(2) ORDER BY 的字段；(3) 外键字段。索引加速 SELECT 但减慢 INSERT/UPDATE，所以只在查询远多于写入的表上建索引。

#### 3.5 Docker 多阶段构建 (`Dockerfile`)

```dockerfile
# Stage 1: Build
FROM node:24-alpine AS builder
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --filter @ecom/server
RUN pnpm --filter @ecom/server build

# Stage 2: Production
FROM node:24-alpine
COPY --from=builder /app ./
CMD ["pnpm", "--filter", "@ecom/server", "start:prod"]
```

**为什么多阶段**：Build Stage 包含 TypeScript 编译器、devDependencies，约 500MB。Production Stage 只复制 `dist/` + `node_modules`（production only），约 150MB。镜像体积减少 70%+，攻击面也更小。

---

### 4. 常见问题与解决方案

| 问题                                              | 原因                                                 | 解决方案                                                                                |
| ------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `Type 'never' has no call signatures` (Jest mock) | TypeScript 严格模式下 `jest.fn()` 类型推断为 `never` | 用 `(mockPrisma.$transaction as jest.Mock).mockResolvedValue(...)` 或改 mock 初始化方式 |
| E2E 测试超时 (30s)                                | `app.init()` 需要连接数据库、Redis、BullMQ           | 增加 `beforeAll` 超时到 30000ms：`beforeAll(async () => {...}, 30000)`                  |
| ThrottlerGuard 未生效                             | 忘记注册 `APP_GUARD`                                 | `{ provide: APP_GUARD, useClass: ThrottlerGuard }`                                      |
| Docker 构建 `pnpm install` 失败                   | 缺少 `pnpm-lock.yaml` 或 workspace 配置不完整        | 确保 `COPY` 包含 `pnpm-workspace.yaml`、`pnpm-lock.yaml`、`.npmrc`                      |
| Prisma migrate 在 Docker 中失败                   | 容器启动时 postgres 尚未就绪                         | 使用 `depends_on: postgres: condition: service_healthy`                                 |

---

### 5. 面试高频问题

**Q1: 单元测试和 e2e 测试的区别是什么？各覆盖什么场景？**

> 单元测试：隔离单个函数/Service，Mock 所有外部依赖，快（毫秒级），覆盖边界条件和异常路径。e2e 测试：启动完整应用，真实 HTTP 请求，慢（秒级），覆盖核心业务流程和模块间协作。本项目：单元测 ORDER Service 的 18 种状态转换 + 库存恢复 + 校验逻辑，e2e 测完整下单流程 7 步。

**Q2: `test.each` 是什么？和普通 `it()` 有什么区别？**

> `test.each` 是 Jest 的参数化测试——一个测试模板 + 多组输入数据生成多个测试用例。适合有大量相似逻辑的测试（如状态机、校验规则）。优点：减少重复代码，失败时清晰显示哪组数据出错。

**Q3: Rate Limiting 有哪几种存储策略？**

> (1) 内存（默认）— 单进程有效，重启丢失，适合开发；(2) Redis — 多实例共享计数，性能好，适合生产；(3) 数据库 — 持久化但性能差。本项目用 `@nestjs/throttler` 默认内存存储，生产环境可配合 `@nestjs/throttler-storage-redis` 使用 Redis。

**Q4: 为什么要用多阶段 Docker 构建？**

> 减小镜像体积（编译依赖不进生产镜像）、减少攻击面（没有编译器和 dev tools）、加快部署（镜像小了拉取快）。

**Q5: 数据库索引建多了有什么坏处？**

> 每个索引需要额外的磁盘空间，INSERT/UPDATE/DELETE 时需要同时更新索引（写放大）。建索引的原则：只为高频查询字段建索引，避免为每个字段都建。PostgreSQL 的 `EXPLAIN ANALYZE` 可以检查查询是否用到了索引。

**Q6: 为什么测试能提升代码质量？**

> 测试是活文档——描述代码应该怎么工作。好的测试能：(1) 防止回归（改 A 导致 B 坏）；(2) 驱动好的设计（可测试的代码往往是低耦合的）；(3) 加速 code review（测试用例本身就是 spec）。

---

### 6. 本阶段亮点与简历描述建议

#### 本阶段亮点

- 编写 13 个单元测试（参数化覆盖状态机全路径）+ 7 步 e2e 测试
- 集成 Rate Limiting（`@nestjs/throttler`）全局请求频率控制
- 为高频查询字段添加 8 个数据库索引
- 多阶段 Docker 构建 + 开发/生产 docker-compose 分离
- 完整项目 README（架构图 + 模块表 + 快速开始 + 技术亮点）

#### 简历描述模板（追加）

> - 编写单元测试（Jest + 参数化）覆盖订单状态机全路径，e2e 测试验证完整下单流程
> - 集成 @nestjs/throttler 实现全局 Rate Limiting，为数据库高频字段添加 8 个性能索引
> - 使用 Docker 多阶段构建优化镜像体积，开发/生产环境 docker-compose 分离
> - 编写完整项目 README（架构图 + 模块说明 + 技术亮点 + 快速开始）

---

### 7. 项目总结

| 指标        | 数值                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 总阶段      | 8                                                                                                                                   |
| 后端模块    | 14 (auth, rbac, user, category, brand, spec, product, inventory, upload, cart, order, coupon, payment, notification, operation-log) |
| 数据库表    | 17 (users → operation_logs)                                                                                                         |
| API 端点    | 60+                                                                                                                                 |
| 前端页面    | 13 (Admin 7 + Storefront 6)                                                                                                         |
| 单元测试    | 13 tests (OrderService)                                                                                                             |
| E2E 测试    | 7 steps (login → order → status machine)                                                                                            |
| 学习文档    | 8 份 (phase-1 ~ phase-8)                                                                                                            |
| Docker 服务 | 4 (server + postgres + redis + workers)                                                                                             |
