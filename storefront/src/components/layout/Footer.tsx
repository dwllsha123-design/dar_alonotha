import { Link } from 'react-router-dom';
import { NewsletterForm } from '../NewsletterForm';
import { SITE_COPY, STORE_LOCATION, STORE_PHONE_LINKS } from '../../data/siteContent';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid footer-grid-ly">
        <div className="footer-brand">
          <img className="footer-logo" src="/brand-logo.png" alt="دار الأنوثة" />
          <h3>حول الشركة</h3>
          <p>{SITE_COPY.footerAbout}</p>
          <p>{SITE_COPY.footerDelivery}</p>
          <ul className="footer-contact">
            <li>{STORE_LOCATION}</li>
            <li>
              {STORE_PHONE_LINKS.map((p, i) => (
                <span key={p.href}>
                  {i > 0 ? ' / ' : null}
                  <a href={p.href}>{p.label}</a>
                </span>
              ))}
            </li>
          </ul>
        </div>
        <div className="footer-col">
          <strong>روابط سريعة</strong>
          <div className="footer-links">
            <Link to="/">الصفحة الرئيسية</Link>
            <Link to="/about">من نحن</Link>
            <Link to="/products">تسوق الآن</Link>
            <Link to="/policies/shipping">سياسة الشحن</Link>
            <Link to="/policies/returns">سياسة الاستبدال والاسترجاع</Link>
          </div>
        </div>
        <div className="footer-col">
          <strong>دعم العملاء</strong>
          <div className="footer-links">
            <Link to="/track">تتبع طلبك</Link>
            <Link to="/cart">سلة المشتريات</Link>
            <Link to="/contact">تواصل معنا</Link>
            <Link to="/policies/privacy">سياسة الخصوصية</Link>
            <Link to="/policies/terms">الشروط والأحكام</Link>
          </div>
        </div>
        <div className="footer-col">
          <strong>النشرة الإخبارية</strong>
          <p className="footer-newsletter-hint">للحصول على آخر الأخبار والتحديثات.</p>
          <NewsletterForm />
          <div className="app-stores">
            <strong className="app-stores-title">تطبيقنا</strong>
            <div className="app-store-badges" aria-label="تطبيقات الجوال — قريباً">
              <span className="app-store-badge" role="img" aria-label="Google Play — قريباً">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="app-store-icon">
                  <path
                    fill="currentColor"
                    d="M3.6 2.2c-.3.2-.5.6-.5 1.1v17.4c0 .5.2.9.5 1.1l.1.1 9.6-9.6v-.2L3.7 2.1l-.1.1zm12.1 7L13 11.9l2.7 2.7 3.2-1.8c.9-.5.9-1.4 0-1.9l-3.2-1.7zM4.1 20.7l8.5-8.5 2.4 2.4-9.6 5.5c-.6.3-1 .2-1.3.6zm0-17.4c.3.4.7.3 1.3.6l9.6 5.5-2.4 2.4-8.5-8.5z"
                  />
                </svg>
                <span className="app-store-text">
                  <span className="app-store-soon">{SITE_COPY.comingSoon}</span>
                  <span className="app-store-name">Google Play</span>
                </span>
              </span>
              <span className="app-store-badge" role="img" aria-label="App Store — قريباً">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="app-store-icon">
                  <path
                    fill="currentColor"
                    d="M16.4 12.8c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.7-1.3-.1-2.5.8-3.1.8-.7 0-1.7-.7-2.8-.7-1.4 0-2.8.8-3.5 2.1-1.5 2.6-.4 6.4 1.1 8.5.7 1 1.6 2.2 2.7 2.1 1.1-.1 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1 2.6-2 .8-1.2 1.1-2.3 1.2-2.4-.1 0-2.2-.8-2.2-3.5zm-2-6.5c.6-.7 1-1.7.9-2.7-1 .1-2.1.6-2.8 1.4-.6.6-1.1 1.7-1 2.6 1 .1 2-.5 2.9-1.3z"
                  />
                </svg>
                <span className="app-store-text">
                  <span className="app-store-soon">{SITE_COPY.comingSoon}</span>
                  <span className="app-store-name">App Store</span>
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="container footer-bottom">
        <p>{SITE_COPY.copyright}</p>
      </div>
    </footer>
  );
}
