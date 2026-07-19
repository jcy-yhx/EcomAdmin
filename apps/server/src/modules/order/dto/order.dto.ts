import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, IsIn, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderAddressDto {
  @ApiProperty({ example: '张三' })
  @IsString()
  @IsNotEmpty()
  receiverName: string;

  @ApiProperty({ example: '13800138000' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: '广东省' })
  @IsString()
  @IsNotEmpty()
  province: string;

  @ApiProperty({ example: '深圳市' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiPropertyOptional({ example: '南山区' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiProperty({ example: '科技园路1号创新大厦A座1201室' })
  @IsString()
  @IsNotEmpty()
  detail: string;

  @ApiPropertyOptional({ example: '518000' })
  @IsOptional()
  @IsString()
  zipCode?: string;
}

export class CreateOrderDto {
  @ApiProperty()
  @ValidateNested()
  @Type(() => CreateOrderAddressDto)
  address: CreateOrderAddressDto;

  @ApiPropertyOptional({ example: '请尽快发货' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class QueryOrderDto {
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  pageSize?: number = 10;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ example: 'paid' })
  @IsIn(['paid', 'shipped', 'completed', 'cancelled', 'refunding', 'refunded'])
  @IsString()
  status: string;
}
