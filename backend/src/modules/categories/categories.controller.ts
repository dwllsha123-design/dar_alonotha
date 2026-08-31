import {
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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { join } from 'path';
import {
  imageUploadOptions,
  type UploadedImageFile,
} from '../../common/image-upload';
import { RequirePermissions } from '../../common/decorators/auth.decorators';
import { PERMISSIONS } from '../../common/permissions';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@ApiTags('Categories')
@ApiBearerAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  findAll() {
    return this.categoriesService.findAll();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_VIEW)
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCTS_CREATE)
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_EDIT)
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(id, dto);
  }

  @Post(':id/image')
  @RequirePermissions(PERMISSIONS.PRODUCTS_EDIT)
  @UseInterceptors(
    FileInterceptor(
      'file',
      imageUploadOptions(join(process.cwd(), 'uploads', 'categories')),
    ),
  )
  uploadImage(
    @Param('id') id: string,
    @UploadedFile()
    file: UploadedImageFile,
  ) {
    return this.categoriesService.uploadImage(id, file);
  }

  @Delete(':id/image')
  @RequirePermissions(PERMISSIONS.PRODUCTS_EDIT)
  clearImage(@Param('id') id: string) {
    return this.categoriesService.clearImage(id);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PRODUCTS_EDIT)
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
