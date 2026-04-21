import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, authStorage, usersApi } from '../lib/api';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  needsProfileCompletion: boolean;
  login: (identifier: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bootstrapAuth = async () => {
      const token = authStorage.getToken();
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const profile = await usersApi.getMe();
        setUser(profile as User);
      } catch {
        authStorage.clearToken();
        setUser(null);
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
    } catch {
      // keep existing user state
    }
  };

  const login = async (identifier: string, pass: string) => {
    const result = await authApi.login(identifier, pass);
    authStorage.setToken(result.token);
    setUser(result.user as User);
  };

  const logout = async () => {
    authStorage.clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      needsProfileCompletion: !!(user && !user.profileCompleted && !user.employeeId && !user.phoneNumber),
      login,
      logout,
      refreshUser,
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
