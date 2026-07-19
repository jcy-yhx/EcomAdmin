import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CouponService } from './coupon.service';
import { CreateCouponDto, UpdateCouponDto, IssueCouponDto } from './dto/coupon.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Coupon')
@Controller('coupons')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建优惠券' })
  create(@Body() dto: CreateCouponDto) {
    return this.couponService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '优惠券列表' })
  findAll(@Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.couponService.findAll(page, pageSize);
  }

  @Get('mine')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '我的优惠券' })
  myCoupons(@Req() req: any) {
    return this.couponService.getUserCoupons(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: '优惠券详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.couponService.findById(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新优惠券' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCouponDto) {
    return this.couponService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除优惠券' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.couponService.remove(id);
  }

  @Post(':id/issue')
  @ApiBearerAuth()
  @ApiOperation({ summary: '发放优惠券给用户' })
  issue(@Param('id', ParseIntPipe) id: number, @Body() dto: IssueCouponDto) {
    return this.couponService.issue(id, dto);
  }
}
