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
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt';
import { ProfileCompletionModal } from '@/components/ProfileCompletionModal';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}

function AppContent() {
  const { user, loading, requiresProfileCompletion, completeProfile } = useAuth();
  const [showProfileModal, setShowProfileModal] = useState(false);

  useEffect(() => {
    setShowProfileModal(requiresProfileCompletion);
  }, [requiresProfileCompletion]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <img
          src="/logo.jpg"
          alt="Retal"
          className="w-40 h-40 object-contain animate-pulse"
        />
      </div>
    );
  }

  const handleProfileComplete = async (data: { displayName: string; email: string; password: string }) => {
    try {
      await completeProfile(data);
      setShowProfileModal(false);
      // المستخدم بقى نشط، التطبيق هيعمل re-render تلقائي
    } catch (error) {
      // الخطأ هيظهر جوه الموديول
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
          {/* ⛔️ تمت إزالة Route /register */}
        </Routes>
        <Toaster position="top-right" />
        <PWAInstallPrompt />
        
        {showProfileModal && (
          <ProfileCompletionModal 
            open={showProfileModal} 
            onComplete={handleProfileComplete}
          />
        )}
      </div>
    </Router>
  );
}