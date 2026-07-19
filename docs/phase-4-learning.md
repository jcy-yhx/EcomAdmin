## 阶段 4：《订单与购物车管理》学习文档

### 1. 本阶段目标

实现电商核心交易链路：Redis 购物车 → 下单（事务：创建订单 + 扣库存 + 清购物车）→ 订单状态机流转（状态校验）→ 超时自动取消（BullMQ 延迟队列）。

---

### 2. 核心知识点总结

- **订单状态机设计**：`STATE_MACHINE` 字典定义合法状态转移，拒绝非法流转（如已完成 → 待支付）
- **下单事务保证**：`prisma.$transaction()` 内完成创建订单 + 扣减库存 + 清 Redis 购物车，保证原子性
- **购物车 Redis 存储**：`Hash` 结构 `cart:<userId>` → `{ skuId: JSON(item) }`，单用户读写 O(1)，无需 DB 查询
- **BullMQ 延迟队列**：`queue.add('cancel-order', { orderId }, { delay: 30min })` 实现超时自动取消
- **Prisma 嵌套写入**：`order.create({ data: { items: { createMany: {...} }, address: { create: {...} } } })` 一次创建主表+明细+地址
- **订单号生成**：`EC + 毫秒时间戳 + 4位随机字符`，保证唯一性
- **@ValidateNested + @Type**：嵌套 DTO 必须加这两个装饰器，否则 `forbidNonWhitelisted` 会拒绝嵌套字段
- **@nestjs/bullmq 集成**：`BullModule.forRootAsync` + `registerQueue` + `@InjectQueue` + `@Processor` + `WorkerHost`

---

### 3. 关键实现与代码解析

#### 3.1 订单状态机 (`src/modules/order/order.service.ts`)

```typescript
const STATE_MACHINE: Record<string, string[]> = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['shipped', 'refunding'],
  shipped: ['completed'],
  refunding: ['refunded'],
  completed: [],
  cancelled: [],
  refunded: [],
};

async updateStatus(id: number, newStatus: string) {
  const allowed = STATE_MACHINE[order.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw new BadRequestException(`不允许从 ${order.status} 转为 ${newStatus}`);
  }
  // ... proceed with transition
}
```

**为什么不用 if/else 或 switch**：状态机表驱动（字典 + 数组）比 N 个 if 判断更易维护。新增状态只需加一行配置，无需修改逻辑代码。这也是面试常考点——状态模式的工程实现。

**为什么退货/取消要恢复库存**：`cancelled` 和 `refunded` 都要把已扣减的库存加回去（`stock: { increment: quantity }`）。这是电商资金/库存一致性的基础。

#### 3.2 下单事务 (`src/modules/order/order.service.ts`)

```typescript
const order = await this.prisma.$transaction(async (tx) => {
  // 1. 创建订单（主表 + 明细 + 地址一次性嵌套写入）
  const created = await tx.order.create({
    data: {
      orderNo,
      userId,
      status: 'pending_payment',
      totalAmount,
      items: { createMany: { data: orderItems } },
      address: { create: { ...dto.address } },
    },
    include: { items: true, address: true },
  });

  // 2. 逐 SKU 扣减库存
  for (const item of orderItems) {
    await tx.sku.update({ where: { id: item.skuId }, data: { stock: { decrement: item.quantity } } });
  }

  // 3. 清空购物车
  await this.cartService.clearCart(userId);
  return created;
});
```

**为什么用 Prisma 的 `$transaction` 而不是数据库行锁**：`$transaction` 保证了三个操作（创建订单、扣库存、清购物车）要么全部成功要么全部回滚。如果不用事务，扣库存成功后创建订单失败，库存就凭空减少了。

**`createMany` vs 循环 `create`**：`createMany` 一次 SQL 插入多条记录，性能远优于循环 create。但注意 Prisma 的 `createMany` 不支持 `include`，所以这里只用它插入数据，不返回关联对象。

**为什么不在事务中先扣库存**：创建订单失败时库存不会少（事务回滚），但如果订单创建成功而后续扣库存失败，也是回滚。事务本质就是 "全或无"。

#### 3.3 Redis 购物车 (`src/modules/cart/cart.service.ts`)

```typescript
// Key: cart:<userId>, Hash field: skuId, Hash value: JSON(CartItem)
private cartKey(userId: number) { return `cart:${userId}`; }

async addItem(userId: number, skuId: number, quantity: number) {
  const sku = await this.prisma.sku.findUnique({ ... });
  const item = { skuId, quantity, price, productName, skuCode, image };
  await this.redis.hset(this.cartKey(userId), String(skuId), JSON.stringify(item));
}

async getCart(userId: number) {
  const raw = await this.redis.hgetall(this.cartKey(userId));
  const items = Object.values(raw).map(v => JSON.parse(v));
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return { items, total };
}
```

**为什么选 Redis Hash 而不是 String**：

- Hash 天然适合购物车：每用户一个 Hash，场内 SKU 作为 field，方便单独增删改查
- 如果用 String `set("cart:1:2", JSON)`，无法一次获取用户全部商品
- 如果用 DB 表，每次加购物车都是一次写操作，高并发压力大

**为什么存储冗余字段（productName, price）**：避免每次读购物车都 JOIN 查 DB。下单时仍会再次查 DB 验证实时价格和库存，购物车中的价格只是展示用。

#### 3.4 BullMQ 订单超时取消 (`src/modules/order/order-queue.processor.ts`)

```typescript
@Processor('order-timeout')
export class OrderTimeoutProcessor extends WorkerHost {
  async process(job: Job<{ orderId: number }>) {
    const order = await this.prisma.order.findUnique({ where: { id: job.data.orderId } });
    if (order?.status === 'pending_payment') {
      // 恢复库存
      const items = await this.prisma.orderItem.findMany({ where: { orderId: order.id } });
      for (const item of items) {
        await this.prisma.sku.update({ where: { id: item.skuId }, data: { stock: { increment: item.quantity } } });
      }
      await this.prisma.order.update({ where: { id: order.id }, data: { status: 'cancelled' } });
    }
  }
}

// 在 OrderService.create 中调度
await this.timeoutQueue.add(
  'cancel-order',
  { orderId: order.id },
  {
    delay: 30 * 60 * 1000, // 30 分钟后执行
    removeOnComplete: true, // 执行完自动清理
  },
);
```

**三个要点**：

1. **延迟执行**：`{ delay: 30 * 60 * 1000 }` 让 job 在 30 分钟后才被消费
2. **幂等检查**：执行时检查 `order.status === 'pending_payment'`，因为用户可能在 30 分钟内已完成支付
3. **WorkerHost 模式**：`@nestjs/bullmq` 的推荐写法，`process()` 返回 Promise 即表示 job 完成

**BullMQ 核心架构**：

```
Redis (Job Store) ←→ Queue (生产者 add job) → Worker (消费者 process job)
```

BullMQ 的 job 数据和状态全部存在 Redis 中，Worker 通过 Redis 的 BRPOPLPUSH 等命令实现可靠的 FIFO 消费和失败重试。

#### 3.5 `@ValidateNested` 的必要性

```typescript
class CreateOrderDto {
  @ValidateNested() // 告诉 class-validator 递归校验嵌套对象
  @Type(() => CreateOrderAddressDto) // 告诉 class-transformer 如何构造嵌套对象
  address: CreateOrderAddressDto;
}
```

**踩坑**：`forbidNonWhitelisted: true` 全局启用后，任何不在 DTO 类中显式声明的字段都会被拒绝。嵌套对象 `address` 如果不加 `@ValidateNested` 和 `@Type`，ValidationPipe 会报 `property address should not exist`。

`@Type(() => CreateOrderAddressDto)` 是必需的——因为 TypeScript 编译后类型信息丢失，class-transformer 需要运行时指定目标类才能正确实例化嵌套对象。

---

### 4. 常见问题与解决方案

| 问题                                | 原因                                                              | 解决方案                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `property address should not exist` | `forbidNonWhitelisted` 拒绝嵌套对象，因为未添加 `@ValidateNested` | 嵌套属性加 `@ValidateNested()` + `@Type(() => NestedClass)`                                           |
| 订单创建后库存没变化                | 事务中 `sku.update` 失败但未被捕获                                | 所有操作放在 `prisma.$transaction(async (tx) => {...})` 中                                            |
| BullMQ worker 不消费 job            | `@Processor` 未被应用扫描到                                       | 确保模块的 `providers` 中包含 Processor 类，或被 `imports` 中 `BullModule.registerQueue` 所在模块引用 |
| 购物车数据丢失                      | Redis 默认不持久化                                                | 确保 `docker-compose.yml` 中 Redis 配置了 `volumes: - redisdata:/data`                                |

---

### 5. 面试高频问题

**Q1: 如何保证下单时的库存扣减不会超卖？**

> 三层保证：(1) 事务开始前在代码层检查 `sku.stock >= quantity`；(2) Prisma 的 `$transaction` 保证检查和扣减的原子性；(3) 如果后续需要更高并发，可以用 Redis 分布式锁（阶段 3 已实现）或乐观锁。本项目三层：下单前预检查 → 事务内 `decrement` → Redis 预扣库存。

**Q2: 订单状态机有哪些常见状态？为什么要用状态机？**

> 常见状态：待支付 → 已支付 → 已发货 → 已完成，以及取消和退款的异常分支。状态机保证：(1) 状态流转的合法性（已完成不能再取消）；(2) 每个状态转换可能触发副作用（取消 → 恢复库存）；(3) 可审计的历史轨迹。没有状态机的代码会变成散落的 if/else，难以维护。

**Q3: 购物车为什么用 Redis 而不用数据库表？**

> 购物车是高频读写操作（用户每次浏览都可能加购），Redis 比 Postgres 快 2-3 个数量级（内存 vs 磁盘）。Hash 结构天然适合"用户-商品"这种 KV-KV 嵌套数据。缺点：Redis 重启可能丢数据（可配置 AOF/RDB 持久化），但购物车数据丢失不是致命问题。

**Q4: BullMQ 和直接 setTimeout/Redis PubSub 有什么区别？**

> `setTimeout` 重启进程丢失，无法持久化。Redis PubSub 没有 ACK 机制，消息可能丢失。BullMQ 提供：(1) 持久化存储 job 到 Redis；(2) retry 机制（失败自动重试）；(3) 延迟执行；(4) 优先级队列；(5) 进度报告。是适合生产环境的任务队列方案。

**Q5: `$transaction` 的交互式（函数式）和批量式有什么区别？**

> 交互式：`prisma.$transaction(async (tx) => { ... })` — 回调内所有 tx 操作共享一个数据库连接，适合需要先查后写的场景。批量式：`prisma.$transaction([op1, op2, op3])` — 传入预构建的 Prisma 操作数组，适合无需依赖前一步结果的场景。本项目用交互式，因为需要"查库存 → 判断 → 创建订单 → 扣库存"。

**Q6: 订单号生成有什么最佳实践？**

> 避免纯自增（暴露业务量），避免纯时间戳（并发可能重复）。常用方案：(1) 雪花算法（Snowflake ID）；(2) `业务前缀 + 时间戳 + 随机码`（本项目）；(3) 数据库序列 + 前缀。关键是保证唯一性（unique 约束兜底）+ 有业务可读性。

---

### 6. 本阶段亮点与简历描述建议

#### 本阶段亮点

- 实现订单状态机（表驱动）控制 7 个状态 + 6 种合法流转 + 非法流转拒绝
- 下单使用 Prisma 事务保证（创建订单 + 扣库存 + 清购物车）原子性
- Redis Hash 存储购物车，单用户 O(1) 读写
- BullMQ 延迟队列实现 30 分钟未支付自动取消+恢复库存
- 订单创建时自动调度超时 job，取消时幂等校验（避免误取消已支付订单）

#### 简历描述模板（追加）

> - 设计订单状态机（7 状态 + 表驱动流转），通过事务保证下单链路（创建订单 + 扣库存 + 清购物车）的数据一致性
> - 使用 Redis Hash 结构实现购物车功能，支持高并发读写
> - 集成 BullMQ 延迟队列实现订单超时自动取消与库存恢复，Worker 幂等校验防止重复取消

---

### 7. 下阶段预告

**阶段 5：支付、营销与通知**

- Stripe Checkout 支付集成 + Webhook 异步回调处理
- 优惠券系统（满减/折扣券 + 发放 + 核销）
- BullMQ 队列：邮件发送、站内信
- WebSocket 实时推送订单状态
- 操作日志中间件
- **前端穿插**：优惠券管理页 + 通知中心页 + 操作日志页
