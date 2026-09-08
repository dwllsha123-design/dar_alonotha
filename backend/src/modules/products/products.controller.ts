import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { join } from 'path';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { imageUploadOptions, type UploadedImageFile } from '../../common/image-upload';
import { videoUploadOptions, type UploadedVideoFile } from '../../common/video-upload';
import { ProductsService } from './products.service';
import {
  AddProductImageDto,
  CreateProductDto,
  CreateVariantDto,
  UpdateProductDto,
  ApplyDiscountDto,
  ReorderColorMediaDto,
} from './dto/product.dto';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { PERMISSIONS } from '../../common/permissions';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  findAll(@CurrentUser() user: AuthUser, @Query('q') q?: string) {
    return this.productsService.findAll(user, q);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.findOne(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCTS_CREATE)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.productsService.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_EDIT)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_EDIT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.productsService.remove(user, id);
  }

  @Post(':id/discount')
  @RequirePermissions(PERMISSIONS.PRODUCTS_EDIT)
  applyDiscount(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ApplyDiscountDto,
  ) {
    return this.productsService.applyDiscount(user, id, dto.percent);
  }

  @Post(':id/variants')
  @RequirePermissions(PERMISSIONS.PRODUCTS_EDIT)
  addVariant(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.productsService.addVariant(user, id, dto);
  }

  @Post(':id/images')
  @RequirePermissions(PERMISSIONS.PRODUCTS_EDIT)
  addImage(@Param('id') id: string, @Body() dto: AddProductImageDto) {
    return this.productsService.addImage(id, dto.url, dto.isPrimary, dto.color);
  }

  @Post(':id/images/upload')
  @RequirePermissions(PERMISSIONS.PRODUCTS_EDIT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor(
      'file',
      imageUploadOptions(join(process.cwd(), 'uploads', 'products')),
    ),
  )
  uploadImage(
    @Param('id') id: string,
    @Query('color') color?: string,
    @UploadedFile()
    file?: UploadedImageFile,
  ) {
    if (!file?.filename && !file?.buffer && !file?.path) {
      throw new BadRequestException('اختاري صورة للرفع');
    }
    return this.productsService.uploadImage(id, file, color);
  }

  @Delete(':id/images/:imageId')
  @RequirePermissions(PERMISSIONS.PRODUCTS_EDIT)
  removeImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.productsService.removeImage(id, imageId);
  }

  /** NEW additive color media (does not touch ProductImage). */
  @Post(':id/color-media/images/upload')
  @RequirePermissions(PERMISSIONS.PRODUCTS_EDIT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor(
      'file',
      imageUploadOptions(join(process.cwd(), 'uploads', 'products', 'color-media')),
    ),
  )
  uploadColorMediaImage(
    @Param('id') id: string,
    @Query('color') color: string,
    @UploadedFile() file?: UploadedImageFile,
  ) {
    if (!file?.filename && !file?.buffer && !file?.path) {
      throw new BadRequestException('اختاري صورة للرفع');
    }
    return this.productsService.uploadColorMediaImage(id, color, file);
  }

  @Post(':id/color-media/videos/upload')
  @RequirePermissions(PERMISSIONS.PRODUCTS_EDIT)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor(
      'file',
      videoUploadOptions(
        join(process.cwd(), 'uploads', 'products', 'color-media', 'videos'),
      ),
    ),
  )
  uploadColorMediaVideo(
    @Param('id') id: string,
    @Query('color') color: string,
    @Query('durationMs') durationMs?: string,
    @Query('replace') replace?: string,
    @UploadedFile() file?: UploadedVideoFile,
  ) {
    if (!file?.filename && !file?.buffer && !file?.path) {
      throw new BadRequestException('اختاري فيديو للرفع');
    }
    const claimed = durationMs ? Number(durationMs) : undefined;
    const doReplace = replace === '1' || replace === 'true';
    return this.productsService.uploadColorMediaVideo(
      id,
      color,
      file,
      claimed,
      doReplace,
    );
  }

  @Patch(':id/color-media/reorder')
  @RequirePermissions(PERMISSIONS.PRODUCTS_EDIT)
  reorderColorMedia(@Param('id') id: string, @Body() dto: ReorderColorMediaDto) {
    return this.productsService.reorderColorMedia(id, dto.color, dto.orderedIds);
  }

  @Delete(':id/color-media/:mediaId')
  @RequirePermissions(PERMISSIONS.PRODUCTS_EDIT)
  removeColorMedia(@Param('id') id: string, @Param('mediaId') mediaId: string) {
    return this.productsService.removeColorMedia(id, mediaId);
  }
}
