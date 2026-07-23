import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto/user.dto';
import { Request } from 'express';

@ApiTags('User')
@Controller('users')
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @ApiOperation({ summary: '创建用户（注册）' })
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '用户列表（分页+搜索）' })
  findAll(@Query() query: QueryUserDto) {
    return this.userService.findAll(query);
  }

  @Get('roles/list')
  @ApiOperation({ summary: '获取所有角色列表（用于下拉选择）' })
  listRoles() {
    return this.userService.listRoles();
  }

  @Get(':id')
  @ApiOperation({ summary: '用户详情（含角色与权限）' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新用户（不可修改同级或上级用户）' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @Req() req: Request & { user: { userId: number } },
  ) {
    return this.userService.update(id, dto, req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: '软删除用户（不可删除同级或上级用户）' })
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: Request & { user: { userId: number } }) {
    return this.userService.remove(id, req.user.userId);
  }

  @Post(':userId/roles')
  @ApiOperation({ summary: '分配用户角色（不可操作同级或上级用户）' })
  assignRoles(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: { roleIds: number[] },
    @Req() req: Request & { user: { userId: number } },
  ) {
    return this.userService.assignRoles(userId, body.roleIds, req.user.userId);
  }
}
