import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, IsIn, IsNumber, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCouponDto {
  @ApiProperty({ example: '满100减20' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'SUMMER20' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'fixed', enum: ['fixed', 'percentage'] })
  @IsIn(['fixed', 'percentage'])
  type: string;

  @ApiProperty({ example: 20 })
  @IsNumber()
  @Min(0)
  value: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(1)
  totalCount: number;

  @ApiProperty({ example: '2026-07-01T00:00:00Z' })
  @IsDateString()
  startAt: string;

  @ApiProperty({ example: '2026-12-31T23:59:59Z' })
  @IsDateString()
  endAt: string;
}

export class UpdateCouponDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  isActive?: boolean;
}

export class IssueCouponDto {
  @ApiProperty({ example: [1, 2] })
  @IsInt({ each: true })
  userIds: number[];
}
