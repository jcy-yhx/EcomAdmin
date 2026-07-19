## 阶段 5：《支付、营销与通知》学习文档

### 1. 本阶段目标

实现电商后台三大横向能力：Stripe 支付集成（Checkout + Webhook）、优惠券营销系统（CRUD + 发放 + 下单核销）、通知中心（站内信 + WebSocket 实时推送 + BullMQ 邮件队列）、操作日志拦截器（管理员写操作自动记录）。

---

### 2. 核心知识点总结

- **Stripe Checkout 托管支付**：`checkout.sessions.create()` 生成托管支付页 URL，用户跳转 Stripe 完成支付
- **Stripe Webhook 异步回调**：`POST /payments/webhook` 接收 `checkout.session.completed` 事件 → 更新订单状态为 `paid`
- **Webhook 签名验证**：`stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)` 防止伪造回调
- **NestJS raw body 配置**：`NestFactory.create({ rawBody: true })` 保留原始请求体用于签名验证
- **优惠券模型设计**：固定金额（fixed）vs 百分比（percentage），最低消费门槛 `minAmount`
- **优惠券发放链路**：批量 `createMany` → 增加 `usedCount` 计数
- **优惠券核销逻辑**：校验有效期、最低消费、是否已使用 → 计算折扣 → 标记已用
- **WebSocket 网关**：`@WebSocketGateway()` → `server.emit('notification:<userId>', data)` 实时推送
- **BullMQ 邮件队列**：`emailQueue.add('send-email', { to, subject, body })` → `EmailProcessor` Worker 消费
- **操作日志拦截器**：`APP_INTERCEPTOR` 全局注册 → 拦截 POST/PATCH/DELETE → 异步写库（fire-and-forget）

---

### 3. 关键实现与代码解析

#### 3.1 Stripe Checkout + Webhook (`src/modules/payment/payment.service.ts`)

```typescript
// 创建支付会话
async createCheckout(orderId: number) {
  const session = await this.stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    metadata: { orderId: String(orderId) },
    line_items: order.items.map((item) => ({
      price_data: {
        currency: 'cny',
        product_data: { name: `${item.productName} (${item.skuCode})` },
        unit_amount: Math.round(Number(item.price) * 100), // 分
      },
      quantity: item.quantity,
    })),
    success_url: `${APP_URL}/payment/success?orderId=${orderId}`,
    cancel_url: `${APP_URL}/payment/cancel?orderId=${orderId}`,
  });
  return { checkoutUrl: session.url };
}

// Webhook 处理
async handleWebhook(rawBody: Buffer, signature: string) {
  const event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  if (event.type === 'checkout.session.completed') {
    const orderId = Number(event.data.object.metadata?.orderId);
    await this.prisma.order.update({ where: { id: orderId }, data: { status: 'paid' } });
  }
}
```

**Why Stripe Checkout（托管支付）而非 Stripe Elements（自定义 UI）**：

- Checkout：Stripe 托管支付页 → 一行代码生成 URL → 安全合规（PCI DSS 免除） → 适合学习和小项目
- Elements：自定义 UI 组件嵌入自己页面 → 需要 PCI SAQ A-EP 合规 → 适合品牌定制强的产品

**Webhook 为什么需要 `rawBody`**：Stripe 的签名验证要求使用**未经解析的原始请求体**。Express 的 JSON 中间件会 parse body，导致验签失败。`rawBody: true` 让 NestJS 在 parsing 前保留原始 buffer。

**Stripe 金额单位陷阱**：`unit_amount` 必须是**最小货币单位**（分/美分），不是元和美元。`¥69.99` → 传 `6999`。

#### 3.2 优惠券核销 (`src/modules/coupon/coupon.service.ts`)

```typescript
async validateAndApply(userCouponId: number, orderAmount: number, userId: number) {
  const uc = await this.prisma.userCoupon.findUnique({
    where: { id: userCouponId }, include: { coupon: true },
  });

  // 4 层校验
  if (!uc || uc.userId !== userId) throw new BadRequestException('优惠券不存在');
  if (uc.isUsed) throw new BadRequestException('优惠券已使用');
  if (!uc.coupon.isActive || uc.coupon.deletedAt) throw new BadRequestException('优惠券已失效');
  if (new Date() < uc.coupon.startAt || new Date() > uc.coupon.endAt)
    throw new BadRequestException('优惠券不在有效期内');

  // 计算折扣
  let discount = uc.coupon.type === 'fixed'
    ? Number(uc.coupon.value)
    : Math.round(Number(orderAmount) * Number(uc.coupon.value) / 100 * 100) / 100;

  return { discount, userCouponId: uc.id };
}
```

**关键设计**：优惠券有 **Coupon（模板）** 和 **UserCoupon（实例）** 两层。模板定义规则（金额、类型、有效期），实例绑定用户。发放时扣模板的 `totalCount` 并创建 UserCoupon，核销时标记 `isUsed = true`。这避免了"同一个优惠券码多人并发使用"的问题。

#### 3.3 通知三通道 (`src/modules/notification/notification.service.ts`)

```typescript
async notify(userId: number, title: string, content: string, type = 'system') {
  // 1. 站内信 — 持久化到 DB
  const notif = await this.prisma.notification.create({ data: { userId, title, content, type } });

  // 2. WebSocket — 实时推送给在线用户
  this.gateway.sendNotification(userId, { title, content, type });

  // 3. 邮件 — 异步队列
  await this.emailQueue.add('send-email', { to: user.email, subject: title, body: content });
  return notif;
}
```

**三种通道的分工**：

| 通道        | 时机       | 用途                            |
| ----------- | ---------- | ------------------------------- |
| 站内信 (DB) | 所有通知   | 用户可回溯历史通知              |
| WebSocket   | 用户在线时 | 即时弹窗/角标提醒               |
| Email 队列  | 异步       | 离线用户也能收到（需配置 SMTP） |

**为什么邮件用队列而不是直接发**：发送邮件需要连接 SMTP 服务器，耗时 100-500ms。用 BullMQ 队列异步处理，API 响应不阻塞，失败自动重试。

#### 3.4 操作日志拦截器 (`src/modules/operation-log/operation-log.interceptor.ts`)

```typescript
@Injectable()
export class OperationLogInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const { method, url, user } = request;
    if (!LOGGABLE_METHODS.has(method) || !user) return next.handle();

    return next.handle().pipe(
      tap(() => {
        this.prisma.operationLog
          .create({
            data: { userId: user.userId, username: user.email, module, action, detail, ip, userAgent },
          })
          .catch(() => {}); // fire-and-forget
      }),
    );
  }
}
```

**三个设计决策**：

1. **拦截 POST/PATCH/PUT/DELETE**（不记录 GET）— 只记录写操作
2. **`tap()` 后置处理** — 等响应成功后再写日志，避免记录失败的请求
3. **`.catch(() => {})` 静默失败** — 日志写入失败不影响用户请求，防止日志表写入成为故障雪崩点

**为什么用 `APP_INTERCEPTOR` 而不是中间件**：Interceptor 可以访问 Guard 注入的 `req.user` 对象。中间件在 Guard 之前执行，此时 `req.user` 还未被填充。

#### 3.5 `APP_INTERCEPTOR` 的全局注册方式

```typescript
// operation-log.module.ts
@Module({
  providers: [{ provide: APP_INTERCEPTOR, useClass: OperationLogInterceptor }],
})
export class OperationLogModule {}
```

`APP_INTERCEPTOR` 是 NestJS 的特殊 token——在任意模块的 providers 中注册，会被提升到全局作用域。不需要在 `main.ts` 中手动 `app.useGlobalInterceptors()`。

---

### 4. 常见问题与解决方案

| 问题                                                   | 原因                                                               | 解决方案                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Stripe Webhook 返回 400 "No signatures found matching" | `rawBody` 未开启，body 被 Express JSON 中间件 parse 后原始数据丢失 | `NestFactory.create({ rawBody: true })` + 使用 `req.rawBody` |
| Stripe `unit_amount` 金额对不上                        | Stripe 用最小货币单位（分），100 元要传 10000                      | 价格 `* 100` 然后 `Math.round()`                             |
| WebSocket 无连接                                       | 忘记在 `@WebSocketGateway` 中配置 cors                             | `@WebSocketGateway({ cors: { origin: '*' } })`               |
| `operationLog.create` 阻塞响应                         | Prisma 写入可能较慢                                                | 使用 `.catch(() => {})` fire-and-forget 模式                 |

---

### 5. 面试高频问题

**Q1: Stripe Checkout 和 Stripe Elements 有什么区别？什么场景用哪个？**

> Checkout 是 Stripe 托管支付页，一行 URL 搞定，Stripe 负责 UI/安全/合规。适合中小项目、快速上线。Elements 是自定义组件库，嵌入自己的页面，需要 PCI DSS SAQ A-EP 级别的安全合规。适合品牌强定制的大项目。本项目用 Checkout 因为学习目标和开发效率。

**Q2: 为什么支付要用 Webhook 而不是前端直接轮询支付状态？**

> Webhook 是 Stripe 主动推送支付结果，实时且可靠。前端轮询不可靠——用户可能关掉页面，且频繁轮询浪费资源。更重要的是安全：前端回调可能被伪造，Webhook 通过 `constructEvent` 验签保证数据来源可信。

**Q3: 优惠券的"固定金额"和"百分比"两种类型有什么设计差异？**

> 固定金额（`¥20`）无论订单金额多少都是减 20 元。百分比（`10%`）随订单金额变化。固定金额通常有最低消费门槛（满 100 减 20），排除羊毛党。百分比的可能设置上限（打 9 折最多减 50）。实现上：fixed → `discount = value`，percentage → `discount = orderAmount * value / 100`。

**Q4: 站内信、WebSocket 推送、邮件三者的区别和适用场景？**

> 站内信（DB）：持久化，用户可回溯，适合所有通知。WebSocket：仅在线用户实时接收，适合即时提醒（订单状态变更、聊天消息）。邮件：异步队列 + SMTP，离线用户也能收到，适合重要通知（订单确认、发货通知）。三者互补，不是替代关系。

**Q5: 操作日志为什么用 fire-and-forget 模式？有什么风险？**

> 收益：日志写入不阻塞业务响应，避免日志 DB 故障影响核心业务。风险：操作日志可能因写入失败而丢失。折中方案：先发到内存队列，异步批量写入 DB。更高级的是写入 Kafka → 消费者持久化。

**Q6: 如何防止 Webhook 被伪造攻击？**

> 三道防线：(1) Stripe SDK 的 `constructEvent(rawBody, signature, secret)` 用 HMAC-SHA256 验签，攻击者不知道 webhook secret 无法伪造；(2) 验证 `event.data.object` 的订单数据与 DB 中一致（如金额匹配）；(3) 幂等处理——用 Stripe 的 `event.id` 做去重，防止重复处理同一事件。

---

### 6. 本阶段亮点与简历描述建议

#### 本阶段亮点

- Stripe Checkout 托管支付 + Webhook 异步回调 + 签名验证
- 优惠券系统（固定金额/百分比 + 发放 + 核销 + 多维度校验）
- 通知三通道：站内信（DB）+ WebSocket 实时推送 + BullMQ 邮件队列
- 操作日志 AOP 拦截器（fire-and-forget 异步写库）

#### 简历描述模板（追加）

> - 集成 Stripe Checkout 实现支付功能，通过 Webhook 异步回调更新订单状态，配置 raw body 签名验证保障安全
> - 设计优惠券系统（固定金额/百分比两种类型），支持管理端发放与用户端核销，含多维度业务校验
> - 构建通知中心三通道：站内信持久化 + WebSocket 实时推送 + BullMQ 邮件队列异步发送
> - 使用 NestJS Interceptor 实现操作日志 AOP，自动记录管理员写操作（fire-and-forget 防阻塞）

---

### 7. 下阶段预告

**阶段 6：管理后台前端（Admin Panel）**

- Next.js 15 App Router 项目初始化
- Ant Design 集成 + `@ant-design/nextjs-registry`（SSR 兼容）
- 布局系统：侧边栏 + Header + 面包屑
- 登录页 + 权限路由守卫
- 商品/订单/统计等页面（调用后端 API）
- TanStack Query + Axios 封装
- 国际化切换
