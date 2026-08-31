import { useEffect, useMemo, useState } from 'react';
import { api, apiUpload, money } from '@/api/client';
import { ColorCard } from './ColorCard';
import { ImageDropzone } from './ImageDropzone';
import { ProductSummary } from './ProductSummary';
import { VariantPreview } from './VariantPreview';
import {
  MAX_GALLERY_IMAGES,
  SALE_PRESETS,
  type CategoryRow,
  type ColorGroup,
  type LocalImage,
  type Product,
} from './productTypes';
import {
  emptyColorGroup,
  makeLocalFromExisting,
  productRetail,
  productSalePercent,
  revokeAll,
  salePriceFrom,
  uid,
} from './productUtils';

export type ProductFormProps = {
  categories: CategoryRow[];
  editing: Product | null;
  canSeeCost: boolean;
  isOwner: boolean;
  onCancel: () => void;
  onSaved: (productId: string, notice: string) => void;
  onError: (message: string) => void;
};

export function ProductForm({
  categories,
  editing,
  canSeeCost,
  isOwner,
  onCancel,
  onSaved,
  onError,
}: ProductFormProps) {
  const [nameAr, setNameAr] = useState('');
  const [description, setDescription] = useState('');
  const [retailPrice, setRetailPrice] = useState(0);
  const [wholesalePrice, setWholesalePrice] = useState<number | ''>('');
  const [costPrice, setCostPrice] = useState<number | ''>('');
  const [sku, setSku] = useState('');
  const [parentCategoryId, setParentCategoryId] = useState('');
  const [subCategoryId, setSubCategoryId] = useState('');
  const [generalImages, setGeneralImages] = useState<LocalImage[]>([]);
  const [colorGroups, setColorGroups] = useState<ColorGroup[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [customDiscount, setCustomDiscount] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [removedImageIds, setRemovedImageIds] = useState<string[]>([]);

  const parentCategories = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories],
  );
  const subCategories = useMemo(
    () => categories.filter((c) => c.parentId === parentCategoryId),
    [categories, parentCategoryId],
  );
  const resolvedCategoryId = subCategoryId || parentCategoryId || null;
  const categoryName =
    categories.find((c) => c.id === resolvedCategoryId)?.nameAr ||
    categories.find((c) => c.id === parentCategoryId)?.nameAr;

  useEffect(() => {
    if (!editing) return;
    setNameAr(editing.nameAr);
    setDescription(editing.description || '');
    setRetailPrice(productRetail(editing));
    setWholesalePrice(
      editing.wholesalePrice != null && editing.wholesalePrice !== ''
        ? Number(editing.wholesalePrice)
        : '',
    );
    setCostPrice(
      editing.costPrice != null && editing.costPrice !== ''
        ? Number(editing.costPrice)
        : '',
    );
    setSku(editing.sku || '');
    setDiscountPercent(productSalePercent(editing));
    const cat = editing.category;
    if (cat?.parentId) {
      setParentCategoryId(cat.parentId);
      setSubCategoryId(cat.id);
    } else if (cat?.id) {
      setParentCategoryId(cat.id);
      setSubCategoryId('');
    }
    const generic = (editing.images || [])
      .filter((i) => !i.color)
      .map(makeLocalFromExisting);
    setGeneralImages(generic);

    const colors = [
      ...new Set(
        editing.variants.map((v) => v.color).filter(Boolean) as string[],
      ),
    ];
    const groups: ColorGroup[] = colors.map((color) => {
      const sizes = [
        ...new Set(
          editing.variants
            .filter((v) => v.color === color)
            .map((v) => v.size || '')
            .filter(Boolean),
        ),
      ];
      const qtyBySize: Record<string, string> = {};
      for (const size of sizes) {
        const v = editing.variants.find(
          (x) => x.color === color && x.size === size,
        );
        qtyBySize[size] = String(v?.available ?? 0);
      }
      const images = (editing.images || [])
        .filter((i) => i.color === color)
        .map(makeLocalFromExisting);
      return {
        key: uid(),
        color,
        images,
        sizes,
        qtyBySize,
      };
    });
    setColorGroups(groups);
  }, [editing]);

  useEffect(() => {
    return () => {
      revokeAll(generalImages);
      colorGroups.forEach((g) => revokeAll(g.images));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setGeneralImagesSafe(next: LocalImage[]) {
    const removed = generalImages.filter(
      (old) => !next.some((n) => n.key === old.key),
    );
    for (const r of removed) {
      if (r.existingId) setRemovedImageIds((ids) => [...ids, r.existingId!]);
    }
    setGeneralImages(next);
  }

  function updateGroup(key: string, next: ColorGroup) {
    setColorGroups((prev) => prev.map((g) => (g.key === key ? next : g)));
  }

  function removeGroup(key: string) {
    const g = colorGroups.find((x) => x.key === key);
    if (g) {
      for (const img of g.images) {
        if (img.existingId) setRemovedImageIds((ids) => [...ids, img.existingId!]);
      }
      revokeAll(g.images);
    }
    setColorGroups((prev) => prev.filter((x) => x.key !== key));
  }

  function addColor() {
    setColorGroups((prev) => [...prev, emptyColorGroup('أسود')]);
  }

  function applyDiscountPreset(p: number) {
    setDiscountPercent(p);
    setCustomDiscount(String(p));
  }

  async function persist(asDraft: boolean) {
    if (!nameAr.trim()) {
      onError('اسم المنتج مطلوب');
      return;
    }
    if (!(retailPrice > 0)) {
      onError('سعر البيع مطلوب ويجب أن يكون أكبر من صفر');
      return;
    }
    for (const g of colorGroups) {
      if (!g.color.trim()) {
        onError('كل بطاقة لون تحتاج اسم لون');
        return;
      }
      if (!g.sizes.length) {
        onError(`اللون «${g.color}» يحتاج مقاسًا واحدًا على الأقل`);
        return;
      }
    }

    setSaveBusy(true);
    onError('');
    try {
      const status = asDraft ? 'DRAFT' : 'ACTIVE';
      const isEdit = Boolean(editing?.id);
      let productId = isEdit ? editing!.id : undefined;

      if (isEdit && editing) {
        await api(`/products/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            nameAr: nameAr.trim(),
            description: description || undefined,
            retailPrice,
            wholesalePrice:
              isOwner && wholesalePrice !== '' ? Number(wholesalePrice) : undefined,
            costPrice: canSeeCost && costPrice !== '' ? Number(costPrice) : undefined,
            categoryId: resolvedCategoryId,
            status,
          }),
        });
        for (const imageId of removedImageIds) {
          if (imageId.startsWith('tmp-')) continue;
          await api(`/products/${editing.id}/images/${imageId}`, {
            method: 'DELETE',
          }).catch(() => undefined);
        }
        for (const img of generalImages) {
          if (img.file) {
            await apiUpload(`/products/${editing.id}/images/upload`, img.file);
          }
        }
        for (const g of colorGroups) {
          for (const img of g.images) {
            if (img.file) {
              await apiUpload(
                `/products/${editing.id}/images/upload?color=${encodeURIComponent(g.color)}`,
                img.file,
              );
            }
          }
          for (const size of g.sizes) {
            const exists = editing.variants.some(
              (v) => v.color === g.color && v.size === size,
            );
            if (!exists) {
              await api(`/products/${editing.id}/variants`, {
                method: 'POST',
                body: JSON.stringify({
                  color: g.color,
                  size,
                  quantity: Number(g.qtyBySize[size] || 0),
                  retailPrice,
                }),
              });
            }
          }
        }
      } else {
        const variantPayload = colorGroups.flatMap((g) =>
          g.sizes.map((size) => ({
            color: g.color,
            size,
            quantity: Number(g.qtyBySize[size] || 0),
            retailPrice,
          })),
        );
        const created = await api<Product>('/products', {
          method: 'POST',
          body: JSON.stringify({
            nameAr: nameAr.trim(),
            description: description || undefined,
            retailPrice,
            wholesalePrice:
              isOwner && wholesalePrice !== '' ? Number(wholesalePrice) : undefined,
            costPrice: canSeeCost && costPrice !== '' ? Number(costPrice) : undefined,
            sku: sku || undefined,
            categoryId: resolvedCategoryId || undefined,
            variants: variantPayload.length ? variantPayload : undefined,
          }),
        });
        productId = created.id;
        if (asDraft) {
          await api(`/products/${created.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'DRAFT' }),
          });
        }
        for (const img of generalImages) {
          if (img.file) {
            await apiUpload(`/products/${created.id}/images/upload`, img.file);
          } else if (img.existingUrl) {
            await api(`/products/${created.id}/images`, {
              method: 'POST',
              body: JSON.stringify({ url: img.existingUrl, isPrimary: false }),
            });
          }
        }
        for (const g of colorGroups) {
          for (const img of g.images) {
            if (img.file) {
              await apiUpload(
                `/products/${created.id}/images/upload?color=${encodeURIComponent(g.color)}`,
                img.file,
              );
            } else if (img.existingUrl) {
              await api(`/products/${created.id}/images`, {
                method: 'POST',
                body: JSON.stringify({
                  url: img.existingUrl,
                  color: g.color,
                }),
              });
            }
          }
        }
      }

      if (productId && discountPercent > 0) {
        await api(`/products/${productId}/discount`, {
          method: 'POST',
          body: JSON.stringify({ percent: discountPercent }),
        });
      } else if (
        productId &&
        isEdit &&
        editing &&
        discountPercent === 0 &&
        productSalePercent(editing) > 0
      ) {
        await api(`/products/${productId}/discount`, {
          method: 'POST',
          body: JSON.stringify({ percent: 0 }),
        });
      }

      onSaved(
        productId!,
        asDraft
          ? 'تم حفظ المسودة'
          : isEdit
            ? 'تم حفظ ونشر المنتج'
            : 'تم نشر المنتج',
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'فشل الحفظ');
    } finally {
      setSaveBusy(false);
    }
  }

  const afterDiscount =
    discountPercent > 0 ? salePriceFrom(retailPrice, discountPercent) : null;

  return (
    <div className="pf-form stack">
      <section className="pf-card">
        <h3>1. المعلومات الأساسية</h3>
        <div className="form-grid two">
          <label>
            اسم المنتج *
            <input
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              required
              placeholder="مثال: روب نسائي حريري"
            />
          </label>
          <label>
            SKU (اختياري — يُولَّد DA-xxxx تلقائيًا)
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="اتركيه فارغًا للتوليد"
              disabled={Boolean(editing)}
            />
          </label>
          <label>
            الفئة
            <select
              value={parentCategoryId}
              onChange={(e) => {
                setParentCategoryId(e.target.value);
                setSubCategoryId('');
              }}
            >
              <option value="">— بدون —</option>
              {parentCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr}
                </option>
              ))}
            </select>
          </label>
          <label>
            الصنف
            <select
              value={subCategoryId}
              onChange={(e) => setSubCategoryId(e.target.value)}
              disabled={!parentCategoryId || !subCategories.length}
            >
              <option value="">— الكل / بدون —</option>
              {subCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameAr}
                </option>
              ))}
            </select>
          </label>
          <label style={{ gridColumn: '1 / -1' }}>
            الوصف
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </label>
          <label>
            سعر البيع (د.ل) *
            <input
              type="number"
              min={0}
              value={retailPrice || ''}
              onChange={(e) => setRetailPrice(Number(e.target.value) || 0)}
            />
          </label>
          {isOwner ? (
            <label>
              سعر الجملة
              <input
                type="number"
                min={0}
                value={wholesalePrice}
                onChange={(e) =>
                  setWholesalePrice(e.target.value === '' ? '' : Number(e.target.value))
                }
              />
            </label>
          ) : null}
          {canSeeCost ? (
            <label>
              التكلفة
              <input
                type="number"
                min={0}
                value={costPrice}
                onChange={(e) =>
                  setCostPrice(e.target.value === '' ? '' : Number(e.target.value))
                }
              />
            </label>
          ) : null}
        </div>
      </section>

      <section className="pf-card">
        <h3>2. الصور العامة</h3>
        <ImageDropzone
          images={generalImages}
          max={MAX_GALLERY_IMAGES}
          onChange={setGeneralImagesSafe}
          label="صور عامة للمنتج"
          hint="اسحب الصور هنا أو اضغط لاختيار الصور"
        />
      </section>

      <section className="pf-card">
        <div className="pf-card-head">
          <h3>3. الألوان والمقاسات والمخزون</h3>
          <button type="button" className="btn" onClick={addColor}>
            + إضافة لون
          </button>
        </div>
        {!colorGroups.length ? (
          <p className="muted">ابدئي بإضافة لون، ثم ارفعي حتى 4 صور واختاري المقاسات.</p>
        ) : null}
        <div className="pf-color-list">
          {colorGroups.map((g) => (
            <ColorCard
              key={g.key}
              group={g}
              retailPrice={retailPrice}
              onChange={(next) => {
                const prev = colorGroups.find((x) => x.key === g.key);
                if (prev) {
                  const removed = prev.images.filter(
                    (old) => !next.images.some((n) => n.key === old.key),
                  );
                  for (const r of removed) {
                    if (r.existingId) {
                      setRemovedImageIds((ids) => [...ids, r.existingId!]);
                    }
                  }
                }
                updateGroup(g.key, next);
              }}
              onRemove={() => removeGroup(g.key)}
            />
          ))}
        </div>
      </section>

      <VariantPreview colorGroups={colorGroups} retailPrice={retailPrice} />

      <section className="pf-card">
        <h3>التخفيض (اختياري)</h3>
        <div className="pf-discount-row">
          {SALE_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`btn secondary${discountPercent === p ? ' is-selected' : ''}`}
              onClick={() => applyDiscountPreset(p)}
            >
              {p}%
            </button>
          ))}
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setDiscountPercent(0);
              setCustomDiscount('');
            }}
          >
            بدون خصم
          </button>
        </div>
        <label style={{ maxWidth: 200, marginTop: 10, display: 'block' }}>
          خصم مخصص (0–90%)
          <input
            type="number"
            min={0}
            max={90}
            value={customDiscount}
            onChange={(e) => {
              setCustomDiscount(e.target.value);
              const n = Math.min(90, Math.max(0, Number(e.target.value) || 0));
              setDiscountPercent(n);
            }}
          />
        </label>
        {afterDiscount != null && retailPrice > 0 ? (
          <p className="pf-discount-preview">
            السعر: {money(retailPrice)} → بعد الخصم {discountPercent}%:{' '}
            <strong>{money(afterDiscount)}</strong>
          </p>
        ) : null}
      </section>

      <ProductSummary
        nameAr={nameAr}
        categoryName={categoryName}
        retailPrice={retailPrice}
        discountPercent={discountPercent}
        generalImages={generalImages}
        colorGroups={colorGroups}
        saveBusy={saveBusy}
        isEdit={Boolean(editing)}
        onCancel={onCancel}
        onDraft={() => void persist(true)}
        onPublish={() => void persist(false)}
      />
    </div>
  );
}
