import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type StoreProduct } from '../api/client';
import { ProductGrid, ProductGridSkeleton } from '../components/ProductCard';
import { useStoreCategories } from '../hooks/useStoreCategories';
import { usePageMeta } from '../hooks/usePageMeta';
import { SITE_COPY } from '../data/siteContent';

const titles: Record<string, string> = {
  lingerie: 'لانجري',
  underwear: 'ملابس داخلية نسائية',
  robes: 'أرواب',
  wigs: 'باروكات',
  offers: 'العروض',
  new: 'المنتجات الجديدة',
  bestseller: 'الأكثر مبيعًا',
  products: 'المتجر',
};

const CATEGORY_ICONS: Record<string, string> = {
  lingerie: 'checkroom',
  underwear: 'apparel',
  robes: 'styler',
  wigs: 'face_3',
};

type SortKey = 'new' | 'bestseller' | 'price' | 'price-desc';

export function CatalogPage({
  mode,
}: {
  mode?: 'category' | 'collection' | 'all' | 'search';
}) {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const categories = useStoreCategories();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [qInput, setQInput] = useState(params.get('q') || '');
  const [sort, setSort] = useState<SortKey>('new');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const q = params.get('q') || '';

  const collectionSlug =
    mode === 'collection' ? location.pathname.replace('/', '') || slug : slug;

  const parentCategories = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories],
  );

  const currentCategory = useMemo(
    () => (slug ? categories.find((c) => c.slug === slug) : undefined),
    [categories, slug],
  );

  const activeParent = useMemo(() => {
    if (!currentCategory) return undefined;
    if (currentCategory.parentId) {
      return categories.find((c) => c.id === currentCategory.parentId);
    }
    return currentCategory;
  }, [categories, currentCategory]);

  const childCategories = useMemo(() => {
    if (!activeParent) return [];
    return categories.filter((c) => c.parentId === activeParent.id);
  }, [categories, activeParent]);

  const showCategoryNav =
    mode === 'all' || mode === 'search' || mode === 'category' || collectionSlug === 'offers';
  const offersActive = collectionSlug === 'offers';

  useEffect(() => {
    setQInput(q);
  }, [q]);

  useEffect(() => {
    let path = '/store/products';
    if (mode === 'category' && slug) path += `?category=${slug}`;
    if (mode === 'collection' && collectionSlug) {
      path += `?collection=${collectionSlug}`;
    }
    if (mode === 'search') {
      if (!q) {
        setProducts([]);
        setLoading(false);
        return;
      }
      path += `?q=${encodeURIComponent(q)}`;
    }
    setLoading(true);
    api<StoreProduct[]>(path)
      .then(setProducts)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [mode, slug, collectionSlug, q]);

  const filtered = useMemo(() => {
    let list = [...products];
    if (inStockOnly) list = list.filter((p) => p.inStock);
    if (onSaleOnly) list = list.filter((p) => p.discountPercent > 0);
    if (sort === 'price') {
      list.sort((a, b) => Number(a.retailPrice) - Number(b.retailPrice));
    } else if (sort === 'price-desc') {
      list.sort((a, b) => Number(b.retailPrice) - Number(a.retailPrice));
    } else if (sort === 'bestseller') {
      list.sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));
    } else {
      list.sort((a, b) => {
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return db - da;
      });
    }
    return list;
  }, [products, sort, inStockOnly, onSaleOnly]);

  const title =
    mode === 'search'
      ? q
        ? `بحث: ${q}`
        : 'البحث'
      : titles[collectionSlug || slug || 'products'] ||
        currentCategory?.nameAr ||
        titles.products;

  const subtitle =
    mode === 'all'
      ? 'اكتشفي أحدث صيحات الموضة التي تبرز أنوثتك'
      : `${filtered.length} منتج`;

  usePageMeta(title);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    if (mode === 'search') {
      setParams(qInput ? { q: qInput } : {});
    } else if (qInput.trim()) {
      navigate(`/search?q=${encodeURIComponent(qInput.trim())}`);
    }
  }

  return (
    <section className="container section">
      <div className="catalog-head">
        <h2 className="headline-xl">{title}</h2>
        <p className="body-lg">{subtitle}</p>
      </div>

      {showCategoryNav ? (
        <nav className="category-icons" aria-label="الفئات">
          <Link
            to="/products"
            className={`category-icon${!slug && !offersActive && mode !== 'search' ? ' active' : ''}`}
          >
            <span className="category-icon-media">
              <span className="material-symbols-outlined">apps</span>
            </span>
            <span className="category-icon-label">الكل</span>
          </Link>
          {parentCategories.map((c) => {
            const active = activeParent?.id === c.id;
            return (
              <Link
                key={c.id}
                to={`/category/${c.slug}`}
                className={`category-icon${active ? ' active' : ''}`}
              >
                <span className="category-icon-media">
                  {c.imageUrl ? (
                    <img src={c.imageUrl} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="material-symbols-outlined">
                      {CATEGORY_ICONS[c.slug] || 'category'}
                    </span>
                  )}
                </span>
                <span className="category-icon-label">{c.nameAr}</span>
              </Link>
            );
          })}
          <Link to="/offers" className={`category-icon offers${offersActive ? ' active' : ''}`}>
            <span className="category-icon-media">
              <span className="material-symbols-outlined">sell</span>
            </span>
            <span className="category-icon-label">العروض</span>
          </Link>
        </nav>
      ) : null}

      {mode === 'category' && childCategories.length > 0 ? (
        <div className="subcategory-pills" aria-label="الأصناف">
          <Link
            to={`/category/${activeParent?.slug}`}
            className={`subcat-chip${!currentCategory?.parentId ? ' active' : ''}`}
          >
            <span className="subcat-chip-media" aria-hidden>
              {activeParent?.imageUrl ? (
                <img src={activeParent.imageUrl} alt="" loading="lazy" decoding="async" />
              ) : (
                <span className="material-symbols-outlined">apps</span>
              )}
            </span>
            <span className="subcat-chip-label">كل الأصناف</span>
          </Link>
          {childCategories.map((c) => (
            <Link
              key={c.id}
              to={`/category/${c.slug}`}
              className={`subcat-chip${slug === c.slug ? ' active' : ''}`}
            >
              <span className="subcat-chip-media" aria-hidden>
                {c.imageUrl ? (
                  <img src={c.imageUrl} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="material-symbols-outlined">
                    {CATEGORY_ICONS[c.slug] || 'category'}
                  </span>
                )}
              </span>
              <span className="subcat-chip-label">{c.nameAr}</span>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="catalog-toolbar">
        <form className="search-field" onSubmit={onSearch}>
          <span className="material-symbols-outlined search-icon">search</span>
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="ابحثي عن منتج"
          />
        </form>
        <div className="sort-row hide-scroll">
          <div className="sort-pills">
            <button type="button" className={sort === 'new' ? 'active' : ''} onClick={() => setSort('new')}>
              الأحدث
            </button>
            <button
              type="button"
              className={sort === 'bestseller' ? 'active' : ''}
              onClick={() => setSort('bestseller')}
            >
              الأكثر مبيعًا
            </button>
            <button type="button" className={sort === 'price' ? 'active' : ''} onClick={() => setSort('price')}>
              السعر ↑
            </button>
            <button
              type="button"
              className={sort === 'price-desc' ? 'active' : ''}
              onClick={() => setSort('price-desc')}
            >
              السعر ↓
            </button>
          </div>
          <button
            type="button"
            className={`btn soft${filtersOpen || inStockOnly || onSaleOnly ? ' filter-on' : ''}`}
            style={{ borderRadius: 999, padding: '8px 20px' }}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            تصفية
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              tune
            </span>
          </button>
        </div>
      </div>

      {filtersOpen ? (
        <div className="panel filter-panel">
          <label>
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
            />
            المتوفر فقط
          </label>
          <label>
            <input
              type="checkbox"
              checked={onSaleOnly}
              onChange={(e) => setOnSaleOnly(e.target.checked)}
            />
            العروض والخصومات
          </label>
        </div>
      ) : null}

      {error ? <div className="error">{error}</div> : null}
      {loading ? (
        <ProductGridSkeleton count={8} />
      ) : filtered.length ? (
        <ProductGrid products={filtered} />
      ) : (
        <div className="empty-state">
          <h3 className="headline-md">
            {mode === 'search' ? 'لم نجد منتجات مطابقة لبحثك' : 'لم نجد منتجات مطابقة لاختيارك'}
          </h3>
          <Link className="btn secondary" to="/products">
            {SITE_COPY.viewAll}
          </Link>
        </div>
      )}
    </section>
  );
}

export function CategoriesPage() {
  const categories = useStoreCategories();
  usePageMeta('التصنيفات');

  const parents = useMemo(() => categories.filter((c) => !c.parentId), [categories]);

  return (
    <section className="container section">
      <div className="section-head">
        <h2 className="headline-lg" style={{ margin: 0 }}>
          التصنيفات
        </h2>
        <Link className="icon-btn" to="/search-box" aria-label="بحث">
          <span className="material-symbols-outlined">search</span>
        </Link>
      </div>
      <div className="cat-discover">
        {parents.map((c) => (
          <Link key={c.id} to={`/category/${c.slug}`} className="cat-discover-card">
            <div className="cat-discover-media">
              {c.imageUrl ? (
                <img src={c.imageUrl} alt={c.nameAr} loading="lazy" decoding="async" />
              ) : (
                <span className="cat-discover-fallback" aria-hidden>
                  <span className="material-symbols-outlined">
                    {CATEGORY_ICONS[c.slug] || 'checkroom'}
                  </span>
                </span>
              )}
            </div>
            <h3>{c.nameAr}</h3>
          </Link>
        ))}
        <Link to="/new" className="cat-discover-card">
          <div className="cat-discover-media">
            <span className="cat-discover-fallback">
              <span className="material-symbols-outlined">new_releases</span>
            </span>
          </div>
          <h3>وصل حديثًا</h3>
        </Link>
        <Link to="/offers" className="cat-discover-card offer">
          <div className="cat-discover-media">
            <span className="cat-discover-fallback gold">
              <span className="material-symbols-outlined">local_offer</span>
            </span>
          </div>
          <h3>العروض</h3>
        </Link>
        <Link to="/bestseller" className="cat-discover-card">
          <div className="cat-discover-media">
            <span className="cat-discover-fallback">
              <span className="material-symbols-outlined">trending_up</span>
            </span>
          </div>
          <h3>الأكثر مبيعًا</h3>
        </Link>
      </div>
    </section>
  );
}
