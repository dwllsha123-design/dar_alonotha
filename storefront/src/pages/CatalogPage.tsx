import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, type StoreProduct } from '../api/client';
import { ProductGrid } from '../components/ProductCard';
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
  const [qInput, setQInput] = useState(params.get('q') || '');
  const [sort, setSort] = useState<SortKey>('new');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const q = params.get('q') || '';

  const collectionSlug =
    mode === 'collection' ? location.pathname.replace('/', '') || slug : slug;

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
        categories.find((c) => c.slug === slug)?.nameAr ||
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

  return (
    <section className="container section">
      <div className="catalog-head">
        <h2 className="headline-xl">{title}</h2>
        <p className="body-lg">{subtitle}</p>
      </div>

      {mode === 'all' || mode === 'search' || mode === 'category' ? (
        <div className="sort-pills" style={{ marginBottom: 16 }}>
          <Link to="/products" className={!slug && mode !== 'search' ? 'active' : ''}>
            الكل
          </Link>
          {categories.map((c) => (
            <Link key={c.id} to={`/category/${c.slug}`} className={slug === c.slug ? 'active' : ''}>
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
      <ProductGrid products={filtered} />
    </section>
  );
}

export function CategoriesPage() {
  const categories = useStoreCategories();

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
      <div className="cat-grid">
        {categories.map((c) => (
          <Link
            key={c.id}
            to={`/category/${c.slug}`}
            className={c.imageUrl ? 'cat-tile' : 'cat-tile text-only'}
          >
            <div className="cat-tile-media">
              {c.imageUrl ? (
                <img src={c.imageUrl} alt={c.nameAr} loading="lazy" decoding="async" />
              ) : (
                <h3>{c.nameAr}</h3>
              )}
            </div>
            {c.imageUrl ? <h3>{c.nameAr}</h3> : null}
          </Link>
        ))}
        <Link to="/new" className="cat-tile text-only">
          <div className="cat-tile-media">
            <h3>وصل حديثاً</h3>
          </div>
        </Link>
        <Link to="/offers" className="cat-tile offer-tile">
          <div className="cat-tile-media">
            <h3>عروض خاصة</h3>
            <p>اكتشفي أحدث التخفيضات</p>
          </div>
        </Link>
        <Link to="/bestseller" className="cat-tile text-only">
          <div className="cat-tile-media">
            <h3>الأكثر مبيعاً</h3>
          </div>
        </Link>
      </div>
    </section>
  );
}
