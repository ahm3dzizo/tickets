import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, authStorage, usersApi } from '../lib/api';
import '../lib/userProfilePhotoFix';
import { User } from '../types';

interface LoginResponse {
  token: string;
  user: User;
  requiresProfileCompletion?: boolean;
  isFirstLogin?: boolean;
}

interface CompleteProfileData {
  displayName: string;
  phoneNumber: string;
  employeeId: string;
  idNumber: string;
  clothingSize: string;
  shoeSize: string;
  email?: string;
  photo?: File | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  requiresProfileCompletion: boolean;
  isFirstLogin: boolean;
  login: (identifier: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  completeProfile: (data: CompleteProfileData) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUserProfile(profile: User | null | undefined): User | null {
  if (!profile) return null;

  const rawPhoto = typeof profile.photoURL === 'string' ? profile.photoURL.trim() : '';
  // blob: URLs are tab-local object URLs. Older Settings code persisted them,
  // which guarantees a broken image after the next reload. Hide that invalid
  // value and fall back to initials until the user saves a real uploaded photo.
  const photoURL = rawPhoto && !rawPhoto.startsWith('blob:') ? rawPhoto : undefined;

  return { ...profile, photoURL };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresProfileCompletion, setRequiresProfileCompletion] = useState(false);
  const [isFirstLogin, setIsFirstLogin] = useState(false);

  useEffect(() => {
    const onProfileUpdated = (event: Event) => {
      const next = normalizeUserProfile((event as CustomEvent<User>).detail);
      if (!next?.uid) return;
      setUser(current => current?.uid === next.uid ? next : current);
    };

    window.addEventListener('retal-user-profile-updated', onProfileUpdated);
    return () => window.removeEventListener('retal-user-profile-updated', onProfileUpdated);
  }, []);

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
        setUser(normalizeUserProfile(profile as User));
        setRequiresProfileCompletion(profile.profileCompleted === false);
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
      setUser(normalizeUserProfile(profile as User));
      setRequiresProfileCompletion(profile.profileCompleted === false);
    } catch {
      // keep existing user state
    }
  };

  const login = async (identifier: string, pass: string) => {
    const result = await authApi.login(identifier, pass) as LoginResponse;
    authStorage.setToken(result.token);
    setUser(normalizeUserProfile(result.user as User));

    const needsCompletion = result.requiresProfileCompletion ??
                           (result.user?.profileCompleted === false);
    setRequiresProfileCompletion(needsCompletion);
    setIsFirstLogin(result.isFirstLogin || false);
  };

  const logout = async () => {
    authStorage.clearToken();
    setUser(null);
    setRequiresProfileCompletion(false);
    setIsFirstLogin(false);
  };

  const completeProfile = async (data: CompleteProfileData) => {
    try {
      const result = await usersApi.completeProfile(data);

      if (result.token) {
        authStorage.setToken(result.token);
      }

      setUser(normalizeUserProfile(result.user as User));
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
