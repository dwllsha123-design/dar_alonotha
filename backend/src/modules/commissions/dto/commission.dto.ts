import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCommissionRuleDto {
  @IsString()
  nameAr!: string;

  @IsOptional()
  @IsString()
  type?: 'PERCENT' | 'FIXED' | 'PER_ITEM';

  @IsOptional()
  @IsNumber()
  @Min(0)
  ratePercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedAmount?: number;

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsString()
  agentUserId?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCommissionStatusDto {
  @IsString()
  status!: 'APPROVED' | 'PAID' | 'CANCELLED';
}
