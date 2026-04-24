import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, authStorage, usersApi } from '../lib/api';
import { User } from '../types';

interface LoginResponse {
  token: string;
  user: User;
  requiresProfileCompletion?: boolean;
  isFirstLogin?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  requiresProfileCompletion: boolean;
  isFirstLogin: boolean;
  login: (identifier: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  completeProfile: (data: { displayName: string; email: string; password: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresProfileCompletion, setRequiresProfileCompletion] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);

  useEffect(() => {
    const bootstrapAuth = async () => {
      const token = authStorage.getToken();
      if (!token) {
        setUser(null);
        setRequiresProfileCompletion(false);
        setIsFirstLogin(false);
        setLoading(false);
        return;
      }

      try {
        const profile = await usersApi.getMe();
        setUser(profile as User);
        
        const isPending = profile.uid?.startsWith('pending_') || false;
        setRequiresProfileCompletion(isPending);
      } catch {
        authStorage.clearToken();
        setUser(null);
        setRequiresProfileCompletion(false);
        setIsFirstLogin(false);
      } finally {
        setLoading(false);
      }
    };

    bootstrapAuth();
  }, []);

  const refreshUser = async () => {
    if (!authStorage.getToken()) return;
    try {
      const profile = await usersApi.getMe();
      setUser(profile as User);
      
      const isPending = profile.uid?.startsWith('pending_') || false;
      setRequiresProfileCompletion(isPending);
    } catch {
      // keep existing user state
    }
  };

  const login = async (identifier: string, pass: string) => {
    const result = await authApi.login(identifier, pass) as LoginResponse;
    authStorage.setToken(result.token);
    setUser(result.user as User);
    
    const needsCompletion = result.requiresProfileCompletion ?? 
                           (result.user?.uid?.startsWith('pending_') || false);
    setRequiresProfileCompletion(needsCompletion);
    setIsFirstLogin(result.isFirstLogin || false);
  };

  const logout = async () => {
    authStorage.clearToken();
    setUser(null);
    setRequiresProfileCompletion(false);
    setIsFirstLogin(false);
  };

  const completeProfile = async (data: { displayName: string; email: string; password: string }) => {
    try {
      const result = await usersApi.completeProfile(data);
      
      if (result.token) {
        authStorage.setToken(result.token);
      }
      
      setUser(result.user as User);
      setRequiresProfileCompletion(false);
      setIsFirstLogin(false);
    } catch (error) {
      console.error('Failed to complete profile:', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      requiresProfileCompletion,
      isFirstLogin,
      login,
      logout,
      refreshUser,
      completeProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}