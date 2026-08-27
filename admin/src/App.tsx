import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, isBranchUser, isDriverOnly, useAuth } from '@/auth/AuthContext';
import { AppLayout } from '@/layouts/AppLayout';
import { LoginPage } from '@/auth/LoginPage';
import { DriverPortalPage } from '@/features/drivers/DriverPortalPage';
import { BranchPosPage } from '@/features/branches/BranchPosPage';
import { BranchesPage } from '@/features/branches/BranchesPage';
import { TripoliDriversPage } from '@/features/drivers/TripoliDriversPage';
import { CompanyOrdersPage } from '@/features/delivery/CompanyOrdersPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { OrdersPage } from '@/features/orders/OrdersPage';
import { NewFacebookOrderPage } from '@/features/orders/NewFacebookOrderPage';
import { ProductsPage } from '@/features/products/ProductsPage';
import { CategoriesPage } from '@/features/products/CategoriesPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { InventoryPage } from '@/features/inventory/InventoryPage';
import { FacebookPagesPage } from '@/features/marketing/FacebookPagesPage';
import { DeliveryPage } from '@/features/delivery/DeliveryPage';
import { DeliveryPrintPage } from '@/features/delivery/DeliveryPrintPage';
import { PosInvoicePage } from '@/features/branches/PosInvoicePage';
import { ReturnsPage } from '@/features/returns/ReturnsPage';
import { ReservationsPage } from '@/features/reservations/ReservationsPage';
import { CommissionsPage } from '@/features/marketing/CommissionsPage';
import { BannersPage } from '@/features/marketing/BannersPage';
import { UsersPage } from '@/features/users/UsersPage';
import { MyPayrollPage } from '@/features/users/MyPayrollPage';
import { AuditPage } from '@/features/audit/AuditPage';
import { RegisterMarketerPage } from '@/features/marketing/RegisterMarketerPage';
import { DeliveryZonesPage } from '@/features/delivery/DeliveryZonesPage';

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="login-page">جارٍ التحميل...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (isDriverOnly(user)) return <Navigate to="/driver" replace />;
  if (isBranchUser(user)) return <Navigate to="/branch" replace />;
  return <>{children}</>;
}

function DriverGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="login-page">جارٍ التحميل...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function BranchGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="login-page">جارٍ التحميل...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isBranchUser(user)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AuthOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="login-page">جارٍ التحميل...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/driver/login" element={<Navigate to="/login" replace />} />
        <Route
          path="/driver"
          element={
            <DriverGate>
              <DriverPortalPage />
            </DriverGate>
          }
        />
        <Route
          path="/branch"
          element={
            <BranchGate>
              <BranchPosPage />
            </BranchGate>
          }
        />
        <Route path="/register-marketer" element={<RegisterMarketerPage />} />
        <Route
          path="/delivery/print"
          element={
            <Protected>
              <DeliveryPrintPage />
            </Protected>
          }
        />
        <Route
          path="/pos/invoice/:orderId"
          element={
            <AuthOnly>
              <PosInvoicePage />
            </AuthOnly>
          }
        />
        <Route
          path="/"
          element={
            <Protected>
              <AppLayout />
            </Protected>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/new" element={<NewFacebookOrderPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="branches" element={<BranchesPage />} />
          <Route path="reservations" element={<ReservationsPage />} />
          <Route path="returns" element={<ReturnsPage />} />
          <Route path="pos" element={<Navigate to="/branches" replace />} />
          <Route path="commissions" element={<CommissionsPage />} />
          <Route path="facebook-pages" element={<FacebookPagesPage />} />
          <Route path="delivery" element={<DeliveryPage />} />
          <Route path="delivery/company" element={<CompanyOrdersPage />} />
          <Route path="tripoli-drivers" element={<TripoliDriversPage />} />
          <Route path="delivery/zones" element={<DeliveryZonesPage />} />
          <Route path="banners" element={<BannersPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="my-payroll" element={<MyPayrollPage />} />
          <Route path="audit" element={<AuditPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
