import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto/user.dto';

@ApiTags('User')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiOperation({ summary: '创建用户（注册）' })
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: '用户列表（分页+搜索）' })
  findAll(@Query() query: QueryUserDto) {
    return this.userService.findAll(query);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '用户详情（含角色与权限）' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findById(id);
  }

  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新用户' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '软删除用户' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.userService.remove(id);
  }

  @Post(':userId/roles')
  @ApiBearerAuth()
  @ApiOperation({ summary: '分配用户角色' })
  assignRoles(@Param('userId', ParseIntPipe) userId: number, @Body() body: { roleIds: number[] }) {
    return this.userService.assignRoles(userId, body.roleIds);
  }
}
