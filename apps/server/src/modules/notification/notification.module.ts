import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { EmailProcessor } from './email.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'email' })],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationGateway, EmailProcessor],
  exports: [NotificationService],
})
export class NotificationModule {}
