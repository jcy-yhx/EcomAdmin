import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ProductService } from './product.service';
import { CreateProductDto, UpdateProductDto, QueryProductDto } from './dto/product.dto';

@ApiTags('Product')
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建商品（含 SKU + 图片）' })
  create(@Body() dto: CreateProductDto) {
    return this.productService.create(dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: '商品列表（分页+筛选+搜索）— 公开' })
  findAll(@Query() query: QueryProductDto) {
    return this.productService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: '商品详情（含 SKU 规格、图片）— 公开' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productService.findById(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新商品' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.productService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除商品（软删除）' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productService.remove(id);
  }
}
