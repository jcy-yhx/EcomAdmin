import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CartService } from './cart.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';

@ApiTags('Cart')
@Controller('cart')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @ApiOperation({ summary: '查看购物车' })
  getCart(@Req() req: Request & any) {
    return this.cartService.getCart(req.user.userId);
  }

  @Post()
  @ApiOperation({ summary: '添加商品到购物车' })
  addItem(@Req() req: Request & any, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(req.user.userId, dto.skuId, dto.quantity);
  }

  @Patch(':skuId')
  @ApiOperation({ summary: '更新购物车商品数量' })
  updateItem(@Req() req: Request & any, @Param('skuId', ParseIntPipe) skuId: number, @Body() dto: UpdateCartItemDto) {
    return this.cartService.updateItem(req.user.userId, skuId, dto.quantity);
  }

  @Delete(':skuId')
  @ApiOperation({ summary: '从购物车移除商品' })
  removeItem(@Req() req: Request & any, @Param('skuId', ParseIntPipe) skuId: number) {
    return this.cartService.removeItem(req.user.userId, skuId);
  }
}
