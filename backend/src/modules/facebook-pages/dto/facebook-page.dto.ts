import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
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

  @IsString()
  apiToken!: string;

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
