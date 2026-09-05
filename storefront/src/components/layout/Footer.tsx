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
        </div>
      </div>
      <div className="container footer-bottom">
        <p>{SITE_COPY.copyright}</p>
      </div>
    </footer>
  );
}
