import { useState, useEffect } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate 
} from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';

import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
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
  const { user, loading, login, needsProfileCompletion } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950">
        <img
          src="/logo.jpg"
          alt="Retal"
          className="w-40 h-40 object-contain animate-pulse"
        />
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-orange-500/30">
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
          <Route path="/register" element={<Register />} />
          <Route 
            path="/" 
            element={user ? <Dashboard /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/tickets" 
            element={user ? <TicketsList /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/projects" 
            element={user ? <Projects /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/projects/:id" 
            element={user ? <ProjectDetail /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/clients" 
            element={user ? <Clients /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/technicians" 
            element={user ? <Technicians /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/tickets/:id" 
            element={user ? <TicketDetail /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/team" 
            element={user ? <Team /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/team/:id" 
            element={user ? <TeamMemberDetail /> : <Navigate to="/login" />} 
          />
          <Route 
            path="/settings" 
            element={user ? <Settings /> : <Navigate to="/login" />} 
          />
        </Routes>
        <Toaster position="top-right" theme="dark" />
        <PWAInstallPrompt />
        <ProfileCompletionModal open={needsProfileCompletion} />
      </div>
    </Router>
  );
}
