import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom';
import { getStoredUser } from './api';
import { AdminShell } from './components/shell/AdminShell';
import { ConfirmDialogProvider } from './components/ConfirmDialogProvider';
import { LocalBusinessJsonLd } from './components/Seo';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

const LoginPage = lazy(() =>
  import('./pages/LoginPage').then(m => ({ default: m.LoginPage }))
);
const OverviewPage = lazy(() =>
  import('./pages/OverviewPage').then(m => ({ default: m.OverviewPage }))
);
const ForgotPasswordPage = lazy(() =>
  import('./pages/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage }))
);
const TasksPage = lazy(() =>
  import('./pages/TasksPage').then(m => ({ default: m.TasksPage }))
);
const ReportsPage = lazy(() =>
  import('./pages/ReportsPage').then(m => ({ default: m.ReportsPage }))
);
const SellerApplicationsPage = lazy(() =>
  import('./pages/SellerApplicationsPage').then(m => ({ default: m.SellerApplicationsPage }))
);
const RulesPage = lazy(() =>
  import('./pages/RulesPage').then(m => ({ default: m.RulesPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage }))
);
const GadgetsPage = lazy(() =>
  import('./pages/GadgetsPage').then(m => ({ default: m.GadgetsPage }))
);
const OrdersPage = lazy(() =>
  import('./pages/OrdersPage').then(m => ({ default: m.OrdersPage }))
);
const BackofficePage = lazy(() =>
  import('./pages/BackofficePage').then(m => ({ default: m.BackofficePage }))
);
const BuyersPage = lazy(() =>
  import('./pages/UsersPage').then(m => ({ default: m.BuyersPage }))
);
const SellersPage = lazy(() =>
  import('./pages/UsersPage').then(m => ({ default: m.SellersPage }))
);
const AdminsPage = lazy(() =>
  import('./pages/UsersPage').then(m => ({ default: m.AdminsPage }))
);
const AuctionsPage = lazy(() =>
  import('./pages/AuctionsPage').then(m => ({ default: m.AuctionsPage }))
);
const DisputesPage = lazy(() =>
  import('./pages/DisputesPage').then(m => ({ default: m.DisputesPage }))
);
const PaymentsPage = lazy(() =>
  import('./pages/PaymentsPage').then(m => ({ default: m.PaymentsPage }))
);
const PayoutsPage = lazy(() =>
  import('./pages/PayoutsPage').then(m => ({ default: m.PayoutsPage }))
);
const AuditPage = lazy(() =>
  import('./pages/AuditPage').then(m => ({ default: m.AuditPage }))
);
const SupportPage = lazy(() =>
  import('./pages/SupportPage').then(m => ({ default: m.SupportPage }))
);
const NotificationsPage = lazy(() =>
  import('./pages/NotificationsPage').then(m => ({
    default: m.NotificationsPage,
  }))
);
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage }))
);

function PageFallback() {
  return (
    <div className="grid min-h-[40vh] place-items-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = getStoredUser();
  const token = localStorage.getItem('gb_admin_token');
  if (!token || !user || user.role !== 'admin') {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

/**
 * /sellers is the seller accounts list. Admin notifications (/sellers?application=<id>) and the old
 * Seller KYB queue (/sellers?kyb=pending&seller=<user id>) open Seller applications instead.
 */
function SellersEntry() {
  const [params] = useSearchParams();
  const application = params.get('application');
  if (!application && params.get('kyb') !== 'pending') return <SellersPage />;
  const next = new URLSearchParams();
  if (application) next.set('application', application);
  else if (params.get('seller')) next.set('seller', params.get('seller')!);
  const qs = next.toString();
  return <Navigate to={`/sellers/applications${qs ? `?${qs}` : ''}`} replace />;
}

function Guard({ children }: { children: React.ReactNode }) {
  return (
    <RequireAdmin>
      <AdminShell>
        <Suspense fallback={<PageFallback />}>{children}</Suspense>
      </AdminShell>
    </RequireAdmin>
  );
}

export function App() {
  return (
    <TooltipProvider>
      <ConfirmDialogProvider>
        <LocalBusinessJsonLd />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/tasks" element={<Guard><TasksPage /></Guard>} />
            <Route path="/reports" element={<Guard><ReportsPage /></Guard>} />
            <Route path="/sellers/applications" element={<Guard><SellerApplicationsPage /></Guard>} />
            <Route path="/rules" element={<Guard><RulesPage /></Guard>} />
            <Route path="/settings" element={<Guard><SettingsPage /></Guard>} />
            <Route
              path="/"
              element={
                <Guard>
                  <OverviewPage />
                </Guard>
              }
            />
            <Route
              path="/gadgets"
              element={
                <Guard>
                  <GadgetsPage />
                </Guard>
              }
            />
            <Route
              path="/auctions"
              element={
                <Guard>
                  <AuctionsPage />
                </Guard>
              }
            />
            <Route
              path="/orders"
              element={
                <Guard>
                  <OrdersPage />
                </Guard>
              }
            />
            <Route
              path="/backoffice"
              element={
                <Guard>
                  <BackofficePage />
                </Guard>
              }
            />
            <Route
              path="/buyers"
              element={
                <Guard>
                  <BuyersPage />
                </Guard>
              }
            />
            <Route
              path="/sellers"
              element={
                <Guard>
                  <SellersEntry />
                </Guard>
              }
            />
            <Route
              path="/admins"
              element={
                <Guard>
                  <AdminsPage />
                </Guard>
              }
            />
            <Route path="/users" element={<Navigate to="/buyers" replace />} />
            <Route
              path="/support"
              element={
                <Guard>
                  <SupportPage />
                </Guard>
              }
            />
            <Route
              path="/disputes"
              element={
                <Guard>
                  <DisputesPage />
                </Guard>
              }
            />
            <Route
              path="/payments"
              element={
                <Guard>
                  <PaymentsPage />
                </Guard>
              }
            />
            <Route
              path="/payouts"
              element={
                <Guard>
                  <PayoutsPage />
                </Guard>
              }
            />
            <Route
              path="/notifications"
              element={
                <Guard>
                  <NotificationsPage />
                </Guard>
              }
            />
            <Route
              path="/audit"
              element={
                <Guard>
                  <AuditPage />
                </Guard>
              }
            />
            <Route path="/404" element={<NotFoundPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </ConfirmDialogProvider>
      <Toaster />
    </TooltipProvider>
  );
}
