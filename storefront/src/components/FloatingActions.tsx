import { useEffect, useState } from 'react';
import { STORE_WHATSAPP_LINK } from '../data/siteContent';

export function FloatingActions() {
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 420);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="floating-actions" aria-label="إجراءات سريعة">
      {showTop ? (
        <button
          type="button"
          className="scroll-top-btn"
          aria-label="العودة للأعلى"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <span className="material-symbols-outlined">keyboard_arrow_up</span>
        </button>
      ) : null}
      <a
        className="whatsapp-fab"
        href={STORE_WHATSAPP_LINK}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="تواصلي عبر واتساب"
      >
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.11 17.34c-.28-.14-1.64-.81-1.9-.9-.25-.1-.44-.14-.62.14-.18.28-.71.9-.87 1.08-.16.18-.32.2-.6.07-.28-.14-1.17-.43-2.23-1.37-.82-.73-1.38-1.64-1.54-1.92-.16-.28-.02-.43.12-.57.13-.13.28-.32.42-.48.14-.16.18-.28.28-.46.1-.18.04-.35-.02-.49-.07-.14-.62-1.49-.85-2.04-.22-.53-.45-.46-.62-.47h-.53c-.18 0-.48.07-.73.35-.25.28-.96.94-.96 2.29s.98 2.65 1.12 2.83c.14.18 1.93 2.95 4.68 4.14.65.28 1.16.45 1.56.57.65.21 1.25.18 1.72.11.52-.08 1.64-.67 1.87-1.32.23-.65.23-1.2.16-1.32-.07-.11-.25-.18-.53-.32z"
          />
          <path
            fill="currentColor"
            d="M16.02 3C9.4 3 4.03 8.37 4.03 15c0 2.22.61 4.3 1.68 6.09L4 29l8.1-1.67A11.9 11.9 0 0 0 16.02 27C22.64 27 28 21.63 28 15S22.64 3 16.02 3zm0 21.82c-1.95 0-3.76-.57-5.29-1.55l-.38-.24-4.81.99 1.02-4.69-.25-.39A9.78 9.78 0 0 1 6.2 15c0-5.42 4.41-9.82 9.82-9.82 5.42 0 9.82 4.4 9.82 9.82 0 5.41-4.4 9.82-9.82 9.82z"
          />
        </svg>
      </a>
    </div>
  );
}
