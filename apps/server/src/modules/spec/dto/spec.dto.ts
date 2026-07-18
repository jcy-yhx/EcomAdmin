import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsArray, IsInt } from 'class-validator';

export class CreateSpecDto {
  @ApiProperty({ example: '颜色' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: ['红色', '蓝色', '黑色'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  values?: string[];

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateSpecDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: ['红色', '蓝色'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  values?: string[];
}
