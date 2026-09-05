import { useEffect } from 'react';
import { useLocale } from '../i18n/LocaleContext';

const ROWS = [
  { size: 'S', bust: '80–84', waist: '62–66', hip: '88–92' },
  { size: 'M', bust: '84–88', waist: '66–70', hip: '92–96' },
  { size: 'L', bust: '88–94', waist: '70–76', hip: '96–102' },
  { size: 'XL', bust: '94–100', waist: '76–82', hip: '102–108' },
  { size: 'XXL', bust: '100–106', waist: '82–88', hip: '108–114' },
];

export function SizeGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLocale();

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

  if (!open) return null;

  return (
    <div className="modal-root open" role="dialog" aria-modal="true" aria-label={t('sizeGuide')}>
      <button type="button" className="modal-backdrop" aria-label={t('close')} onClick={onClose} />
      <div className="modal-panel size-guide-panel">
        <div className="modal-head">
          <h2>{t('sizeGuide')}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('close')}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <p className="body-md muted">القياسات بالسنتيمتر — اختاري المقاس الأقرب لقياساتكِ.</p>
        <div className="size-guide-table-wrap">
          <table className="size-guide-table">
            <thead>
              <tr>
                <th>المقاس</th>
                <th>الصدر</th>
                <th>الخصر</th>
                <th>الورك</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.size}>
                  <td>{r.size}</td>
                  <td>{r.bust}</td>
                  <td>{r.waist}</td>
                  <td>{r.hip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="label-sm muted" style={{ marginTop: 12 }}>
          {t('privacyNote')}
        </p>
      </div>
    </div>
  );
}
