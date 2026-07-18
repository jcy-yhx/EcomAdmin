import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, IsArray, IsNumber, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSkuDto {
  @ApiProperty({ example: 'IPHONE15-BLACK-128G' })
  @IsString()
  skuCode: string;

  @ApiProperty({ example: 6999.0 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(0)
  stock: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({
    example: [
      [1, 3],
      [2, 5],
    ],
    description: '[[specId, specValueId], ...]',
  })
  @IsOptional()
  @IsArray()
  specIds?: number[][];
}

export class CreateProductDto {
  @ApiProperty({ example: 'iPhone 15 Pro' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'iphone-15-pro' })
  @IsString()
  slug: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'on_sale' })
  @IsOptional()
  @IsIn(['draft', 'on_sale', 'off_sale'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  brandId?: number;

  @ApiPropertyOptional({ type: [CreateSkuDto] })
  @IsOptional()
  @IsArray()
  @Type(() => CreateSkuDto)
  skus?: CreateSkuDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['draft', 'on_sale', 'off_sale'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  brandId?: number;

  @ApiPropertyOptional({ type: [CreateSkuDto] })
  @IsOptional()
  @IsArray()
  @Type(() => CreateSkuDto)
  skus?: CreateSkuDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}

export class QueryProductDto {
  @IsOptional()
  page?: number = 1;

  @IsOptional()
  pageSize?: number = 10;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  brandId?: number;
}
