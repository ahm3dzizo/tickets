import { useState, useEffect } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate
} from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import TicketTypesAdminPage from './pages/TicketTypesAdminPage';
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';
import TicketsList from '@/pages/TicketsList';
import TicketDetail from '@/pages/TicketDetail';
import Team from '@/pages/Team';
import Settings from '@/pages/Settings';
import PushDiagnostics from '@/pages/PushDiagnostics';
import Projects from '@/pages/Projects';
import ProjectDetail from '@/pages/ProjectDetail';
import Clients from '@/pages/Clients';
import Technicians from '@/pages/Technicians';
import TeamMemberDetail from '@/pages/TeamMemberDetail';
import Reports from '@/pages/Reports';
import AttendanceReport from '@/pages/AttendanceReport';
import Appointments from '@/pages/Appointments';
import Contractors from '@/pages/Contractors';
import ClientDetail from '@/pages/ClientDetail';
import ContractorDetail from '@/pages/ContractorDetail';
import Warehouse from '@/pages/Warehouse';
import WarehouseRequests from '@/pages/WarehouseRequests';
import UnitDetail from '@/pages/UnitDetail';
import Warranties from '@/pages/Warranties';
import TechLogin from '@/pages/tech/TechLogin';
import TechSetup from '@/pages/tech/TechSetup';
import TechAppWithRecovery from '@/pages/tech/TechAppWithRecovery';
import TechTicketDetail from '@/pages/tech/TechTicketDetail';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { SocketProvider } from '@/contexts/SocketContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { ProfileCompletionModal } from '@/components/ProfileCompletionModal';
import { WhatsAppConnectPrompt } from '@/components/whatsapp/WhatsAppConnectPrompt';

export default function App() {
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
      <div className="flex items-center justify-center h-screen bg-background">
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
      <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
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
          <Route path="/tech" element={<TechAppWithRecovery />} />
        </Routes>
        <Toaster position="top-right" />
        <PWAInstallPrompt />
        <WhatsAppConnectPrompt />

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
