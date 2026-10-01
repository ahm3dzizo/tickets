import { lazy, Suspense, useState, useEffect } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate
} from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
const TicketTypesAdminPage = lazy(() => import('./pages/TicketTypesAdminPage'));
const Images = lazy(() => import('@/pages/Images'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Login = lazy(() => import('@/pages/Login'));
const TicketsList = lazy(() => import('@/pages/TicketsList'));
const TicketDetail = lazy(() => import('@/pages/TicketDetailResponsive'));
const Team = lazy(() => import('@/pages/Team'));
const Settings = lazy(() => import('@/pages/Settings'));
const PushDiagnostics = lazy(() => import('@/pages/PushDiagnostics'));
const Projects = lazy(() => import('@/pages/Projects'));
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail'));
const Clients = lazy(() => import('@/pages/Clients'));
const Technicians = lazy(() => import('@/pages/Technicians'));
const TeamMemberDetail = lazy(() => import('@/pages/TeamMemberDetail'));
const Reports = lazy(() => import('@/pages/Reports'));
const AttendanceReport = lazy(() => import('@/pages/AttendanceReport'));
const Appointments = lazy(() => import('@/pages/Appointments'));
const Contractors = lazy(() => import('@/pages/Contractors'));
const ClientDetail = lazy(() => import('@/pages/ClientDetail'));
const ContractorDetail = lazy(() => import('@/pages/ContractorDetail'));
const Warehouse = lazy(() => import('@/pages/Warehouse'));
const WarehouseRequests = lazy(() => import('@/pages/WarehouseRequests'));
const UnitDetail = lazy(() => import('@/pages/UnitDetail'));
const Warranties = lazy(() => import('@/pages/Warranties'));
const TechLogin = lazy(() => import('@/pages/tech/TechLogin'));
const TechSetup = lazy(() => import('@/pages/tech/TechSetup'));
const TechAppWithRecovery = lazy(() => import('@/pages/tech/TechAppWithRecovery'));
const TechTicketDetail = lazy(() => import('@/pages/tech/TechTicketDetail'));
const TechHistory = lazy(() => import('@/pages/tech/TechHistory'));import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SocketProvider } from '@/contexts/SocketContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { ProfileCompletionModal } from '@/components/ProfileCompletionModal';
import { WhatsAppConnectPrompt } from '@/components/whatsapp/WhatsAppConnectPrompt';
import { WhatsAppAppPicker } from '@/components/whatsapp/WhatsAppAppPicker';

function RouteFallback() {
  return (
    <div className="flex min-h-[45vh] w-full items-center justify-center bg-background">
      <img src="/logo.png" alt="Tickets" className="h-20 w-20 object-contain animate-pulse" />
    </div>
  );
}

export default function App() {
  const isPublicImagesRoute =
    window.location.pathname === '/images' ||
    window.location.pathname.startsWith('/images/');

  if (isPublicImagesRoute) {
    return (
      <ErrorBoundary>
        <Router>
          <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background text-foreground selection:bg-primary/30">
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/images" element={<Images />} />
                <Route path="*" element={<Navigate to="/images" replace />} />
              </Routes>
            </Suspense>
            <Toaster position="top-right" />
          </div>
        </Router>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <SocketProvider>
          <AppContent />
        </SocketProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

function AppContent() {
  const {
    user,
    loading,
    requiresProfileCompletion,
    isFirstLogin,
    completeProfile,
  } = useAuth();
  const [showProfileModal, setShowProfileModal] = useState(false);

  useEffect(() => {
    setShowProfileModal(requiresProfileCompletion);
  }, [requiresProfileCompletion]);

  if (loading) {
    return (
      <div className="flex h-screen w-full max-w-full overflow-x-hidden items-center justify-center bg-background">
        <img src="/logo.png" alt="Tickets" className="w-40 h-40 object-contain animate-pulse" />
      </div>
    );
  }

  const handleProfileComplete = async (data: {
    displayName: string;
    phoneNumber: string;
    employeeId: string;
    idNumber: string;
    clothingSize: string;
    shoeSize: string;
    email?: string;
    password: string;
    photo?: File | null;
  }) => {
    try {
      await completeProfile(data);
      setShowProfileModal(false);
    } catch (error) {
      throw error;
    }
  };

  const protectedElement = (element: React.ReactNode) =>
    user && !requiresProfileCompletion ? element : <Navigate to="/login" />;

  return (
    <Router>
      <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background text-foreground selection:bg-primary/30">
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={user && !requiresProfileCompletion ? <Navigate to="/" /> : <Login />} />
          <Route path="/" element={protectedElement(<Dashboard />)} />
          <Route path="/tickets" element={protectedElement(<TicketsList />)} />
          <Route path="/projects" element={protectedElement(<Projects />)} />
          <Route path="/projects/:id" element={protectedElement(<ProjectDetail />)} />
          <Route path="/clients" element={protectedElement(<Clients />)} />
          <Route path="/technicians" element={protectedElement(<Technicians />)} />
          <Route path="/tickets/:id" element={protectedElement(<TicketDetail />)} />
          <Route path="/team" element={protectedElement(<Team />)} />
          <Route path="/team/:id" element={protectedElement(<TeamMemberDetail />)} />
          <Route path="/settings" element={protectedElement(<Settings />)} />
          <Route path="/push-test" element={protectedElement(<PushDiagnostics />)} />
          <Route path="/ticket-types" element={protectedElement(<TicketTypesAdminPage />)} />
          <Route path="/reports" element={protectedElement(<Reports />)} />
          <Route path="/reports/attendance" element={protectedElement(<AttendanceReport />)} />
          <Route path="/appointments" element={protectedElement(<Appointments />)} />
          <Route path="/contractors" element={protectedElement(<Contractors />)} />
          <Route path="/contractors/:id" element={protectedElement(<ContractorDetail />)} />
          <Route path="/clients/:id" element={protectedElement(<ClientDetail />)} />
          <Route path="/units/:id" element={protectedElement(<UnitDetail />)} />
          <Route path="/warranties" element={protectedElement(<Warranties />)} />
          <Route path="/warehouse" element={protectedElement(<Warehouse />)} />
          <Route path="/warehouse/requests" element={protectedElement(<WarehouseRequests />)} />

          <Route path="/tech/login" element={<TechLogin />} />
          <Route path="/tech/setup" element={<TechSetup />} />
          <Route path="/tech/ticket/:id" element={<TechTicketDetail />} />
          <Route path="/tech/history" element={<TechHistory />} />
          <Route path="/tech/appointments" element={<TechAppWithRecovery />} />
          <Route path="/tech/appointment/:id" element={<TechAppWithRecovery />} />
          <Route path="/tech" element={<TechAppWithRecovery />} />
        </Routes>
        </Suspense>
        <Toaster position="top-right" />
        <PWAInstallPrompt />
        <WhatsAppConnectPrompt />
        <WhatsAppAppPicker />

        {showProfileModal && (
          <ProfileCompletionModal
            open={showProfileModal}
            isFirstLogin={isFirstLogin}
            pendingUser={user ? {
              displayName: user.displayName,
              role: user.role,
              specialty: (user as any).specialty,
              phoneNumber: (user as any).phoneNumber,
              employeeId: (user as any).employeeId,
              idNumber: (user as any).idNumber,
              clothingSize: (user as any).clothingSize,
              shoeSize: (user as any).shoeSize,
              photoURL: (user as any).photoURL,
            } : null}
            onComplete={handleProfileComplete}
          />
        )}
      </div>
    </Router>
  );
}
