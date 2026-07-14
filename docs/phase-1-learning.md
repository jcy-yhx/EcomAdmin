## 阶段 1：《项目初始化与后端基础架构》学习文档

### 1. 本阶段目标

搭建可扩展的 monorepo 后端骨架：pnpm workspace + NestJS + Prisma + Docker + Swagger + 全局基础设施，为后续业务模块开发奠定工程基础。

---

### 2. 核心知识点总结

- **Monorepo 工具链**：pnpm workspace 声明、workspace 协议 (`workspace:*`)、`--filter` 过滤执行
- **NestJS 生命周期**：`main.ts` 启动流程、模块依赖注入、全局管道/拦截器/过滤器注册顺序
- **统一 API 规范**：`TransformInterceptor` 包装响应 → `{ code, data, message }` 格式
- **异常处理体系**：`ExceptionFilter` 捕获所有异常、区分 `HttpException` vs 未知异常、记录堆栈
- **class-validator + class-transformer**：DTO 装饰器校验、`whitelist` / `transform` 选项
- **Winston 日志**：`nest-winston` 集成、控制台美化输出 + 文件持久化日志
- **Swagger/OpenAPI**：`DocumentBuilder` 配置、`@ApiTags` / `@ApiOperation` 装饰器、Bearer Auth
- **API 版本控制**：`VersioningType.URI` → `/api/v1/...`，与 `setGlobalPrefix('api')` 组合
- **Prisma 初始化**：`prisma init` → `schema.prisma` → `prisma.config.ts` → 环境变量 `DATABASE_URL`
- **Docker Compose 编排**：PostgreSQL 16 + Redis 7、健康检查、数据卷持久化
- **Git Hooks 工具链**：Husky 管理 hooks、lint-staged 只扫描暂存文件、Commitlint 校验提交信息

---

### 3. 关键实现与代码解析

> 以下代码片段仅为关键逻辑摘录，完整实现请查看项目源文件。

#### 3.1 统一响应拦截器 (`src/common/interceptors/transform.interceptor.ts`)

```typescript
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        code: 0, // 0 = 成功
        data,
        message: 'success',
      })),
    );
  }
}
```

**为什么这样设计**：`NestInterceptor` 是 AOP（面向切面编程）在 NestJS 中的体现。通过 RxJS 的 `pipe(map(...))` 对 Controller 的返回值做后置处理，所有接口自动获得统一格式，无需在每个 Controller 中手动包装。`code: 0` 为成功标识，非 0 留给业务异常码。

#### 3.2 全局异常过滤器 (`src/common/filters/http-exception.filter.ts`)

```typescript
@Catch()  // 不传参 = 捕获所有异常
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof HttpException) {
      // NestJS 内置异常（400/401/403/404 等）
      status = exception.getStatus();
      message = /* 提取 message */;
    } else {
      // 未预期的异常 → 500 + 记录日志
      status = 500;
      message = 'Internal server error';
      this.logger.error(/* 完整堆栈 */);
    }
    // 统一返回格式 + path + timestamp
  }
}
```

**关键点**：`@Catch()` 空参数捕获所有异常，包括 `HttpException`（框架抛出的）和未处理错误（代码 bug）。对后者记录完整堆栈，返回通用 500 而不泄漏敏感信息。

#### 3.3 `ValidationPipe` 全局配置 (`main.ts`)

```typescript
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // 自动剥离不在 DTO 中定义的字段
    forbidNonWhitelisted: true, // 有未定义字段时抛出 400
    transform: true, // 自动将字符串转为 DTO 声明的类型
  }),
);
```

**安全含义**：`forbidNonWhitelisted` 防止客户端注入未预期字段绕过校验；`transform` 让 query string 中的 `"1"` 自动转为 `number 1`，配合 `class-validator` 的 `@Type(() => Number)` 使用。

#### 3.4 Swagger + API 版本控制组合 (`main.ts`)

```typescript
app.setGlobalPrefix('api');
app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1',
});
// 最终路由格式：/api/v1/health
```

**为什么是 `URI` 而非 `Header` 版本控制**：URI 版本控制 (`/api/v1/`, `/api/v2/`) 更直观，便于 Swagger 文档分组，前端调用也更简单。Header 版本控制适合对 URI 纯净度要求极高的场景。

#### 3.5 Monorepo 结构 (`pnpm-workspace.yaml`)

```yaml
packages:
  - 'apps/*' # 应用包：server, admin, storefront
  - 'packages/*' # 共享包：shared-types, eslint-config
```

根 `package.json` 通过 `pnpm --filter @ecom/server <script>` 精确控制执行范围，避免在错误的包中运行脚本。

---

### 4. 常见问题与解决方案

| 问题                              | 原因                                                                                    | 解决方案                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `ERR_PNPM_IGNORED_BUILDS`         | pnpm v10+ 默认阻止未批准的 postinstall 脚本                                             | `pnpm approve-builds <package-name>`                            |
| `nest new` 后 `pnpm install` 失败 | NestJS CLI 默认用 npm，在 pnpm workspace 中冲突                                         | 用 `--package-manager pnpm` 显式指定；失败后手动 `pnpm install` |
| Prettier 格式化 404 不生效        | `.prettierrc` 需放在 workspace 根目录，`prettier --write` 需用绝对路径或从正确 cwd 执行 | 将 ESLint/Prettier 配置统一放在 monorepo 根目录                 |
| `ValidationPipe` 不自动转换类型   | 未设置 `transform: true` 或 `enableImplicitConversion`                                  | 两个都需要显式设置                                              |
| Swagger 不显示接口                | `setGlobalPrefix` 和 `enableVersioning` 的顺序问题                                      | 先 `setGlobalPrefix`，再 `enableVersioning`                     |

---

### 5. 面试高频问题

**Q1：为什么要用 monorepo？和 polyrepo 各有什么优劣？**

> Monorepo 的好处是共享类型定义、统一工具链配置、原子化 commit（前后端联动改动一次提交）。但大项目可能面临 CI 时间过长、Git 历史膨胀的问题。Turborepo/Nx 通过缓存和增量构建解决了部分性能问题。我们项目规模 3 个包，pnpm workspace 足够。

**Q2：`ValidationPipe` 的 `whitelist` 和 `forbidNonWhitelisted` 有什么区别？**

> `whitelist: true` 会静默剥离未定义字段；`forbidNonWhitelisted: true` 在有未定义字段时抛出 400。一般两个同时开启：先剥离，若不剩任何异常则不报错；但若剥离后仍有异常字段则报 400。更安全的做法是两者都开启。

**Q3：`ExceptionFilter` 和 `Interceptor` 的执行顺序是怎样的？**

> 请求进来：Middleware → Guard → Interceptor (before) → Pipe → Controller → Interceptor (after) → ExceptionFilter（如有异常）。**重要**：ExceptionFilter 捕获的范围包括 Interceptor 抛出的异常，所以统一响应 Interceptor 中抛出的异常也会被 Filter 处理。

**Q4：为什么要用 Winston 而不是 `console.log`？**

> Winston 支持多 transport（控制台 + 文件 + 远程）、日志分级（error/warn/info/debug）、结构化日志（JSON 格式便于 ELK 收集）。`console.log` 无法区分级别、无法自动写入文件、生产环境难以管理。

**Q5：API 版本控制有哪几种方式？为什么选 URI 方式？**

> 三种：URI (`/api/v1/`)、Header (`Accept: application/vnd.api.v1+json`)、Query (`?version=1`)。URI 方式最直观，浏览器和 Swagger 文档直接可见，无需特殊 Header。缺点是对 REST 纯粹主义者来说 URI 应该代表资源本身而非版本，但业界主流（GitHub、Stripe）都用 URI 方式。

**Q6：Docker Compose 中 `healthcheck` 的作用是什么？**

> `healthcheck` 告诉 Docker 如何判断容器是否真正"就绪"（而不仅仅是"启动了"）。`depends_on` 只等待容器启动，不加 healthcheck 可能导致应用在数据库初始化完成前就尝试连接。在 `docker-compose.yml` 中配合 `condition: service_healthy`（Compose v3+）实现真正的启动顺序依赖。

---

### 6. 本阶段亮点与简历描述建议

#### 本阶段亮点

- 从零搭建 pnpm workspace monorepo 架构
- 设计并实现了统一的 API 响应格式 + 异常处理 + 日志体系
- 完整的工程化配置：ESLint + Prettier + Husky + Commitlint + GitHub Actions CI
- Docker Compose 编排 PostgreSQL + Redis + 健康检查
- API 版本控制 + Swagger 文档自动生成

#### 简历描述模板

> **EcomAdmin 电商管理后台** — 全栈项目（进行中）
>
> - 基于 pnpm workspace 搭建 Monorepo 架构，统一管理 NestJS 后端、Next.js Admin 面板与 Storefront 用户端
> - 设计全局 API 规范：统一响应拦截器、异常过滤器、DTO 自动校验（class-validator）、API 版本控制 (/api/v1/)
> - 集成 Swagger 自动文档、Winston 结构化日志、Docker Compose 本地开发环境
> - 配置 CI/CD 流水线（GitHub Actions）、Husky Git Hooks、Commitlint 提交规范

---

### 7. 下阶段预告

**阶段 2：认证、权限与国际化**

- User 模块 CRUD + 软删除
- JWT Access Token + Refresh Token 双令牌机制
- Redis 管理 Refresh Token 白名单
- RBAC 权限系统（角色表 + `@Roles()` / `@Permissions()` 装饰器 + Guard）
- i18n 多语言（nestjs-i18n）
- 登录/登出/Token 刷新接口
- **前端穿插**：Admin 登录页面
