import { Link } from 'react-router-dom';
import type { StoreCategory } from '../data/catalog';

type Props = {
  categories: StoreCategory[];
  /** Max parent categories to show (home). Omit for all. */
  limit?: number;
  className?: string;
};

export function CategoryStrip({ categories, limit, className = '' }: Props) {
  const parents = categories.filter((c) => !c.parentId);
  const list = typeof limit === 'number' ? parents.slice(0, limit) : parents;
  if (!list.length) return null;

  return (
    <div className={`cat-strip${className ? ` ${className}` : ''}`}>
      {list.map((c) => (
        <Link key={c.id} to={`/category/${c.slug}`} className="cat-strip-card">
          <div className="cat-strip-media">
            {c.imageUrl ? (
              <img src={c.imageUrl} alt={c.nameAr} loading="lazy" decoding="async" />
            ) : (
              <span className="cat-strip-fallback" aria-hidden>
                <span className="material-symbols-outlined">checkroom</span>
              </span>
            )}
          </div>
          <span className="cat-strip-label">{c.nameAr}</span>
        </Link>
      ))}
    </div>
  );
}

export function SectionHeading({
  kicker,
  title,
  linkTo,
  linkLabel,
}: {
  kicker?: string;
  title: string;
  linkTo?: string;
  linkLabel?: string;
}) {
  return (
    <div className="section-heading-pb">
      {kicker ? <p className="section-kicker">{kicker}</p> : null}
      <h2 className="section-title-pb">{title}</h2>
      {linkTo && linkLabel ? (
        <Link className="section-link-pb" to={linkTo}>
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}
