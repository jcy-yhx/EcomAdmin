import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class AddCartItemDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  skuId: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  quantity: number;
}
