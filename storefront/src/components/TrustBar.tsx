import { TRUST_ITEMS } from '../data/siteContent';

export function TrustBar() {
  return (
    <section className="trust-bar container section reveal is-visible">
      <div className="trust-grid">
        {TRUST_ITEMS.map((item) => (
          <div key={item.label} className="trust-item">
            <span className="material-symbols-outlined" aria-hidden>
              {item.icon}
            </span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
