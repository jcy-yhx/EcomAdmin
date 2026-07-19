import { Injectable, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationGateway,
    @InjectQueue('email') private readonly emailQueue: Queue,
  ) {}

  /** Create in-app notification + push WS + queue email */
  async notify(userId: number, title: string, content: string, type = 'system') {
    // 1. Save to DB (in-app notification)
    const notif = await this.prisma.notification.create({
      data: { userId, title, content, type },
    });

    // 2. Push via WebSocket
    this.gateway.sendNotification(userId, { title, content, type });

    // 3. Queue email (async)
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await this.emailQueue.add(
        'send-email',
        { to: user.email, subject: title, body: content },
        { removeOnComplete: true },
      );
    }

    return notif;
  }

  /** Get user's notifications */
  async getUserNotifications(userId: number, page = 1, pageSize = 20) {
    const [list, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);
    return { list, total, page, pageSize };
  }

  /** Mark notification as read */
  async markRead(id: number) {
    await this.prisma.notification.update({ where: { id }, data: { isRead: true } });
    return { message: '已标记为已读' };
  }
}
