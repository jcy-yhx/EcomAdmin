import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { REDIS_CLIENT } from '../../redis/redis.module';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';

export interface CartItem {
  skuId: number;
  quantity: number;
  price: number;
  productName: string;
  skuCode: string;
  image: string | null;
}

@Injectable()
export class CartService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  private cartKey(userId: number) {
    return `cart:${userId}`;
  }

  /** Add or update item quantity in cart */
  async addItem(userId: number, skuId: number, quantity: number) {
    const sku = await this.prisma.sku.findUnique({
      where: { id: skuId },
      include: { product: { select: { name: true, status: true } } },
    });
    if (!sku) throw new NotFoundException('SKU 不存在');

    const key = this.cartKey(userId);
    const item: CartItem = {
      skuId,
      quantity,
      price: Number(sku.price),
      productName: sku.product.name,
      skuCode: sku.skuCode,
      image: sku.image,
    };
    await this.redis.hset(key, String(skuId), JSON.stringify(item));
    return { message: '已加入购物车' };
  }

  /** Get all cart items with computed total */
  async getCart(userId: number) {
    const key = this.cartKey(userId);
    const raw = await this.redis.hgetall(key);
    const items = Object.values(raw).map((v) => JSON.parse(v) as CartItem);
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return { items, total };
  }

  /** Update item quantity */
  async updateItem(userId: number, skuId: number, quantity: number) {
    const key = this.cartKey(userId);
    const raw = await this.redis.hget(key, String(skuId));
    if (!raw) throw new NotFoundException('购物车中无此商品');
    const item: CartItem = JSON.parse(raw);
    item.quantity = quantity;
    await this.redis.hset(key, String(skuId), JSON.stringify(item));
    return { message: '购物车已更新' };
  }

  /** Remove an item from cart */
  async removeItem(userId: number, skuId: number) {
    await this.redis.hdel(this.cartKey(userId), String(skuId));
    return { message: '已从购物车移除' };
  }

  /** Clear entire cart */
  async clearCart(userId: number) {
    await this.redis.del(this.cartKey(userId));
  }

  /** Get raw cart items for order creation */
  async getCartItems(userId: number): Promise<CartItem[]> {
    const key = this.cartKey(userId);
    const raw = await this.redis.hgetall(key);
    return Object.values(raw).map((v) => JSON.parse(v) as CartItem);
  }
}
