import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class StockInDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  skuId: number;

  @ApiProperty({ example: 50 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: '供应商补货' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class DeductDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  skuId: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}
