import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { join } from 'path';
import {
  saveUploadAsWebp,
  type UploadedImageFile,
} from '../../common/image-upload';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w\u0600-\u06FF-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || `cat-${Date.now().toString(36)}`;
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
      include: {
        parent: { select: { id: true, nameAr: true, slug: true } },
        _count: { select: { products: true, children: true } },
      },
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.category.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, nameAr: true, slug: true } },
        children: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, nameAr: true, slug: true, isActive: true },
        },
        _count: { select: { products: true } },
      },
    });
    if (!row) throw new NotFoundException('التصنيف غير موجود');
    return row;
  }

  /** Always returns a free slug — never blocks the admin on duplicates. */
  private async allocateUniqueSlug(base: string, excludeId?: string) {
    const root = slugify(base);
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? root : `${root}-${i + 1}`;
      const existing = await this.prisma.category.findUnique({
        where: { slug: candidate },
      });
      if (!existing || existing.id === excludeId) return candidate;
    }
    return `${root}-${Date.now().toString(36)}`;
  }

  private async ensureParent(parentId?: string | null, selfId?: string) {
    if (!parentId) return null;
    if (selfId && parentId === selfId) {
      throw new BadRequestException('لا يمكن جعل التصنيف أباً لنفسه');
    }
    const parent = await this.prisma.category.findUnique({
      where: { id: parentId },
    });
    if (!parent) throw new BadRequestException('الفئة الأب غير موجودة');
    if (parent.parentId) {
      throw new BadRequestException('يُسمح بمستويين فقط: فئة ثم تصنيفات فرعية');
    }
    return parentId;
  }

  async create(dto: CreateCategoryDto) {
    const nameAr = dto.nameAr.trim();
    if (!nameAr) throw new BadRequestException('اسم التصنيف مطلوب');

    const parentId = await this.ensureParent(dto.parentId);
    let slugBase = dto.slug?.trim() || dto.nameEn?.trim() || nameAr;
    // Child slugs are scoped to the parent so the same name
    // (e.g. مقاس كبير) can exist under every category.
    if (parentId && !dto.slug?.trim()) {
      const parent = await this.prisma.category.findUnique({
        where: { id: parentId },
        select: { slug: true },
      });
      const parentKey = parent?.slug || parentId.slice(-8);
      slugBase = `${parentKey}-${slugBase}`;
    }
    const slug = await this.allocateUniqueSlug(slugBase);

    const maxSort = await this.prisma.category.aggregate({
      _max: { sortOrder: true },
      where: parentId ? { parentId } : { parentId: null },
    });

    return this.prisma.category.create({
      data: {
        nameAr,
        nameEn: dto.nameEn?.trim() || null,
        slug,
        parentId,
        imageUrl: dto.imageUrl?.trim() || null,
        sortOrder: dto.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
        isActive: dto.isActive ?? true,
      },
      include: {
        parent: { select: { id: true, nameAr: true, slug: true } },
        _count: { select: { products: true, children: true } },
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);

    let nextSlug: string | undefined;
    if (dto.slug !== undefined) {
      nextSlug = await this.allocateUniqueSlug(dto.slug, id);
    }

    let parentId: string | null | undefined = undefined;
    if (dto.parentId !== undefined) {
      parentId = await this.ensureParent(dto.parentId, id);
      const childCount = await this.prisma.category.count({
        where: { parentId: id },
      });
      if (parentId && childCount > 0) {
        throw new BadRequestException(
          'لا يمكن جعل فئة لها تصنيفات فرعية تصنيفاً فرعياً',
        );
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        nameAr: dto.nameAr?.trim(),
        nameEn:
          dto.nameEn === undefined
            ? undefined
            : dto.nameEn?.trim() || null,
        slug: nextSlug,
        parentId,
        imageUrl:
          dto.imageUrl === undefined
            ? undefined
            : dto.imageUrl?.trim() || null,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
      include: {
        parent: { select: { id: true, nameAr: true, slug: true } },
        _count: { select: { products: true, children: true } },
      },
    });
  }

  async uploadImage(id: string, file: UploadedImageFile) {
    await this.findOne(id);
    const dir = join(process.cwd(), 'uploads', 'categories');
    const saved = await saveUploadAsWebp(file, dir, '/uploads/categories', {
      width: 1200,
      height: 1500,
      fit: 'cover',
    });
    return this.prisma.category.update({
      where: { id },
      data: { imageUrl: saved.url },
      include: {
        parent: { select: { id: true, nameAr: true, slug: true } },
        _count: { select: { products: true, children: true } },
      },
    });
  }

  async clearImage(id: string) {
    await this.findOne(id);
    return this.prisma.category.update({
      where: { id },
      data: { imageUrl: null },
      include: {
        parent: { select: { id: true, nameAr: true, slug: true } },
        _count: { select: { products: true, children: true } },
      },
    });
  }

  async remove(id: string) {
    const row = await this.findOne(id);
    if (row._count.products > 0) {
      throw new BadRequestException(
        'لا يمكن حذف تصنيف مرتبط بمنتجات — أزيلي الربط أو عطّلي التصنيف',
      );
    }
    const children = await this.prisma.category.count({
      where: { parentId: id },
    });
    if (children > 0) {
      throw new BadRequestException(
        'احذفي التصنيفات الفرعية أولاً أو انقليها لفئة أخرى',
      );
    }
    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }
}
