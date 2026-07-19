import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { CreateOrderDto, QueryOrderDto } from './dto/order.dto';
import { Prisma } from '../../generated/prisma/client';

/** Order state machine — valid transitions */
const STATE_MACHINE: Record<string, string[]> = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['shipped', 'refunding'],
  shipped: ['completed'],
  refunding: ['refunded'],
  completed: [],
  cancelled: [],
  refunded: [],
};

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    @InjectQueue('order-timeout') private readonly timeoutQueue: Queue,
  ) {}

  /** Create order from cart: atomic transaction (create order + deduct stock + clear cart) */
  async create(userId: number, dto: CreateOrderDto) {
    const cartItems = await this.cartService.getCartItems(userId);
    if (cartItems.length === 0) throw new BadRequestException('购物车为空，无法下单');

    let totalAmount = 0;
    const orderItems: Array<{
      skuId: number;
      productName: string;
      skuCode: string;
      specDesc: string | null;
      price: number;
      quantity: number;
      image: string | null;
    }> = [];

    // Calculate total & validate stock
    for (const item of cartItems) {
      const sku = await this.prisma.sku.findUnique({
        where: { id: item.skuId },
        include: { skuSpecs: { include: { specValue: true } } },
      });
      if (!sku) throw new BadRequestException(`SKU ${item.skuId} 不存在`);
      if (sku.stock < item.quantity)
        throw new BadRequestException(`${item.productName} (${item.skuCode}) 库存不足，当前库存: ${sku.stock}`);

      const specDesc = sku.skuSpecs.map((ss) => ss.specValue.value).join(' / ') || null;
      totalAmount += Number(sku.price) * item.quantity;
      orderItems.push({
        skuId: sku.id,
        productName: item.productName,
        skuCode: sku.skuCode,
        specDesc,
        price: Number(sku.price),
        quantity: item.quantity,
        image: item.image,
      });
    }

    const orderNo = `EC${Date.now()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Transaction: create order + deduct stock + clear cart
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNo,
          userId,
          status: 'pending_payment',
          totalAmount,
          remark: dto.remark,
          items: { createMany: { data: orderItems } },
          address: { create: { ...dto.address } },
        },
        include: { items: true, address: true },
      });

      // Deduct stock for each SKU
      for (const item of orderItems) {
        await tx.sku.update({ where: { id: item.skuId }, data: { stock: { decrement: item.quantity } } });
      }

      // Clear cart
      await this.cartService.clearCart(userId);

      return created;
    });

    // Schedule auto-cancel in 30 minutes for unpaid orders
    const delayMs = 30 * 60 * 1000; // 30 minutes
    await this.timeoutQueue.add('cancel-order', { orderId: order.id }, { delay: delayMs, removeOnComplete: true });

    return order;
  }

  /** Paginated order list with filters */
  async findAll(query: QueryOrderDto) {
    const { page = 1, pageSize = 10, status, keyword, startDate, endDate } = query;
    const where: Prisma.OrderWhereInput = { deletedAt: null };

    if (status) where.status = status;
    if (keyword) where.orderNo = { contains: keyword };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const [list, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { items: true, address: true, user: { select: { id: true, email: true, username: true } } },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  /** Order detail */
  async findById(id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, address: true, user: { select: { id: true, email: true, username: true } } },
    });
    if (!order || order.deletedAt) throw new NotFoundException('订单不存在');
    return order;
  }

  /** Transition order status with state machine validation */
  async updateStatus(id: number, newStatus: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order || order.deletedAt) throw new NotFoundException('订单不存在');

    const allowed = STATE_MACHINE[order.status];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new BadRequestException(`不允许从 ${order.status} 转为 ${newStatus}`);
    }

    // Cancelled: restore stock
    if (newStatus === 'cancelled' || newStatus === 'refunded') {
      const items = await this.prisma.orderItem.findMany({ where: { orderId: id } });
      await this.prisma.$transaction(
        items.map((item) =>
          this.prisma.sku.update({ where: { id: item.skuId }, data: { stock: { increment: item.quantity } } }),
        ),
      );
    }

    return this.prisma.order.update({
      where: { id },
      data: { status: newStatus },
      include: { items: true, address: true },
    });
  }
}
