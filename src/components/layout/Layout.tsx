import React from 'react';
import { Navbar } from './Navbar';
import { WhatsAppBanner } from './WhatsAppBanner';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-2 border-border" />
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-dvh bg-background text-foreground font-sans selection:bg-primary/25">
      <WhatsAppBanner />
      <Navbar />
      {/* Desktop: right padding for sidebar (w-60 = 240px = 15rem)
          Mobile:  top padding for top bar + bottom padding for bottom nav */}
      <main className="
        pt-14 pb-28
        px-4 sm:px-5
        lg:pt-0 lg:pb-6 lg:pr-[264px] lg:pl-8
        print:p-0 print:m-0 print:block print:w-full
        min-h-dvh
      ">
        <div className="max-w-[1400px] py-6 lg:py-8 print:py-0 print:max-w-none page-in">
          {children}
        </div>
      </main>
    </div>
  );
}
