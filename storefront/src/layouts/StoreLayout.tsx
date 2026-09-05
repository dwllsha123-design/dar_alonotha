import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useCart } from '../cart/CartContext';
import { AnnouncementBar } from '../components/layout/AnnouncementBar';
import { Header } from '../components/layout/Header';
import { MobileMenu } from '../components/layout/MobileMenu';
import { Footer } from '../components/layout/Footer';
import { BottomNav } from '../components/layout/BottomNav';
import { FloatingActions } from '../components/FloatingActions';
import { useStoreCategories } from '../hooks/useStoreCategories';

export function StoreLayout() {
  const { count } = useCart();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [cartPulse, setCartPulse] = useState(false);
  const categories = useStoreCategories();

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (count <= 0) return;
    setCartPulse(true);
    const t = window.setTimeout(() => setCartPulse(false), 600);
    return () => window.clearTimeout(t);
  }, [count]);

  return (
    <div className="page-shell">
      <AnnouncementBar />
      <Header compact={compact} onOpenMenu={() => setDrawerOpen(true)} cartPulse={cartPulse} />
      <MobileMenu open={drawerOpen} onClose={() => setDrawerOpen(false)} categories={categories} />
      <Outlet />
      <Footer />
      <BottomNav />
      <FloatingActions />
    </div>
  );
}
