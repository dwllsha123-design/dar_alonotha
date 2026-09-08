import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PromoDiscountType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { patchOptionalImageUrl } from '../../common/patch-semantics';
import { uploadDir, uploadPublicPrefix } from '../../common/upload-paths';
import { UpsertBannerDto, UpsertPromoDto, UpdateBannerDto, UpdatePromoDto } from './marketing.dto';
import { saveUploadAsWebp, type UploadedImageFile } from '../../common/image-upload';

@Injectable()
export class MarketingService {
  constructor(private readonly prisma: PrismaService) {}

  listPromos() {
    return this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createPromo(user: AuthUser, dto: UpsertPromoDto) {
    const code = dto.code.trim().toUpperCase();
    if (!code) throw new BadRequestException('أدخل كود الخصم');
    const created = await this.prisma.promoCode.create({
      data: {
        code,
        nameAr: dto.nameAr,
        type: dto.type as PromoDiscountType,
        value: dto.value,
        minOrder: dto.minOrder ?? 0,
        maxUses: dto.maxUses ?? null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        active: dto.active ?? true,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'promo.create',
        entityType: 'PromoCode',
        entityId: created.id,
        meta: { code },
      },
    });
    return created;
  }

  async updatePromo(user: AuthUser, id: string, dto: UpdatePromoDto) {
    await this.prisma.promoCode.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new NotFoundException('كود الخصم غير موجود');
    });
    const updated = await this.prisma.promoCode.update({
      where: { id },
      data: {
        code: dto.code?.trim().toUpperCase(),
        nameAr: dto.nameAr,
        type: dto.type as PromoDiscountType | undefined,
        value: dto.value,
        minOrder: dto.minOrder,
        maxUses: dto.maxUses === undefined ? undefined : dto.maxUses,
        startsAt:
          dto.startsAt === undefined
            ? undefined
            : dto.startsAt
              ? new Date(dto.startsAt)
              : null,
        endsAt:
          dto.endsAt === undefined
            ? undefined
            : dto.endsAt
              ? new Date(dto.endsAt)
              : null,
        active: dto.active,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'promo.update',
        entityType: 'PromoCode',
        entityId: id,
      },
    });
    return updated;
  }

  listBannersAdmin() {
    return this.prisma.banner.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
  }

  activeBanners() {
    const now = new Date();
    return this.prisma.banner.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async createBanner(user: AuthUser, dto: UpsertBannerDto) {
    const placement = dto.placement === 'HERO' ? 'HERO' : 'PROMO';
    const created = await this.prisma.banner.create({
      data: {
        title: (dto.title || '').trim() || (placement === 'HERO' ? 'شريحة الرئيسية' : 'لافتة'),
        subtitle: dto.subtitle,
        imageUrl: dto.imageUrl,
        linkUrl: dto.linkUrl,
        placement,
        imageFit: dto.imageFit === 'contain' ? 'contain' : 'cover',
        imageZoom: dto.imageZoom ?? 100,
        imagePosX: dto.imagePosX ?? 50,
        imagePosY: dto.imagePosY ?? 50,
        sortOrder: dto.sortOrder ?? 0,
        active: dto.active ?? true,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'banner.create',
        entityType: 'Banner',
        entityId: created.id,
      },
    });
    return created;
  }

  async updateBanner(user: AuthUser, id: string, dto: UpdateBannerDto) {
    const updated = await this.prisma.banner.update({
      where: { id },
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        imageUrl: patchOptionalImageUrl(dto.imageUrl),
        linkUrl: dto.linkUrl === undefined ? undefined : dto.linkUrl?.trim() || null,
        placement: dto.placement,
        imageFit: dto.imageFit,
        imageZoom: dto.imageZoom,
        imagePosX: dto.imagePosX,
        imagePosY: dto.imagePosY,
        sortOrder: dto.sortOrder,
        active: dto.active,
        startsAt:
          dto.startsAt === undefined
            ? undefined
            : dto.startsAt
              ? new Date(dto.startsAt)
              : null,
        endsAt:
          dto.endsAt === undefined
            ? undefined
            : dto.endsAt
              ? new Date(dto.endsAt)
              : null,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'banner.update',
        entityType: 'Banner',
        entityId: id,
      },
    });
    return updated;
  }

  async uploadBannerImage(id: string, file: UploadedImageFile) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException('اللافتة غير موجودة');
    const dir = uploadDir('banners');
    const saved = await saveUploadAsWebp(file, dir, uploadPublicPrefix('banners'));
    return this.prisma.banner.update({
      where: { id },
      data: { imageUrl: saved.url },
    });
  }

  async deleteBanner(user: AuthUser, id: string) {
    await this.prisma.banner.findUniqueOrThrow({ where: { id } }).catch(() => {
      throw new NotFoundException('اللافتة غير موجودة');
    });
    await this.prisma.banner.delete({ where: { id } });
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'banner.delete',
        entityType: 'Banner',
        entityId: id,
      },
    });
    return { ok: true };
  }

  async validatePromo(code: string, subtotal: number) {
    const promo = await this.prisma.promoCode.findFirst({
      where: { code: code.trim().toUpperCase(), active: true },
    });
    if (!promo) throw new BadRequestException('كود الخصم غير صالح');
    const now = new Date();
    if (promo.startsAt && promo.startsAt > now) {
      throw new BadRequestException('كود الخصم لم يبدأ بعد');
    }
    if (promo.endsAt && promo.endsAt < now) {
      throw new BadRequestException('كود الخصم منتهي');
    }
    if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
      throw new BadRequestException('تم استنفاد استخدامات كود الخصم');
    }
    if (subtotal < Number(promo.minOrder || 0)) {
      throw new BadRequestException(`الحد الأدنى للطلب ${promo.minOrder} د.ل`);
    }
    const discount =
      promo.type === 'PERCENT'
        ? Math.min(subtotal, (subtotal * Number(promo.value)) / 100)
        : Math.min(subtotal, Number(promo.value));
    return {
      code: promo.code,
      type: promo.type,
      value: Number(promo.value),
      discount,
      minOrder: Number(promo.minOrder),
    };
  }
}
