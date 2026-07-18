## 阶段 2：《认证、权限与国际化》学习文档

### 1. 本阶段目标

建立完整的用户认证体系（JWT 双 Token）、RBAC 权限模型（角色 + 权限 + 装饰器 + 守卫）、国际化基础设施（nestjs-i18n 中英文）。

---

### 2. 核心知识点总结

- **JWT 双 Token 机制**：Access Token（短时效 15min）+ Refresh Token（长时效 7d），Access Token 过期后用 Refresh Token 换新
- **Refresh Token 存储策略**：DB 持久化 + Redis 缓存双层存储，兼顾持久性与查询速度
- **bcrypt 密码加密**：`bcrypt.hash(password, 10)` salt rounds=10 是安全与性能的平衡值
- **Passport JWT Strategy**：`PassportStrategy(Strategy, 'jwt')` 验证请求中的 Bearer Token，`validate()` 返回注入 `req.user` 的对象
- **RBAC 数据模型**：User ↔ UserRole ↔ Role ↔ RolePermission ↔ Permission，五表实现用户-角色-权限的灵活映射
- **NestJS Guard 管道**：`JwtAuthGuard` → `RolesGuard` → `PermissionsGuard`，通过 `APP_GUARD` 全局注册 + `@Public()` 跳过
- **`Reflector` 元数据**：`@SetMetadata(KEY, value)` 设置元数据，Guard 中通过 `this.reflector.getAllAndOverride()` 读取
- **nestjs-i18n**：JSON 翻译文件（en/zh）+ `I18nModule.forRoot()` + `HeaderResolver` 根据 `Accept-Language` 自动切换
- **Prisma 7 适配器模式**：Prisma 7 必须使用驱动适配器（`@prisma/adapter-pg` + `PrismaPg`）连接 PostgreSQL
- **Prisma 7 ESM/CJS 兼容**：Prisma 7 生成的客户端是 ESM，需要 `module: "node16"` 和 `moduleResolution: "node16"` 在 tsconfig 中配合
- **软删除模式**：`deletedAt DateTime?` 字段，查询时统一过滤 `deletedAt: null`
- **@nestjs/jwt**：`JwtModule.registerAsync` 异步加载配置，`JwtService.signAsync` 签名，`JwtService.verify` 验证

---

### 3. 关键实现与代码解析

#### 3.1 Prisma 7 数据库适配器 (`src/prisma/prisma.service.ts`)

```typescript
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const connectionString = configService.get<string>('DATABASE_URL');
    super({
      adapter: new PrismaPg({ connectionString }),
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

**为什么这样设计**：Prisma 7 是重大版本升级，不再支持直接在构造函数中传 `datasourceUrl`。统一使用驱动适配器模式 —— `@prisma/adapter-pg` 封装了 `pg` 驱动，这是 Prisma 7 连接 PostgreSQL 的唯一方式。配合 `@Global()` 装饰器，`PrismaModule` 全局可用。

**踩坑记录**：Prisma 7 生成的 `.ts` 是 ESM，需要 tsconfig 的 `module: "node16"` + `moduleResolution: "node16"` 才能正确编译和运行。同时 `resolvePackageJsonExports: true` 必须保留。Prisma 7 不再从 `@prisma/client` 导出 `PrismaClient` 和 `Prisma`，必须从生成的 `../generated/prisma/client` 导入。

#### 3.2 JWT 双 Token 生成与刷新 (`src/modules/auth/auth.service.ts`)

```typescript
private async generateTokens(userId: number, email: string) {
  const accessExpiresIn = 15 * 60;          // 15 分钟
  const refreshExpiresIn = 7 * 24 * 60 * 60; // 7 天

  const [accessToken, refreshTokenValue] = await Promise.all([
    this.jwtService.signAsync({ sub: userId, email, type: 'access' }, {
      secret: this.configService.get('JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn,
    }),
    this.jwtService.signAsync({ sub: userId, email, type: 'refresh' }, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiresIn,
    }),
  ]);
  return { accessToken, refreshToken: refreshTokenValue, expiresIn: accessExpiresIn };
}
```

**关键设计**：两个 Token 用不同 Secret 签名——这是安全最佳实践，即使 Access Token 的 Secret 泄漏也不会影响 Refresh Token。`type` 字段区分 token 类型，防止用 Refresh Token 当 Access Token 使用。`expiresIn` 在 Prisma 7 的 `@nestjs/jwt` v11 中必须用 `number`（秒），不能用字符串。

**Refresh Token 刷新流程**：

1. 客户端拿 `refreshToken` 调 `/auth/refresh`
2. 服务端先 `jwtService.verify` 验证签名，校验 `type === 'refresh'`
3. 检查 DB 中 `refreshToken` 记录是否存在、Redis 中缓存是否存在
4. 如果都存在 → 删除旧 token（DB + Redis），签发新 token pair
5. 如果不存在 → 可能是 token 已被使用过（rotation 攻击保护），拒绝

#### 3.3 RBAC 权限守卫 (`src/modules/rbac/guards/permissions.guard.ts`)

```typescript
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermissions?.length) return true;

    const { user } = context.switchToHttp().getRequest();
    return requiredPermissions.every((perm) => user.permissions?.includes(perm));
  }
}
```

**为什么用 `every` 而非 `some`**：`@Permissions('product:read', 'product:manage')` 表示需要**同时拥有**这两个权限才能访问，这是 AND 逻辑。`@Roles` 用的是 `some`（OR 逻辑）——拥有任意一个角色即可。

**为什么用 `getAllAndOverride` 而非 `get`**：`getAllAndOverride` 让方法级别的装饰器能覆盖类级别的。如果类上设了 `@Roles('admin')` 但某个方法设了 `@Public()`，方法级别的 `@Public()` 会生效。

#### 3.4 JWT Strategy 与 req.user 注入 (`src/modules/auth/strategies/jwt.strategy.ts`)

```typescript
async validate(payload: JwtPayload) {
  if (payload.type !== 'access') { throw new UnauthorizedException('令牌类型错误'); }
  const user = await this.userService.findById(payload.sub);
  if (!user.isActive) { throw new UnauthorizedException('账户已被禁用'); }

  return {
    userId: payload.sub,
    email: payload.email,
    // 展平角色码和权限码，方便 Guard 做 in-memory 判断
    roles: user.userRoles.map(ur => ur.role.code),
    permissions: [...new Set(
      user.userRoles.flatMap(ur => ur.role.rolePermissions.map(rp => rp.permission.code))
    )],
  };
}
```

**关键点**：`validate()` 的返回值会被 Passport 自动注入到 `req.user`。这里提前查询了用户的角色和权限码并展平，避免了后续 Guard 每次都查库。`[...new Set(...)]` 去重是因为用户可能有多个角色，角色间权限可能重叠。

#### 3.5 全局 Guard 注册与 @Public() 跳过机制

```typescript
// app.module.ts — 全局注册，所有请求都必须通过
providers: [
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_GUARD, useClass: RolesGuard },
  { provide: APP_GUARD, useClass: PermissionsGuard },
]

// jwt-auth.guard.ts — 检查 @Public()，有则跳过 JWT 验证
canActivate(context: ExecutionContext) {
  const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
    context.getHandler(), context.getClass(),
  ]);
  if (isPublic) return true;
  return super.canActivate(context);
}
```

**执行顺序**（按 providers 数组顺序）：`JwtAuthGuard` → `RolesGuard` → `PermissionsGuard`。每个 Guard 都独立检查 `IS_PUBLIC_KEY`。带 `@Public()` 的端点（如 `health/`、`auth/login`、`auth/register`）三个 Guard 都直接返回 true。

---

### 4. 常见问题与解决方案

| 问题                                                                       | 原因                                                                              | 解决方案                                                                         |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Prisma 7 `Module '"@prisma/client"' has no exported member 'PrismaClient'` | Prisma 7 不再从 npm 包导出 `PrismaClient`，改为从生成目录导出                     | `import { PrismaClient } from '../generated/prisma/client'`                      |
| `'datasourceUrl' does not exist in type`                                   | Prisma 7 用 adapter 模式替代了直接传 URL                                          | 安装 `@prisma/adapter-pg` + `pg`，传 `adapter: new PrismaPg({connectionString})` |
| `ReferenceError: exports is not defined in ES module scope`                | Prisma 7 生成 ESM，tsconfig 的 `module: "commonjs"` 不兼容                        | 使用 `module: "node16"` + `moduleResolution: "node16"`                           |
| JWT `expiresIn` 类型不匹配                                                 | `@nestjs/jwt` v11 的 `expiresIn` 接受 `number \| StringValue`，普通 `string` 不行 | 使用秒数 `15 * 60` 代替 `'15m'`                                                  |
| PassportStrategy `secretOrKey` 类型错误                                    | `configService.get()` 返回 `string \| undefined`                                  | 提供默认值：`configService.get('KEY', 'fallback')`                               |
| Health 端点返回 401                                                        | 全局 `APP_GUARD` 注册了 `JwtAuthGuard`                                            | 在 Health Controller 上加 `@Public()` 装饰器                                     |
| i18n 路径找不到 (`dist/src/i18n/`)                                         | `__dirname + 'i18n'` 在编译后指向 `dist/src/i18n/` 而非 `dist/i18n/`              | 使用 `path.join(__dirname, '..', 'i18n')` 并配置 nest-cli `assets`               |
| `ERR_PNPM_IGNORED_BUILDS` (bcrypt)                                         | pnpm 安全策略阻止 native addon 构建                                               | `pnpm approve-builds bcrypt`                                                     |

---

### 5. 面试高频问题

**Q1: JWT Access Token 和 Refresh Token 为什么要分开？各自的职责是什么？**

> Access Token 短时效（15min），直接携带在请求中访问 API；Refresh Token 长时效（7d），仅用于换取新的 Access Token。这样即使 Access Token 被截获，攻击者也只有 15 分钟的窗口。Refresh Token 存储在服务端（DB + Redis），可以主动撤销。

**Q2: Refresh Token Rotation 是什么？为什么要实现它？**

> 每次使用 Refresh Token 换取新 Token 时，旧 Refresh Token 立即失效并签发新的一对。防止 Refresh Token 被截获后攻击者持续刷新。如果攻击者用旧的 Refresh Token 来刷新，服务端检测到 token 已被使用过，可以判定为攻击并撤销该用户的所有 token。

**Q3: RBAC 和 ABAC 的区别？什么时候用哪个？**

> RBAC（基于角色）：用户 → 角色 → 权限。适合角色固定、权限划分清晰的场景（如管理后台）。ABAC（基于属性）：用户属性 + 资源属性 + 环境属性 → 权限决策。适合复杂细粒度场景（如文档协作系统，同部门的编辑者才能修改特定文档）。本项目用 RBAC + 细粒度 Permission Code 组合，接近 RBAC 的最佳实践。

**Q4: `@Roles()` 和 `@Permissions()` 可以同时使用吗？守卫执行顺序是怎样的？**

> 可以同时使用。`JwtAuthGuard`（身份验证）→ `RolesGuard`（角色检查，OR 逻辑）→ `PermissionsGuard`（权限检查，AND 逻辑）。三层级联：先确认是谁，再判断角色，最后校验具体权限。

**Q5: `bcrypt.hash` 的 salt rounds 选多大合适？为什么？**

> 10-12 rounds 是生产环境常用值。10 rounds 大约 50-100ms/次，不会明显影响登录体验。每增加 1 个 round，计算时间翻倍。12 rounds 约 200-400ms。SQL 注入等攻击中，更高的 rounds 让暴力破解成本极高。但过高会拖慢登录和注册接口。

**Q6: 为什么要用 Passport 而不是手写 JWT 验证？**

> Passport 是 Node.js 生态中最成熟的认证中间件，NestJS 的 `@nestjs/passport` 提供了深度集成。它统一了认证策略（JWT、OAuth、local 等），通过 Strategy 模式将认证逻辑解耦。`AuthGuard('jwt')` 自动处理 token 提取、验证、错误响应，我们的 `JwtStrategy.validate()` 只负责返回 `req.user` 的内容。

---

### 6. 本阶段亮点与简历描述建议

#### 本阶段亮点

- 实现 JWT 双 Token 认证机制（Access Token 15min + Refresh Token 7d + Rotation 防盗用）
- 设计 RBAC 权限模型：5 张数据表 → 用户/角色/权限三层 Guard + 装饰器
- Prisma 7 适配器模式数据库连接，解决了 ESM/CJS 模块兼容性
- Redis + DB 双层 Refresh Token 存储（快速查询 + 持久化）
- i18n 国际化：nestjs-i18n + Accept-Language 头自动切换中英文
- 全局 Guard 注册 + `@Public()` 装饰器跳过机制

#### 简历描述模板（可追加到阶段 1 的模板后）

> - 实现 JWT 双 Token 认证与 Refresh Token Rotation 机制，Redis + PostgreSQL 双层存储，提升安全性
> - 设计 RBAC 权限模型（用户-角色-权限），通过 NestJS Guard + 自定义装饰器实现声明式权限控制
> - 使用 Prisma 7 适配器模式连接 PostgreSQL，解决 ESM/CJS 模块兼容性问题
> - 集成 nestjs-i18n 实现中英文国际化，支持请求头自动检测与手动切换

---

### 7. 下阶段预告

**阶段 3：商品管理模块**

- 商品分类（树形结构）、品牌管理、商品 CRUD
- 规格与 SKU 管理（价格、库存、规格组合）
- 库存管理（Redis 分布式锁防超卖）
- 文件上传（Multer + Sharp 缩略图）
- Redis 缓存热点商品
- 种子数据脚本（预置分类、品牌、示例商品）
- **前端穿插**：商品列表页 + 商品编辑页

> ⚠️ **注意**：阶段 3 依赖 Docker 环境运行 PostgreSQL + Redis。请先安装 Docker Desktop 并配置 WSL2 集成，然后运行 `docker compose up -d` 启动基础设施，再执行 `npx prisma migrate dev --name init` 和 `npx prisma db seed` 初始化数据库。
