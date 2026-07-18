import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'admin@ecom.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'adminuser' })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  username: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  @MaxLength(50)
  password: string;

  @ApiPropertyOptional({ example: 'https://avatar.example.com/default.png' })
  @IsOptional()
  @IsString()
  avatar?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'newuser' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  username?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

export class QueryUserDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  pageSize?: number = 10;

  @ApiPropertyOptional({ example: 'admin' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  isActive?: boolean;
}
