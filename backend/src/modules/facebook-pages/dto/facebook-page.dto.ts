import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { FacebookPageStatus, PageMemberRole } from '@prisma/client';

export class CreateFacebookPageDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  publicCode?: number;

  @IsOptional()
  @IsString()
  pageId?: string;

  /** اسم تعريفي داخلي — يُدمج في الملاحظات إن وُجد */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  internalLabel?: string;

  /** رابط صفحة فيسبوك اختياري — يُدمج في الملاحظات */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  facebookUrl?: string;

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFacebookPageDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  pageId?: string;

  @IsOptional()
  @IsEnum(FacebookPageStatus)
  status?: FacebookPageStatus;

  @IsOptional()
  @IsString()
  managerId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpsertShippingAccountDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  pageIdentifier?: string;

  /** Required when creating a new account; optional when updating / linking. */
  @IsOptional()
  @IsString()
  apiToken?: string;

  /** Copy credentials from an existing account (same provider config). */
  @IsOptional()
  @IsString()
  sourceAccountId?: string;

  @IsOptional()
  @IsString()
  endpoint?: string;

  @IsOptional()
  @IsString()
  senderZoneId?: string;

  @IsOptional()
  @IsString()
  senderSubzoneId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Select existing Al-Meyar account for a page, or clear (`shippingAccountId: null`). */
export class LinkShippingAccountDto {
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  shippingAccountId?: string | null;
}

export class AssignMemberDto {
  @IsString()
  userId!: string;

  @IsEnum(PageMemberRole)
  role!: PageMemberRole;

  @IsOptional()
  @IsInt()
  @Min(1)
  agentCode?: number;
}

export class AssignEmployeesDto {
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];
}

export class SetPageCredentialsDto {
  @IsString()
  @MaxLength(32)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class CreatePageStaffDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsEnum(PageMemberRole)
  role!: PageMemberRole;

  @IsOptional()
  @IsEnum(['NONE', 'SALARY', 'COMMISSION'] as const)
  employmentType?: 'NONE' | 'SALARY' | 'COMMISSION';

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlySalary?: number;

  /** عمولة ثابتة للقطعة لهذه الصفحة (LYD) — تُنشئ/تحدّث CommissionRule */
  @IsOptional()
  @IsNumber()
  @Min(0)
  commissionPerPiece?: number;
}

export class UpdateMemberEmploymentDto {
  @IsOptional()
  @IsEnum(PageMemberRole)
  role?: PageMemberRole;

  @IsOptional()
  @IsEnum(['NONE', 'SALARY', 'COMMISSION'] as const)
  employmentType?: 'NONE' | 'SALARY' | 'COMMISSION';

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlySalary?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  commissionPerPiece?: number;
}
