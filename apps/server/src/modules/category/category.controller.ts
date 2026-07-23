import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto, QueryCategoryDto } from './dto/category.dto';

@ApiTags('Category')
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建分类' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoryService.create(dto);
  }

  @Public()
  @Get('tree')
  @ApiOperation({ summary: '获取分类树 — 公开' })
  findTree() {
    return this.categoryService.findTree();
  }

  @Public()
  @Get()
  @ApiOperation({ summary: '分类列表（分页）— 公开' })
  findAll(@Query() query: QueryCategoryDto) {
    return this.categoryService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: '分类详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoryService.findById(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新分类' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) {
    return this.categoryService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除分类（软删除）' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoryService.remove(id);
  }
}
