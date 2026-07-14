EcomAdmin - 电商管理系统
开发文档 V2.0

---

## 项目目标

通过一个完整的电商后台管理系统，系统性学习 **NestJS 后端 + Next.js App Router 前端**全栈开发。
**重点在后端**，同时有一个可实际使用的管理界面，并兼顾一个极简用户端(Storefront)以完成购物→下单→支付闭环。

---

## 技术栈

| 层级      | 技术                                   | 说明                                                   |
| --------- | -------------------------------------- | ------------------------------------------------------ |
| 后端框架  | NestJS + TypeScript                    | 企业级 Node.js 框架                                    |
| ORM       | Prisma                                 | 类型安全的数据库操作 + Migration                       |
| 数据库    | PostgreSQL                             | 主数据库                                               |
| 缓存/限流 | Redis                                  | 缓存 + Refresh Token 黑名单 + Rate Limiting + 分布式锁 |
| 消息队列  | BullMQ                                 | 异步任务（邮件、通知、订单超时取消）                   |
| 参数校验  | class-validator + class-transformer    | DTO 自动校验                                           |
| API 文档  | Swagger                                | 自动生成 API 文档                                      |
| 测试      | Jest (单元 + e2e)                      | 测试覆盖                                               |
| 前端框架  | Next.js 15 (App Router)                | Admin 面板 + 极简 Storefront                           |
| UI 库     | Ant Design                             | 管理后台组件                                           |
| 数据请求  | TanStack Query + Axios                 | 前端数据管理                                           |
| 国际化    | next-intl / react-intl                 | 中英文切换                                             |
| Monorepo  | pnpm workspace                         | 包管理 + 依赖链接（可后续叠加 Turborepo）              |
| 代码质量  | ESLint + Prettier + Husky + Commitlint | 代码规范与 Git hooks                                   |
| CI/CD     | GitHub Actions                         | 自动测试、构建、部署                                   |
| 容器化    | Docker + Docker Compose                | 本地开发环境 + 部署                                    |

### Monorepo 工具选型说明

选择 **pnpm workspace** 作为 monorepo 基础方案：

- `apps/` 目录下 3 个包（server、admin、storefront），通过 `pnpm-workspace.yaml` 声明
- 共享包放在 `packages/` 目录下（例如 `packages/shared-types` 存放前后端共用的 DTO 类型定义，`packages/eslint-config` 统一 lint 规则）
- pnpm 天生支持 workspace 协议（`"@ecom/shared-types": "workspace:*"`），无需额外工具
- 暂不加 Turborepo：3 个包规模不需要构建缓存调度；后续如需加速 CI，加一个 `turbo.json` 即可，无需改动目录结构

---

## 功能模块总览

### 管理后台 (Admin Panel)

- 用户与权限管理（RBAC：超级管理员 / 普通管理员，支持细粒度权限）
- 商品管理（分类、品牌、规格、SKU、库存）
- 订单管理（全生命周期：状态机驱动）
- 支付管理（Stripe 集成 + Webhook 处理）
- 优惠券 / 营销活动
- 数据统计仪表盘
- 文件上传（商品图片，支持缩略图）
- 通知中心（站内信 + WebSocket 实时推送 + 邮件）
- 操作日志（记录管理员关键操作）
- 多语言支持（中文 / 英文）

### 用户端 (Storefront) — 极简版

- 商品浏览与搜索
- 购物车（Redis 存储）
- 下单与支付（Stripe Checkout）
- 订单查询

---

## API 设计规范（全局约定）

- **统一响应格式**：`{ code: number, data: T, message: string }`
- **统一分页格式**：请求 `{ page, pageSize, sort, order }` → 响应 `{ list, total, page, pageSize }`
- **API 版本控制**：`/api/v1/...`
- **软删除**：核心实体（用户、商品、订单）使用 `deletedAt` 字段
- **DTO 校验**：所有入参通过 `class-validator` 装饰器校验

---

## 分阶段开发计划（共 8 个阶段）

### 阶段 1：项目初始化与后端基础架构

**目标**：搭建可扩展的后端骨架

- [ ] NestJS 项目创建 + 模块化目录结构设计
- [ ] Prisma + PostgreSQL 连接 + 首次 Migration
- [ ] Docker Compose 编排（PostgreSQL + Redis + App）
- [ ] 环境变量管理（`.env` + ConfigService）
- [ ] Swagger 集成
- [ ] 全局模块：
  - 统一响应拦截器（`TransformInterceptor`）
  - 全局异常过滤器（`HttpExceptionFilter`）
  - 统一日志器（Winston / Pino）
- [ ] 统一分页 DTO 与响应格式
- [ ] API 版本控制（`/api/v1/`）
- [ ] 基础 Health Check 接口
- [ ] ESLint + Prettier 配置
- [ ] Husky + lint-staged + Commitlint 配置
- [ ] GitHub Actions：CI 流水线（lint + build + test）

---

### 阶段 2：认证、权限与国际化

**目标**：建立完整的安全与权限体系

- [ ] 用户模块（CRUD + 软删除 + 分页查询）
- [ ] 注册接口（密码 bcrypt 加密）
- [ ] JWT Access Token + Refresh Token 双令牌机制
- [ ] Redis 管理 Refresh Token（白名单/黑名单）
- [ ] RBAC 权限系统：
  - 角色表 + 权限表 + 用户-角色关联
  - `@Roles()` 装饰器 + `RolesGuard`
  - `@Permissions()` 装饰器 + `PermissionsGuard`
- [ ] 登录 / 登出 / Token 刷新接口
- [ ] i18n 多语言支持（nestjs-i18n）
- [ ] **前端穿插**：Admin 登录页面 + Token 管理

---

### 阶段 3：商品管理模块

**目标**：核心业务模块，前后端联动

- [ ] 商品分类（树形结构、支持多级）
- [ ] 品牌管理
- [ ] 商品 CRUD（含软删除、分页、搜索、筛选）
- [ ] 规格与规格值管理
- [ ] SKU 管理（价格、库存、图片、规格组合）
- [ ] 库存管理（入库/出库/扣减，Redis 分布式锁防超卖）
- [ ] 文件上传：
  - Multer 接收文件
  - Sharp 图片压缩 + 生成缩略图
  - 本地存储 → 预留 S3/OSS 接口
- [ ] Redis 缓存热点商品数据
- [ ] 种子数据脚本（预置分类、品牌、示例商品）
- [ ] **前端穿插**：商品列表页 + 商品编辑页 + 分类管理页

---

### 阶段 4：订单管理

**目标**：电商核心交易链路

- [ ] 订单数据模型（主表 + 明细表 + 收货地址 + 物流信息）
- [ ] 订单状态机设计：
  ```
  待支付 → 已支付 → 已发货 → 已完成
    ↓         ↓
  已取消   已退款(←→)
  ```
- [ ] 下单接口（事务：创建订单 + 扣减库存 + 清除购物车 + 生成支付链接）
- [ ] 订单查询（列表、详情、按状态筛选、时间范围）
- [ ] 订单状态流转（校验合法状态转移）
- [ ] 订单超时自动取消（BullMQ 延迟队列）
- [ ] **前端穿插**：订单列表页 + 订单详情页

---

### 阶段 5：支付、营销与通知

**目标**：完善业务闭环与异步处理

#### 支付

- [ ] Stripe Checkout Session 创建
- [ ] **Webhook 处理**（核心）：监听 `payment_intent.succeeded` / `payment_intent.payment_failed`
- [ ] 支付状态同步（幂等处理）
- [ ] 退款接口

#### 营销

- [ ] 优惠券 CRUD（满减券 / 折扣券 / 有效期）
- [ ] 优惠券发放与领取
- [ ] 下单时优惠券核销（计算优惠金额、事务扣减）

#### 通知

- [ ] BullMQ 队列：邮件发送、站内信、订单状态通知
- [ ] WebSocket 网关：实时推送订单状态变更给管理员
- [ ] 站内信（消息表 + 已读/未读）

#### 日志

- [ ] 操作日志中间件/拦截器（记录管理员关键操作：谁、什么时候、做了什么、IP）
- [ ] 日志查询与导出

#### 前端

- [ ] **前端穿插**：优惠券管理页 + 通知中心页 + 操作日志页

---

### 阶段 6：管理后台前端（Admin Panel）

**目标**：完整可用的管理界面

- [ ] Next.js 15 App Router 项目初始化
- [ ] Ant Design 集成 + `@ant-design/nextjs-registry`（解决 SSR 兼容）
- [ ] 布局系统：侧边栏导航 + 顶部 Header + 面包屑
- [ ] 登录页 + 权限路由守卫（根据角色/权限动态显示菜单）
- [ ] 用户管理页
- [ ] 商品管理页（列表 + 新建/编辑 + 图片上传）
- [ ] 订单管理页（列表 + 详情 + 状态操作按钮）
- [ ] 数据统计仪表盘（Recharts 图表）
- [ ] 国际化切换（中/英文，Ant Design 语言包联动）
- [ ] TanStack Query 数据请求封装（统一错误处理 + Toast 提示）
- [ ] Axios 拦截器（自动附带 Token、Token 过期自动刷新）

---

### 阶段 7：用户端 Storefront（极简版）

**目标**：演示购物→下单→支付完整闭环

- [ ] Next.js App Router 项目（可复用 Admin 项目的 monorepo 结构）
- [ ] 商品浏览页（分类筛选 + 搜索 + 分页）
- [ ] 商品详情页（规格选择 + SKU 价格联动）
- [ ] 购物车：
  - 未登录：LocalStorage
  - 已登录：Redis 存储（后端 API）
- [ ] 下单与支付（Stripe Checkout 重定向）
- [ ] 订单查询页（按手机号/订单号查询）

---

### 阶段 8：测试、优化与部署

**目标**：让项目达到可展示、可演示的完成度

- [ ] 后端单元测试（Service 层重点覆盖：订单、库存、优惠券计算）
- [ ] 后端 e2e 测试（核心流程：登录→创建订单→支付→状态流转）
- [ ] Rate Limiting（`@nestjs/throttler` + Redis 存储）
- [ ] 性能优化：
  - 数据库索引优化（常用查询字段）
  - Prisma 查询 N+1 问题检查
  - Redis 缓存策略调整
- [ ] 完整 Swagger 文档（分组 + 示例值 + 权限标注）
- [ ] Docker Compose 一键启动生产环境
- [ ] README.md：项目介绍 + 架构图 + 本地运行指南 + API 文档链接 + 技术亮点
- [ ] 后端部署（Railway / VPS + Docker）
- [ ] 前端部署（Vercel）
- [ ] GitHub Actions：CD 自动部署流水线

---

## 附：推荐目录结构

```
EcomAdmin-API/
├── apps/
│   ├── server/              # NestJS 后端
│   │   ├── src/
│   │   │   ├── common/      # 全局模块（拦截器、过滤器、守卫、装饰器、DTO）
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── user/
│   │   │   │   ├── product/
│   │   │   │   ├── order/
│   │   │   │   ├── payment/
│   │   │   │   ├── coupon/
│   │   │   │   ├── cart/
│   │   │   │   ├── notification/
│   │   │   │   └── log/
│   │   │   ├── prisma/
│   │   │   │   ├── schema.prisma
│   │   │   │   └── seed.ts
│   │   │   └── i18n/        # 多语言资源文件
│   │   ├── test/
│   │   └── package.json
│   ├── admin/               # Next.js Admin 面板
│   │   └── package.json
│   └── storefront/          # Next.js 用户端
│       └── package.json
├── packages/
│   ├── shared-types/        # 前后端共享 DTO / 类型定义
│   │   └── package.json
│   └── eslint-config/       # 统一 ESLint 配置
│       └── package.json
├── pnpm-workspace.yaml      # monorepo 声明
├── pnpm-lock.yaml
├── package.json             # 根 package.json（workspace scripts）
├── docker-compose.yml
├── Dockerfile
├── .github/workflows/       # CI/CD
└── README.md
```

文档结束
