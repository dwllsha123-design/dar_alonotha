import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { SalaryPaymentStatus, UserStatus } from '@prisma/client';
import { EmploymentType } from '@prisma/client';

export class CreateSalaryPaymentDto {
  @IsString()
  userId!: string;

  @IsInt()
  @Min(2020)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSalaryPaymentStatusDto {
  @IsEnum(SalaryPaymentStatus)
  status!: SalaryPaymentStatus;
}
