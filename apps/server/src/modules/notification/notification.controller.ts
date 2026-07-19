import { Controller, Get, Post, Body, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Notification')
@Controller('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Post('test')
  @ApiOperation({ summary: '发送测试通知' })
  testNotify(@Req() req: any, @Body() dto: { title: string; content: string }) {
    return this.notificationService.notify(req.user.userId, dto.title, dto.content);
  }

  @Get()
  @ApiOperation({ summary: '我的通知列表' })
  myNotifications(@Req() req: any, @Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.notificationService.getUserNotifications(req.user.userId, page, pageSize);
  }

  @Post(':id/read')
  @ApiOperation({ summary: '标记通知为已读' })
  markRead(@Param('id', ParseIntPipe) id: number) {
    return this.notificationService.markRead(id);
  }
}
