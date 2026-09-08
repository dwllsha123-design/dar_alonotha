import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { imageUploadOptions, type UploadedImageFile } from '../../common/image-upload';
import { uploadDir } from '../../common/upload-paths';
import {
  MarketingService,
} from './marketing.service';
import { UpsertBannerDto, UpsertPromoDto, UpdateBannerDto, UpdatePromoDto } from './marketing.dto';
import {
  Public,
  RequirePermissions,
} from '../../common/decorators/auth.decorators';
import { PERMISSIONS } from '../../common/permissions';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

class ValidatePromoDto {
  @IsString()
  code!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  subtotal?: number;
}

@ApiTags('Marketing')
@Controller()
export class MarketingController {
  constructor(private readonly marketing: MarketingService) {}

  @Get('marketing/promos')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.MARKETING_MANAGE)
  listPromos() {
    return this.marketing.listPromos();
  }

  @Post('marketing/promos')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.MARKETING_MANAGE)
  createPromo(@CurrentUser() user: AuthUser, @Body() dto: UpsertPromoDto) {
    return this.marketing.createPromo(user, dto);
  }

  @Patch('marketing/promos/:id')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.MARKETING_MANAGE)
  updatePromo(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePromoDto,
  ) {
    return this.marketing.updatePromo(user, id, dto);
  }

  @Get('marketing/banners')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.MARKETING_MANAGE)
  listBanners() {
    return this.marketing.listBannersAdmin();
  }

  @Post('marketing/banners')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.MARKETING_MANAGE)
  createBanner(@CurrentUser() user: AuthUser, @Body() dto: UpsertBannerDto) {
    return this.marketing.createBanner(user, dto);
  }

  @Patch('marketing/banners/:id')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.MARKETING_MANAGE)
  updateBanner(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBannerDto,
  ) {
    return this.marketing.updateBanner(user, id, dto);
  }

  @Post('marketing/banners/:id/image')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.MARKETING_MANAGE)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor(
      'file',
      imageUploadOptions(uploadDir('banners')),
    ),
  )
  uploadBannerImage(
    @Param('id') id: string,
    @UploadedFile()
    file?: UploadedImageFile,
  ) {
    if (!file?.filename && !file?.path && !file?.buffer) {
      throw new BadRequestException('اختاري صورة للرفع');
    }
    return this.marketing.uploadBannerImage(id, file);
  }

  @Delete('marketing/banners/:id')
  @ApiBearerAuth()
  @RequirePermissions(PERMISSIONS.MARKETING_MANAGE)
  deleteBanner(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.marketing.deleteBanner(user, id);
  }

  @Public()
  @Get('store/banners')
  storeBanners() {
    return this.marketing.activeBanners();
  }

  @Public()
  @Post('store/promo/validate')
  validate(@Body() dto: ValidatePromoDto) {
    return this.marketing.validatePromo(dto.code, dto.subtotal ?? 0);
  }
}
