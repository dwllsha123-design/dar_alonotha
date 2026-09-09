import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { DeliveryStatus, DeliveryType } from '@prisma/client';
export class CreateDeliveryCompanyDto {
  @IsString()
  nameAr!: string;

  @IsOptional()
  @IsString()
  nameEn?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  apiUrl?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;
}

export class AssignDeliveryDto {
  @IsString()
  orderId!: string;

  @IsOptional()
  @IsEnum(DeliveryType)
  type?: DeliveryType;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fee?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDeliveryStatusDto {
  @IsEnum(DeliveryStatus)
  status!: DeliveryStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  trackingNumber?: string;
}

export class BulkSlipsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  orderIds?: string[];

  @IsOptional()
  @IsString()
  facebookPageId?: string;
}

export class UpsertDeliveryZoneDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsString()
  area!: string;

  @IsNumber()
  @Min(0)
  maleFee!: number;

  @IsNumber()
  @Min(0)
  femaleFee!: number;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  maleEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  femaleEnabled?: boolean;
}

export class UpdateDeliveryZoneDto {
  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maleFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  femaleFee?: number;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  maleEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  femaleEnabled?: boolean;
}
