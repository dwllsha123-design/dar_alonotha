import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';

export function NotFoundPage() {
  usePageMeta({
    title: 'الصفحة غير موجودة',
    description: 'الصفحة المطلوبة غير موجودة في متجر دار الأنوثة.',
    robots: 'noindex,follow',
    path: typeof window !== 'undefined' ? window.location.pathname : '/404',
  });

  return (
    <main className="container section" style={{ textAlign: 'center', paddingBlock: 64 }}>
      <h1 className="headline-md" style={{ marginBottom: 12 }}>
        الصفحة غير موجودة
      </h1>
      <p className="body-md muted" style={{ marginBottom: 24 }}>
        الرابط غير صحيح أو أن المنتج لم يعد متاحًا.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link className="btn" to="/products">
          تسوقي المتجر
        </Link>
        <Link className="btn soft" to="/">
          الرئيسية
        </Link>
      </div>
    </main>
  );
}
