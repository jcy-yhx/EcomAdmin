## 阶段 3：《商品管理模块》学习文档

### 1. 本阶段目标

搭建完整的商品管理体系：分类（树形结构）、品牌、规格/SKU、库存管理（Redis 分布式锁防超卖）、文件上传（Sharp 缩略图），实现电商后台核心的商品数据建模。

---

### 2. 核心知识点总结

- **树形分类设计**：`parentId` 自引用实现无限层级，内存 `buildTree()` 递归组装，设计决策：为什么不用闭包表/路径枚举？
- **SKU 与规格建模**：Spec → SpecValue → SKU → SkuSpec（中间表），实现多规格笛卡尔积组合
- **Prisma 嵌套写入**：`product.create({ data: { skus: { create: [...] }, images: { create: [...] } } })` 一次请求完成关联数据创建，利用数据库事务
- **Redis 分布式锁**：`SET lockKey value EX 5 NX` 实现互斥锁 + Lua 脚本原子释放，解决并发库存扣减超卖问题
- **Multer 文件上传 + Sharp 图像处理**：`FileInterceptor` 接收上传，Sharp 裁剪/缩放到 200×200
- **Prisma Decimal 定价**：`Decimal @db.Decimal(10, 2)` 精确存储金额，避免浮点数精度问题
- **多条件筛选 + 分页**：`QueryProductDto` 支持 status/categoryId/brandId/keyword 组合查询
- **Prisma 7 CommonJS 兼容**：`module: "commonjs"` + `moduleResolution: "node10"` 解决生成文件的 CJS/ESM 冲突
- **`@nestjs/serve-static`**：`ServeStaticModule.forRoot` 将 `uploads/` 目录映射为静态资源路由 `/uploads/`

---

### 3. 关键实现与代码解析

#### 3.1 树形分类 (`src/modules/category/category.service.ts`)

```typescript
async findTree() {
  const all = await this.prisma.category.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: 'asc' },
  });
  return this.buildTree(all);
}

private buildTree(items: any[], parentId: number | null = null): any[] {
  return items
    .filter((item) => item.parentId === parentId)
    .map((item) => ({ ...item, children: this.buildTree(items, item.id) }));
}
```

**设计选择**：一次查询出所有分类，在 Node.js 内存中递归组装成树。不需要多次 DB 查询（N+1 问题），也不需要存储路径字段。适合分类数量在百级以下的场景。如果分类数上万，应该改用闭包表（Closure Table）或物化路径。

**为什么不用 `parentId` 直接 `include: { children: true }`**？Prisma 的 `include` 只做一层嵌套，不会递归加载多层子节点。对于"树形"这种动态深度的结构，内存组装是最简单的方案。

#### 3.2 SKU 与规格关联表设计

```
Spec ──┐                    ┌── Sku
       ├── SkuSpec ──┤
SpecValue ──┘              Product
```

`SkuSpec` 作为中间表连接 `Sku` 和 `Spec + SpecValue`，每条记录表示"这个 SKU 的某个规格取值是什么"。三个字段 `(skuId, specId, specValueId)` 唯一确定一个 SKU 的完整规格组合。

```typescript
// 创建带 SKU 的商品 — 一次 Prisma 嵌套写入
await this.prisma.product.create({
  data: {
    name: 'iPhone 15 Pro',
    slug: 'iphone-15-pro',
    skus: {
      create: [
        {
          skuCode: 'IP15P-BLACK-128G',
          price: 6999.0,
          stock: 100,
          skuSpecs: {
            create: [
              { specId: specColor.id, specValueId: colorBlack.id },
              { specId: specStorage.id, specValueId: storage128.id },
            ],
          },
        },
      ],
    },
  },
});
```

**关键点**：Prisma 的 `create` 嵌套在 `product.create` 中自动开启数据库事务——如果任何 SKU 或图片创建失败，整个商品创建回滚，保证数据一致性。

#### 3.3 Redis 分布式锁防超卖 (`src/modules/inventory/inventory.service.ts`)

```typescript
async deduct(skuId: number, quantity: number) {
  const lockKey = `lock:sku:${skuId}`;
  const lockValue = `${Date.now()}`;
  const lockTTL = 5; // seconds

  // 1. 通过 SET NX EX 获取锁
  const acquired = await this.redis.set(lockKey, lockValue, 'EX', lockTTL, 'NX');
  if (!acquired) throw new BadRequestException('操作太频繁，请稍后重试');

  try {
    const sku = await this.prisma.sku.findUnique({ where: { id: skuId } });
    if (sku.stock < quantity) throw new BadRequestException(`库存不足: ${sku.stock}`);
    // 2. 扣减库存
    return this.prisma.sku.update({ where: { id: skuId }, data: { stock: { decrement: quantity } } });
  } finally {
    // 3. 原子释放锁：Lua 脚本保证 GET + DEL 原子性
    await this.redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1, lockKey, lockValue,
    );
  }
}
```

**三个要点**：

1. `SET NX EX`：原子性"判断不存在 → 设置 → 设定 TTL"，防止死锁
2. `lockValue = Date.now()`：每个请求持有唯一锁值，释放时校验所有权，避免误删他人锁
3. **Lua 脚本释放**：`GET + DEL` 必须是原子的，否则可能 A 校验通过后、DEL 执行前锁过期，B 获取了新锁，A 的 DEL 会误删 B 的锁

**面试加分**：可以说出"Redlock 算法是 Redis 官方推荐的多节点分布式锁方案，但单节点 Redis 的 SET NX + Lua 释放对中小规模项目足够"。

#### 3.4 Sharp 图片处理 + ServeStatic (`src/modules/upload/upload.service.ts`)

```typescript
async saveFile(file: Express.Multer.File): Promise<{ original: string; thumbnail: string }> {
  const timestamp = Date.now();
  const ext = path.extname(file.originalname) || '.jpg';
  const filename = `${timestamp}${ext}`;
  const thumbFilename = `${timestamp}_thumb${ext}`;

  fs.writeFileSync(filePath, file.buffer);
  await sharp(file.buffer)
    .resize(200, 200, { fit: 'cover' })
    .toFile(thumbPath);

  return { original: `/uploads/${filename}`, thumbnail: `/uploads/${thumbFilename}` };
}
```

**Sharp vs ImageMagick**：Sharp 基于 libvips，比 ImageMagick 快 4-5 倍，内存占用少。`fit: 'cover'` 保持比例裁剪，适合商品缩略图。

**`ServeStaticModule`** 的作用：将 `uploads/` 目录映射到 HTTP `GET /uploads/filename.jpg`，无需额外写 Controller 处理静态文件。

#### 3.5 Prisma 7 ESM/CJS 兼容性修复总结

本阶段踩坑：Prisma 7 生成的 TypeScript 文件使用 ESM 语法（`export const`），当 tsconfig 使用 `module: "nodenext"/"node16"` 时，编译后的 JS 在某些情况下被 Node.js 以 ESM 模式加载，导致 `exports is not defined`。

**最终方案**：`module: "commonjs"` + `moduleResolution: "node10"`，所有文件统一编译为 CommonJS 输出，消除模块系统不匹配。

| 尝试                 | 结果                                                          |
| -------------------- | ------------------------------------------------------------- |
| `module: "nodenext"` | ESM/CJS 冲突，运行时 `ReferenceError: exports is not defined` |
| `module: "node16"`   | 同上                                                          |
| `module: "commonjs"` | ✅ 正常工作                                                   |

---

### 4. 常见问题与解决方案

| 问题                                                                 | 原因                                                        | 解决方案                                                                        |
| -------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "prisma" not found`      | pnpm 未找到正确的 Prisma 路径，在 monorepo 中需指定 scope   | `pnpm --filter @ecom/server exec prisma db seed`                                |
| `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` | seed 脚本直接运行时未加载 `.env`，DATABASE_URL 为 undefined | 在 seed.ts 顶部添加 `import 'dotenv/config'`                                    |
| `npx prisma db seed` 报 "No seed command configured"                 | `prisma.config.ts` 中未配置 seed 路径                       | 添加 `seed: 'tsx prisma/seed.ts'` 到 migrations 配置                            |
| `This expression is not callable. Type 'typeof sharp'`               | `import * as sharp from 'sharp'` 不能用命名空间方式调用     | 改用 `import sharp from 'sharp'`（esModuleInterop 需要开启）                    |
| `Module not found: '../../../generated/prisma/client'`               | 模块内相对路径计算错误                                      | 从 `src/modules/product/` 到 `src/generated/` = `../../generated/prisma/client` |
| Multer 文件上传 Swagger 不显示 file 字段                             | Swagger 默认不支持 multipart/form-data                      | 添加 `@ApiConsumes('multipart/form-data')` + `@ApiBody` schema                  |

---

### 5. 面试高频问题

**Q1: 如何设计一个支持多级分类的数据库模型？比较几种方案。**

> 四种方案：(1) 邻接表（parentId）— 简单，但查所有子节点需递归查询；(2) 路径枚举（/1/2/5/）— 查子树快，但移动节点需更新路径；(3) 嵌套集（lft/rgt）— 查询极快，但插入/移动代价高；(4) 闭包表（ancestor/descendant/depth）— 查询和写入平衡，但表数据量大。本项目用邻接表——分类数预计百级，一次全查出在内存中组装树，简单高效。

**Q2: SKU 和 SPU 的区别是什么？怎么建模？**

> SPU（Standard Product Unit）= 商品（Product），例如 iPhone 15 Pro。SKU（Stock Keeping Unit）= 库存管理单位，例如 iPhone 15 Pro 黑色 128GB。一个 SPU 对多个 SKU，每个 SKU 是具体可售卖的最小粒度。建模：Spec/Value 表存规格模板 → SkuSpec 中间表连接 SKU 和规格值，实现灵活的规格组合。

**Q3: 如何解决库存超卖问题？**

> 三层防御：(1) 数据库行级锁 `SELECT ... FOR UPDATE`；(2) Redis 分布式锁（本项目的 `SET NX EX` + Lua 释放）；(3) 乐观锁（version 字段 + `UPDATE SET stock=stock-qty, version=version+1 WHERE version=oldVersion`）。本项目用 Redis 分布式锁——先获取锁，再查库存 → 扣减 → 释放锁。适合中等并发场景，高并发（秒杀）还需加预扣减 Redis 库存。

**Q4: 为什么价格用 Decimal 而不是 Float？**

> Float/Double 是二进制近似值，`0.1 + 0.2 != 0.3`。金额计算累积误差会导致财务报表不平。Decimal 是精确十进制存储，`Decimal(10,2)` 表示总共 10 位数字（含 2 位小数），最大 99999999.99。Prisma 中 `@db.Decimal(10,2)` 映射到 PostgreSQL `DECIMAL(10,2)`。

**Q5: Sharp 和 imagemagick/gm 有什么区别？为什么选 Sharp？**

> Sharp 基于 libvips，性能比 ImageMagick 快 4-5 倍，内存占用更少。Sharp 的 API 是异步的（返回 Promise），天然适合 Node.js。对于商品图片处理（裁剪、缩放、格式转换），Sharp 是最佳选择。ImageMagick 功能更丰富但性能差，适合需要文字水印/复杂滤镜的场景。

**Q6: Multer 的 `storage: memoryStorage()` 和 `diskStorage()` 如何选择？**

> `memoryStorage()` 将文件存在内存 Buffer，适合需要在代码中做后续处理（如 Sharp 压缩、CDN 上传）的场景，但大文件会撑爆内存。`diskStorage()` 存到磁盘，适合大文件或直接保存的场景。本项目用 memoryStorage → Sharp 处理 → 写磁盘，未来可改为 memoryStorage → Sharp → S3/OSS 上传。

---

### 6. 本阶段亮点与简历描述建议

#### 本阶段亮点

- 设计商品体系 7 张数据表（分类、品牌、商品、规格、SKU、规格关联、图片），支持多规格 SKU 组合
- 实现 Redis 分布式锁防库存超卖（SET NX + Lua 原子释放）
- Multer + Sharp 图片上传及自动缩略图生成
- 树形分类数据内存递归组装
- 商品多条件筛选 + 分页搜索
- Prisma 嵌套写入保证商品+SKU+图片的事务一致性
- 解决 Prisma 7 ESM/CJS 模块兼容性问题

#### 简历描述模板（追加）

> - 设计商品-SKU 数据模型（SPU/SKU 两层建模 + 规格模板-SKU 中间表），支持灵活的多规格组合
> - 实现 Redis 分布式锁机制（SET NX + Lua 脚本原子释放），解决高并发库存扣减超卖问题
> - 集成 Sharp 图像处理库实现商品图片上传、裁剪、缩略图自动生成
> - 使用 Prisma 嵌套写入实现商品 + SKU + 图片的事务性创建，保证数据一致性

---

### 7. 下阶段预告

**阶段 4：订单与购物车管理**

- 订单数据模型（主表 + 明细表 + 收货地址 + 物流信息）
- 订单状态机设计（待支付 → 已支付 → 已发货 → 已完成 / 已取消 / 已退款）
- 下单接口（事务：创建订单 + 扣减库存 + 清除购物车 + 生成支付链接）
- 订单查询（列表、详情、按状态筛选、时间范围）
- 订单超时自动取消（BullMQ 延迟队列）
- 购物车 API（Redis 存储）
- **前端穿插**：订单列表页 + 订单详情页
