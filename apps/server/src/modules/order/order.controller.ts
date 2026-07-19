import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { CreateOrderDto, QueryOrderDto, UpdateOrderStatusDto } from './dto/order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@ApiTags('Order')
@Controller('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  @ApiOperation({ summary: '从购物车创建订单（事务：创建+扣库存+清购物车）' })
  create(@Req() req: Request & any, @Body() dto: CreateOrderDto) {
    return this.orderService.create(req.user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: '订单列表（分页+筛选+搜索）' })
  findAll(@Query() query: QueryOrderDto) {
    return this.orderService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '订单详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.findById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '更新订单状态（状态机校验）' })
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrderStatusDto) {
    return this.orderService.updateStatus(id, dto.status);
  }
}
