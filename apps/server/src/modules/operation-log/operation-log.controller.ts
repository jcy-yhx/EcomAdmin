import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Operation Log')
@Controller('operation-logs')
@ApiBearerAuth()
export class OperationLogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: '操作日志列表' })
  async findAll(@Query('page') page = 1, @Query('pageSize') pageSize = 20) {
    const [list, total] = await Promise.all([
      this.prisma.operationLog.findMany({
        skip: (+page - 1) * +pageSize,
        take: +pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.operationLog.count(),
    ]);
    return { list, total, page, pageSize };
  }
}
