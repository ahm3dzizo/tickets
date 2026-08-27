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
        <img
          src="/logo.png"
          alt="Tickets"
          className="w-40 h-40 object-contain animate-pulse"
        />
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

  return (
    <Router>
      <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
        <Routes>
          <Route path="/login" element={user && !requiresProfileCompletion ? <Navigate to="/" /> : <Login />} />
          <Route 
            path="/" 
            element={user && !requiresProfileCompletion ? <Dashboard /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/tickets" 
            element={user && !requiresProfileCompletion ? <TicketsList /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/projects" 
            element={user && !requiresProfileCompletion ? <Projects /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/projects/:id" 
            element={user && !requiresProfileCompletion ? <ProjectDetail /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/clients" 
            element={user && !requiresProfileCompletion ? <Clients /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/technicians" 
            element={user && !requiresProfileCompletion ? <Technicians /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/tickets/:id" 
            element={user && !requiresProfileCompletion ? <TicketDetail /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/team" 
            element={user && !requiresProfileCompletion ? <Team /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/team/:id" 
            element={user && !requiresProfileCompletion ? <TeamMemberDetail /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/settings" 
            element={user && !requiresProfileCompletion ? <Settings /> : <Navigate to="/login" />} 
          />
          <Route
            path="/ticket-types"
            element={user && !requiresProfileCompletion ? <TicketTypesAdminPage /> : <Navigate to="/login" />}
          />
          <Route
            path="/reports"
            element={user && !requiresProfileCompletion ? <Reports /> : <Navigate to="/login" />}
          />
          <Route
            path="/reports/attendance"
            element={user && !requiresProfileCompletion ? <AttendanceReport /> : <Navigate to="/login" />}
          />
          <Route
            path="/appointments"
            element={user && !requiresProfileCompletion ? <Appointments /> : <Navigate to="/login" />}
          />
          <Route
            path="/contractors"
            element={user && !requiresProfileCompletion ? <Contractors /> : <Navigate to="/login" />}
          />
          <Route
            path="/contractors/:id"
            element={user && !requiresProfileCompletion ? <ContractorDetail /> : <Navigate to="/login" />}
          />
          <Route
            path="/clients/:id"
            element={user && !requiresProfileCompletion ? <ClientDetail /> : <Navigate to="/login" />}
          />
          <Route
            path="/units/:id"
            element={user && !requiresProfileCompletion ? <UnitDetail /> : <Navigate to="/login" />}
          />

          <Route
            path="/warranties"
            element={user && !requiresProfileCompletion ? <Warranties /> : <Navigate to="/login" />}
          />
          <Route
            path="/warehouse"
            element={user && !requiresProfileCompletion ? <Warehouse /> : <Navigate to="/login" />}
          />
          <Route
            path="/warehouse/requests"
            element={user && !requiresProfileCompletion ? <WarehouseRequests /> : <Navigate to="/login" />}
          />
          {/* ⚡ Technician PWA Routes — independent auth */}
          <Route path="/tech/login" element={<TechLogin />} />
          <Route path="/tech/setup" element={<TechSetup />} />
          <Route path="/tech/ticket/:id" element={<TechTicketDetail />} />
          <Route path="/tech" element={<TechAppWithRecovery />} />
          {/* ⛔️ تمت إزالة Route /register */}
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