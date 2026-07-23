import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { BrandService } from './brand.service';
import { CreateBrandDto, UpdateBrandDto } from './dto/brand.dto';

@ApiTags('Brand')
@Controller('brands')
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建品牌' })
  create(@Body() dto: CreateBrandDto) {
    return this.brandService.create(dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: '品牌列表 — 公开' })
  findAll(@Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.brandService.findAll(page, pageSize);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: '品牌详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.brandService.findById(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新品牌' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBrandDto) {
    return this.brandService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除品牌' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.brandService.remove(id);
  }
}
