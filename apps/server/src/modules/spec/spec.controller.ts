import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SpecService } from './spec.service';
import { CreateSpecDto, UpdateSpecDto } from './dto/spec.dto';

@ApiTags('Spec')
@Controller('specs')
export class SpecController {
  constructor(private readonly specService: SpecService) {}

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建规格' })
  create(@Body() dto: CreateSpecDto) {
    return this.specService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '规格列表（含规格值）' })
  findAll() {
    return this.specService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: '规格详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.specService.findById(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新规格' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSpecDto) {
    return this.specService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除规格' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.specService.remove(id);
  }
}
