import { SITE_COPY } from '../data/siteContent';

export function ReviewsPage() {
  return (
    <section className="container section">
      <div className="section-head">
        <h2 className="headline-lg">آراء العملاء</h2>
        <p>ماذا تقول عميلات دار الأنوثة عن تجربتهن معنا</p>
      </div>
      <div className="reviews-grid">
        {SITE_COPY.reviews.map((r) => (
          <article key={r.name} className="panel review-card">
            <div className="review-stars" aria-label={`${r.stars} نجوم`}>
              {'★'.repeat(r.stars)}
            </div>
            <p className="review-text">{r.text}</p>
            <strong className="review-name">{r.name}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
