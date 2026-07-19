import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Processor('order-timeout')
export class OrderTimeoutProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderTimeoutProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ orderId: number }, any, string>) {
    const { orderId } = job.data;
    this.logger.log(`Checking order ${orderId} timeout...`);

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return;

    // Only cancel if still pending_payment
    if (order.status === 'pending_payment') {
      // Restore stock
      const items = await this.prisma.orderItem.findMany({ where: { orderId } });
      for (const item of items) {
        await this.prisma.sku.update({ where: { id: item.skuId }, data: { stock: { increment: item.quantity } } });
      }
      await this.prisma.order.update({ where: { id: orderId }, data: { status: 'cancelled' } });
      this.logger.log(`Order ${order.orderNo} auto-cancelled (timeout)`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.id} failed: ${err.message}`);
  }
}
