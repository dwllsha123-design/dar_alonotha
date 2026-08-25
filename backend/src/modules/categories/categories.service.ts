import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

  private async ensureUniqueSlug(slug: string, excludeId?: string) {
    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException('رابط التصنيف (slug) مستخدم مسبقاً');
    }
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

    const slug = slugify(dto.slug?.trim() || dto.nameEn?.trim() || nameAr);
    await this.ensureUniqueSlug(slug);
    const parentId = await this.ensureParent(dto.parentId);

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

    if (dto.slug !== undefined) {
      const slug = slugify(dto.slug);
      await this.ensureUniqueSlug(slug, id);
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
        slug: dto.slug === undefined ? undefined : slugify(dto.slug),
        parentId,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
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
