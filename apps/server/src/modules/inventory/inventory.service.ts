import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.module';
import Redis from 'ioredis';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** Stock in: increase SKU stock */
  async stockIn(skuId: number, quantity: number, remark?: string) {
    if (quantity <= 0) throw new BadRequestException('入库数量必须大于0');
    return this.prisma.sku.update({ where: { id: skuId }, data: { stock: { increment: quantity } } });
  }

  /** Stock out / Deduct: decrease SKU stock with Redis distributed lock */
  async deduct(skuId: number, quantity: number) {
    if (quantity <= 0) throw new BadRequestException('扣减数量必须大于0');

    const lockKey = `lock:sku:${skuId}`;
    const lockValue = `${Date.now()}`;
    const lockTTL = 5; // seconds

    // Try acquire distributed lock
    const acquired = await this.redis.set(lockKey, lockValue, 'EX', lockTTL, 'NX');
    if (!acquired) throw new BadRequestException('操作太频繁，请稍后重试');

    try {
      const sku = await this.prisma.sku.findUnique({ where: { id: skuId } });
      if (!sku) throw new NotFoundException('SKU 不存在');
      if (sku.stock < quantity) throw new BadRequestException(`库存不足，当前库存: ${sku.stock}`);

      return this.prisma.sku.update({ where: { id: skuId }, data: { stock: { decrement: quantity } } });
    } finally {
      // Release lock (only if it's still our lock)
      await this.redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1,
        lockKey,
        lockValue,
      );
    }
  }

  /** Stock reservation for order (temporary hold) — to be used in Phase 4 */
  async reserveStock(skuId: number, quantity: number): Promise<void> {
    await this.deduct(skuId, quantity);
  }

  /** Release reserved stock back */
  async releaseStock(skuId: number, quantity: number): Promise<void> {
    await this.stockIn(skuId, quantity);
  }
}
