import { Type } from 'class-transformer';
import { IsOptional, IsInt, Min, Max } from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;

  @IsOptional()
  sort?: string = 'createdAt';

  @IsOptional()
  order?: 'asc' | 'desc' = 'desc';
}

export interface PaginatedResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function paginatedResponse<T>(list: T[], total: number, page: number, pageSize: number): PaginatedResult<T> {
  return { list, total, page, pageSize };
}
