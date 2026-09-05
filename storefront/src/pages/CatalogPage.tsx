import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type StoreProduct } from '../api/client';
import { ProductGrid, type CatalogViewMode } from '../components/ProductCard';
import { useStoreCategories } from '../hooks/useStoreCategories';

const titles: Record<string, string> = {
  lingerie: 'لانجري',
  underwear: 'ملابس داخلية نسائية',
  robes: 'أرواب',
  wigs: 'باروكات',
  offers: 'العروض',
  new: 'المنتجات الجديدة',
  bestseller: 'الأكثر مبيعاً',
  products: 'المتجر',
};

const CATEGORY_ICONS: Record<string, string> = {
  lingerie: 'checkroom',
  underwear: 'apparel',
  robes: 'styler',
  wigs: 'face_3',
};

const VIEW_KEY = 'catalog_view_mode';

type SortKey = 'new' | 'bestseller' | 'price' | 'price-desc';

function readViewMode(): CatalogViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

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
  const [qInput, setQInput] = useState(params.get('q') || '');
  const [sort, setSort] = useState<SortKey>('new');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<CatalogViewMode>(readViewMode);
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

  const showCategoryNav = mode === 'all' || mode === 'search' || mode === 'category' || collectionSlug === 'offers';
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
        return;
      }
      path += `?q=${encodeURIComponent(q)}`;
    }
    api<StoreProduct[]>(path)
      .then(setProducts)
      .catch((e) => setError(e.message));
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

  function onSearch(e: FormEvent) {
    e.preventDefault();
    if (mode === 'search') {
      setParams(qInput ? { q: qInput } : {});
    } else if (qInput.trim()) {
      navigate(`/search?q=${encodeURIComponent(qInput.trim())}`);
    }
  }

  function setView(next: CatalogViewMode) {
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
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
          <Link
            to="/offers"
            className={`category-icon offers${offersActive ? ' active' : ''}`}
          >
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
            className={!currentCategory?.parentId ? 'active' : ''}
          >
            كل الأصناف
          </Link>
          {childCategories.map((c) => (
            <Link
              key={c.id}
              to={`/category/${c.slug}`}
              className={slug === c.slug ? 'active' : ''}
            >
              {c.nameAr}
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
            placeholder="ابحثي عن منتج..."
          />
        </form>
        <div className="sort-row hide-scroll">
          <div className="view-toggle" role="group" aria-label="طريقة العرض">
            <button
              type="button"
              className={viewMode === 'grid' ? 'active' : ''}
              aria-pressed={viewMode === 'grid'}
              aria-label="عرض شبكي"
              onClick={() => setView('grid')}
            >
              <span className="material-symbols-outlined">grid_view</span>
            </button>
            <button
              type="button"
              className={viewMode === 'list' ? 'active' : ''}
              aria-pressed={viewMode === 'list'}
              aria-label="عرض قائمة"
              onClick={() => setView('list')}
            >
              <span className="material-symbols-outlined">view_list</span>
            </button>
          </div>
          <div className="sort-pills">
            <button type="button" className={sort === 'new' ? 'active' : ''} onClick={() => setSort('new')}>
              الأحدث
            </button>
            <button
              type="button"
              className={sort === 'bestseller' ? 'active' : ''}
              onClick={() => setSort('bestseller')}
            >
              الأكثر مبيعاً
            </button>
            <button
              type="button"
              className={sort === 'price' ? 'active' : ''}
              onClick={() => setSort('price')}
            >
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
      <ProductGrid products={filtered} viewMode={viewMode} />
    </section>
  );
}

export function CategoriesPage() {
  const categories = useStoreCategories();

  const parents = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories],
  );

  const childrenOf = (parentId: string) =>
    categories.filter((c) => c.parentId === parentId);

  return (
    <section className="container section">
      <div className="section-head">
        <h2 className="headline-lg" style={{ margin: 0 }}>
          الفئات والأصناف
        </h2>
        <Link className="icon-btn" to="/search-box" aria-label="بحث">
          <span className="material-symbols-outlined">search</span>
        </Link>
      </div>

      <div className="cat-hierarchy">
        {parents.map((parent) => {
          const kids = childrenOf(parent.id);
          return (
            <div key={parent.id} className="cat-group">
              <Link to={`/category/${parent.slug}`} className="cat-group-head">
                <span className="cat-group-media">
                  {parent.imageUrl ? (
                    <img src={parent.imageUrl} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="material-symbols-outlined">
                      {CATEGORY_ICONS[parent.slug] || 'category'}
                    </span>
                  )}
                </span>
                <div>
                  <h3>{parent.nameAr}</h3>
                  <p>{kids.length ? `${kids.length} صنف` : 'عرض المنتجات'}</p>
                </div>
                <span className="material-symbols-outlined cat-group-arrow">chevron_left</span>
              </Link>
              {kids.length ? (
                <div className="cat-group-children">
                  {kids.map((child) => (
                    <Link key={child.id} to={`/category/${child.slug}`} className="cat-child-chip">
                      {child.imageUrl ? (
                        <img src={child.imageUrl} alt="" loading="lazy" decoding="async" />
                      ) : null}
                      <span>{child.nameAr}</span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}

        <div className="cat-group">
          <Link to="/offers" className="cat-group-head offer">
            <span className="cat-group-media">
              <span className="material-symbols-outlined">sell</span>
            </span>
            <div>
              <h3>العروض</h3>
              <p>اكتشفي أحدث التخفيضات</p>
            </div>
            <span className="material-symbols-outlined cat-group-arrow">chevron_left</span>
          </Link>
        </div>

        <div className="cat-group">
          <Link to="/new" className="cat-group-head">
            <span className="cat-group-media">
              <span className="material-symbols-outlined">new_releases</span>
            </span>
            <div>
              <h3>وصل حديثاً</h3>
              <p>أحدث الإضافات</p>
            </div>
            <span className="material-symbols-outlined cat-group-arrow">chevron_left</span>
          </Link>
        </div>

        <div className="cat-group">
          <Link to="/bestseller" className="cat-group-head">
            <span className="cat-group-media">
              <span className="material-symbols-outlined">trending_up</span>
            </span>
            <div>
              <h3>الأكثر مبيعاً</h3>
              <p>اختيارات الزبونات</p>
            </div>
            <span className="material-symbols-outlined cat-group-arrow">chevron_left</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
