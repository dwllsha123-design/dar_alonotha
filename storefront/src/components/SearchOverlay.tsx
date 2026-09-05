import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, money, type StoreProduct } from '../api/client';
import { useLocale } from '../i18n/LocaleContext';

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setQ('');
      setHits([]);
      setError('');
      return;
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    const timer = window.setTimeout(() => {
      api<StoreProduct[]>(`/store/products?q=${encodeURIComponent(term)}`)
        .then((rows) => {
          if (!cancelled) setHits(rows.slice(0, 8));
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : t('errorRetry'));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q, open, t]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    onClose();
    navigate(`/search?q=${encodeURIComponent(term)}`);
  }

  if (!open) return null;

  return (
    <div className="search-overlay open" role="dialog" aria-modal="true" aria-label={t('search')}>
      <button type="button" className="search-overlay-backdrop" aria-label={t('close')} onClick={onClose} />
      <div className="search-overlay-panel">
        <form className="search-overlay-form" onSubmit={onSubmit}>
          <span className="material-symbols-outlined">search</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('search')}
          />
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('close')}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </form>

        <div className="search-overlay-body">
          {loading ? <p className="muted">{t('loading')}</p> : null}
          {error ? <p className="error">{error}</p> : null}
          {!loading && q.trim().length >= 2 && !hits.length && !error ? (
            <p className="muted">{t('emptySearch')}</p>
          ) : null}
          <ul className="search-hit-list">
            {hits.map((p) => {
              const img = p.images.find((i) => i.isPrimary)?.url || p.images[0]?.url || '';
              return (
                <li key={p.id}>
                  <Link
                    to={`/product/${p.id}`}
                    onClick={onClose}
                    className="search-hit"
                  >
                    <span className="search-hit-media">
                      {img ? <img src={img} alt="" loading="lazy" /> : <span className="material-symbols-outlined">checkroom</span>}
                    </span>
                    <span className="search-hit-copy">
                      <strong>{p.nameAr}</strong>
                      <em>{money(p.retailPrice)}</em>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {q.trim().length >= 2 ? (
            <button type="submit" className="btn soft" onClick={onSubmit}>
              {t('viewAll')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
