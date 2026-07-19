import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { CartModule } from '../cart/cart.module';

@Module({
  imports: [CartModule, BullModule.registerQueue({ name: 'order-timeout' })],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
