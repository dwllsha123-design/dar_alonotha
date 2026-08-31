import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto, CreateVariantDto, UpdateProductDto } from './dto/product.dto';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { sanitizePrices, canViewWholesalePrices, canViewCostPrices } from '../../common/pricing/price-policy';
import { CentralInventoryService } from '../inventory/services/central-inventory.service';
import { CodeSequenceService } from '../inventory/services/code-sequence.service';
import { saveUploadAsWebp, PRODUCT_IMAGE_SIZE, type UploadedImageFile } from '../../common/image-upload';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: CentralInventoryService,
    private readonly codes: CodeSequenceService,
  ) {}

  private pricingFields(user: AuthUser, dto: { costPrice?: number; wholesalePrice?: number }) {
    return {
      costPrice: canViewCostPrices(user) ? dto.costPrice : undefined,
      wholesalePrice: canViewWholesalePrices(user) ? dto.wholesalePrice : undefined,
    };
  }

  async findAll(user: AuthUser, search?: string) {
    const products = await this.prisma.product.findMany({
      where: search
        ? {
            OR: [
              { nameAr: { contains: search } },
              { sku: { contains: search } },
              { brand: { contains: search } },
            ],
          }
        : undefined,
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: {
          where: { isActive: true },
          include: { stockItems: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    const withAvailability = await Promise.all(
      products.map(async (p) => ({
        ...p,
        variants: await Promise.all(
          p.variants.map(async (v) => {
            const { available } = await this.inventory.getAvailability(v.id);
            return {
              ...v,
              available,
              inStock: available > 0,
              retailPrice: Number(v.retailPrice || v.price),
            };
          }),
        ),
      })),
    );

    return sanitizePrices(withAvailability, user);
  }

  async findOne(user: AuthUser, id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { include: { stockItems: true } },
      },
    });
    if (!product) throw new NotFoundException('المنتج غير موجود');

    const variants = await Promise.all(
      product.variants.map(async (v) => {
        const { available } = await this.inventory.getAvailability(v.id);
        return {
          ...v,
          available,
          inStock: available > 0,
          retailPrice: Number(v.retailPrice || v.price),
        };
      }),
    );

    return sanitizePrices({ ...product, variants }, user);
  }

  async create(user: AuthUser, dto: CreateProductDto) {
    const retail = dto.retailPrice ?? dto.basePrice ?? 0;
    const pricing = this.pricingFields(user, dto);
    const baseSku = dto.sku?.trim() || (await this.codes.nextSku());
    const variants = dto.variants?.length
      ? dto.variants
      : [
          {
            sku: baseSku,
            nameAr: dto.nameAr,
            retailPrice: retail,
            costPrice: pricing.costPrice,
            wholesalePrice: pricing.wholesalePrice,
            quantity: 0,
          },
        ];

    const variantRows: Array<{
      sku: string;
      barcode: string;
      nameAr?: string;
      color?: string;
      size?: string;
      imageUrl?: string | null;
      retailPrice: number;
      price: number;
      costPrice?: number;
      wholesalePrice?: number;
      quantity: number;
    }> = [];

    for (let i = 0; i < variants.length; i += 1) {
      const v = variants[i];
      const vRetail = v.retailPrice ?? v.price ?? retail;
      const vPricing = this.pricingFields(user, {
        costPrice: v.costPrice ?? pricing.costPrice,
        wholesalePrice: v.wholesalePrice ?? pricing.wholesalePrice,
      });
      const sku = v.sku?.trim() || (await this.codes.nextSku());
      const barcode =
        v.barcode?.trim() ||
        (await this.uniqueVariantBarcode(sku));
      const imageUrl = v.imageUrl?.trim() || null;
      variantRows.push({
        sku,
        barcode,
        nameAr:
          v.nameAr ||
          [v.color, v.size].filter(Boolean).join(' / ') ||
          dto.nameAr,
        color: v.color,
        size: v.size,
        imageUrl,
        retailPrice: vRetail,
        price: vRetail,
        costPrice: vPricing.costPrice,
        wholesalePrice: vPricing.wholesalePrice,
        quantity: Math.max(0, Number(v.quantity || 0)),
      });
    }

    const genericUrls = (dto.imageUrls || []).map((u) => u.trim()).filter(Boolean);
    const colorImages: Array<{ url: string; color: string }> = [];
    for (const row of variantRows) {
      if (!row.color || !row.imageUrl) continue;
      if (colorImages.some((c) => c.color === row.color)) continue;
      colorImages.push({ url: row.imageUrl, color: row.color });
    }

    const imageCreates = [
      ...genericUrls.map((url, idx) => ({
        url,
        sortOrder: idx,
        isPrimary: idx === 0 && colorImages.length === 0,
        color: null as string | null,
        alt: null as string | null,
      })),
      ...colorImages.map((img, idx) => ({
        url: img.url,
        sortOrder: genericUrls.length + idx,
        isPrimary: genericUrls.length === 0 && idx === 0,
        color: img.color,
        alt: img.color,
      })),
    ];

    const product = await this.prisma.product.create({
      data: {
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        description: dto.description,
        categoryId: dto.categoryId,
        brand: dto.brand,
        sku: baseSku,
        retailPrice: retail,
        basePrice: retail,
        costPrice: pricing.costPrice,
        wholesalePrice: pricing.wholesalePrice,
        isTrackStock: dto.isTrackStock ?? true,
        status: 'ACTIVE',
        variants: {
          create: variantRows.map(({ quantity: _q, ...row }) => row),
        },
        images: imageCreates.length ? { create: imageCreates } : undefined,
      },
      include: { variants: true, images: true, category: true },
    });

    await this.seedVariantStock(user.id, product.variants, variantRows);
    return sanitizePrices(product, user);
  }

  async update(user: AuthUser, id: string, dto: UpdateProductDto) {
    const current = await this.prisma.product.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('المنتج غير موجود');
    const retail = dto.retailPrice ?? dto.basePrice;
    const priceChanged =
      retail !== undefined && Number(retail) !== Number(current.retailPrice);

    await this.prisma.product.update({
      where: { id },
      data: {
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        description: dto.description,
        categoryId:
          dto.categoryId === undefined ? undefined : dto.categoryId || null,
        brand: dto.brand,
        ...(retail !== undefined
          ? {
              retailPrice: retail,
              basePrice: priceChanged ? retail : undefined,
            }
          : {}),
        ...(canViewCostPrices(user) && dto.costPrice !== undefined
          ? { costPrice: dto.costPrice }
          : {}),
        ...(canViewWholesalePrices(user) && dto.wholesalePrice !== undefined
          ? { wholesalePrice: dto.wholesalePrice }
          : {}),
        status: dto.status,
      },
    });

    if (priceChanged && retail !== undefined) {
      const oldRetail = Number(current.retailPrice);
      await this.prisma.productVariant.updateMany({
        where: { productId: id, retailPrice: oldRetail },
        data: { retailPrice: retail, price: retail },
      });
    }

    return this.findOne(user, id);
  }

  async remove(_user: AuthUser, id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: { select: { id: true } } },
    });
    if (!product) throw new NotFoundException('المنتج غير موجود');
    const variantIds = product.variants.map((v) => v.id);

    const [activeReservations, orderItems, transferItems] = await Promise.all([
      variantIds.length
        ? this.prisma.stockReservation.count({
            where: { variantId: { in: variantIds }, status: 'ACTIVE' },
          })
        : 0,
      variantIds.length
        ? this.prisma.orderItem.count({ where: { variantId: { in: variantIds } } })
        : 0,
      variantIds.length
        ? this.prisma.stockTransferItem.count({
            where: { variantId: { in: variantIds } },
          })
        : 0,
    ]);

    if (activeReservations > 0) {
      throw new BadRequestException(
        'لا يمكن الحذف الآن: يوجد حجز مخزون نشط على هذا المنتج',
      );
    }

    if (orderItems > 0 || transferItems > 0) {
      await this.prisma.product.update({
        where: { id },
        data: { status: 'ARCHIVED' },
      });
      return { ok: true, archived: true };
    }

    await this.prisma.$transaction(async (tx) => {
      if (variantIds.length) {
        await tx.stockReservation.deleteMany({
          where: { variantId: { in: variantIds } },
        });
        await tx.stockItem.deleteMany({ where: { variantId: { in: variantIds } } });
      }
      await tx.product.delete({ where: { id } });
    });
    return { ok: true, archived: false };
  }

  async applyDiscount(user: AuthUser, id: string, percent: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: true },
    });
    if (!product) throw new NotFoundException('المنتج غير موجود');
    if (!Number.isFinite(percent) || percent < 0 || percent > 90) {
      throw new BadRequestException('نسبة الخصم بين 0% و 90%');
    }

    const currentRetail = Number(product.retailPrice);
    const currentBase = Number(product.basePrice);
    const original = currentBase > currentRetail ? currentBase : currentRetail;
    if (original <= 0) throw new BadRequestException('حددي سعر المنتج أولاً');

    const roundLyd = (n: number) => Math.max(1, Math.round(n));
    const variantOriginal = (v: { retailPrice: unknown; price: unknown }) => {
      const vRetail = Number(v.retailPrice || v.price || 0);
      if (currentRetail > 0 && currentBase > currentRetail) {
        return roundLyd(vRetail * (original / currentRetail));
      }
      return vRetail;
    };

    if (percent === 0) {
      await this.prisma.$transaction([
        this.prisma.product.update({
          where: { id },
          data: { retailPrice: original, basePrice: original },
        }),
        ...product.variants.map((v) => {
          const restored = variantOriginal(v);
          return this.prisma.productVariant.update({
            where: { id: v.id },
            data: { retailPrice: restored, price: restored },
          });
        }),
      ]);
      return this.findOne(user, id);
    }

    const sale = roundLyd((original * (100 - percent)) / 100);
    if (sale >= original) {
      throw new BadRequestException('السعر بعد الخصم يجب أن يكون أقل من السعر الأصلي');
    }

    await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id },
        data: { basePrice: original, retailPrice: sale },
      }),
      ...product.variants.map((v) => {
        const vSale = roundLyd((variantOriginal(v) * (100 - percent)) / 100);
        return this.prisma.productVariant.update({
          where: { id: v.id },
          data: { retailPrice: vSale, price: vSale },
        });
      }),
    ]);
    return this.findOne(user, id);
  }

  async addVariant(user: AuthUser, productId: string, dto: CreateVariantDto) {
    const product = await this.findOne(user, productId);
    const retail = dto.retailPrice ?? dto.price ?? Number(product.retailPrice || 0);
    const pricing = this.pricingFields(user, dto);
    const sku = dto.sku?.trim() || (await this.codes.nextSku());
    const barcode = dto.barcode?.trim() || (await this.uniqueVariantBarcode(sku));
    let imageUrl = dto.imageUrl?.trim() || null;
    if (!imageUrl && dto.color) {
      const sibling = await this.prisma.productVariant.findFirst({
        where: { productId, color: dto.color, imageUrl: { not: null } },
      });
      const colorImage = await this.prisma.productImage.findFirst({
        where: { productId, color: dto.color },
        orderBy: { sortOrder: 'asc' },
      });
      imageUrl = sibling?.imageUrl || colorImage?.url || null;
    }

    const variant = await this.prisma.productVariant.create({
      data: {
        productId,
        sku,
        barcode,
        nameAr:
          dto.nameAr ||
          [dto.color, dto.size].filter(Boolean).join(' / ') ||
          undefined,
        color: dto.color,
        size: dto.size,
        imageUrl,
        retailPrice: retail,
        price: retail,
        costPrice: pricing.costPrice,
        wholesalePrice: pricing.wholesalePrice,
      },
    });

    if (imageUrl && dto.color) {
      const colorImageCount = await this.prisma.productImage.count({
        where: { productId, color: dto.color },
      });
      if (colorImageCount === 0) {
        await this.addColorGalleryImage(productId, dto.color, imageUrl);
      }
    }

    const qty = Math.max(0, Number(dto.quantity || 0));
    await this.seedVariantStock(user.id, [variant], [{ sku, quantity: qty }]);
    return sanitizePrices(variant, user);
  }

  private async uniqueVariantBarcode(sku: string) {
    const seq = await this.codes.nextCode('variant_barcode', 100000);
    const fromSku = this.codes.variantBarcodeFromParts(sku, seq);
    const clash = await this.prisma.productVariant.findFirst({
      where: { OR: [{ barcode: fromSku }, { sku: fromSku }] },
    });
    if (!clash) return fromSku;
    return `DO-${String(seq).padStart(8, '0')}`;
  }

  private async seedVariantStock(
    actorId: string,
    created: Array<{ id: string; sku: string }>,
    rows: Array<{ sku: string; quantity: number }>,
  ) {
    const warehouseId = await this.inventory.defaultWarehouseId();
    await this.inventory.withTransaction(async (tx) => {
      for (const v of created) {
        await this.inventory.getOrCreateStock(tx, warehouseId, v.id);
        const qty = rows.find((r) => r.sku === v.sku)?.quantity || 0;
        if (qty > 0) {
          await this.inventory.receiveIn({
            tx,
            warehouseId,
            variantId: v.id,
            quantity: qty,
            actorId,
            reason: 'product_create',
            notes: 'مخزون ابتدائي عند إضافة اللون/المقاس',
          });
        }
      }
    });
  }

  /** Append a color gallery image (max 4 per color). First image becomes variant.imageUrl. */
  private async addColorGalleryImage(productId: string, color: string, url: string) {
    const colorCount = await this.prisma.productImage.count({
      where: { productId, color },
    });
    if (colorCount >= 4) {
      throw new BadRequestException(`الحد الأقصى 4 صور للون «${color}»`);
    }
    const totalCount = await this.prisma.productImage.count({ where: { productId } });
    const created = await this.prisma.productImage.create({
      data: {
        productId,
        url,
        color,
        alt: color,
        sortOrder: totalCount,
        isPrimary: totalCount === 0,
      },
    });
    if (colorCount === 0) {
      await this.prisma.productVariant.updateMany({
        where: { productId, color },
        data: { imageUrl: url },
      });
    }
    return created;
  }

  async addImage(productId: string, url: string, isPrimary = false, color?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('المنتج غير موجود');
    const colorName = color?.trim() || undefined;
    if (colorName) {
      return this.addColorGalleryImage(productId, colorName, url);
    }
    const count = await this.prisma.productImage.count({ where: { productId } });
    if (isPrimary || count === 0) {
      await this.prisma.productImage.updateMany({
        where: { productId },
        data: { isPrimary: false },
      });
    }
    return this.prisma.productImage.create({
      data: {
        productId,
        url,
        sortOrder: count,
        isPrimary: isPrimary || count === 0,
      },
    });
  }

  async uploadImage(productId: string, file: UploadedImageFile, color?: string) {
    const dir = join(process.cwd(), 'uploads', 'products');
    const saved = await saveUploadAsWebp(file, dir, '/uploads/products', {
      ...PRODUCT_IMAGE_SIZE,
      fit: 'cover',
    });
    return this.addImage(productId, saved.url, false, color);
  }

  async removeImage(productId: string, imageId: string) {
    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!image) throw new NotFoundException('الصورة غير موجودة');
    await this.prisma.productImage.delete({ where: { id: imageId } });
    if (image.color) {
      const next = await this.prisma.productImage.findFirst({
        where: { productId, color: image.color },
        orderBy: { sortOrder: 'asc' },
      });
      await this.prisma.productVariant.updateMany({
        where: { productId, color: image.color, imageUrl: image.url },
        data: { imageUrl: next?.url ?? null },
      });
    }
    return { ok: true };
  }
}
