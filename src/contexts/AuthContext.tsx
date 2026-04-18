import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { User, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      console.log('[Auth] onAuthStateChanged fired. uid:', firebaseUser?.uid ?? 'null', 'email:', firebaseUser?.email ?? 'null');

      // Always clean up previous profile listener first
      if (unsubscribeProfile) {
        console.log('[Auth] Cleaning up previous profile listener');
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (firebaseUser) {
        console.log('[Auth] Setting up onSnapshot for users/' + firebaseUser.uid);
        // Setup listener for real-time profile updates
        unsubscribeProfile = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (snapshot) => {
            console.log('[Auth] Snapshot received. exists:', snapshot.exists(), 'uid:', firebaseUser.uid);
            if (snapshot.exists()) {
              setUser({ ...(snapshot.data() as User), uid: firebaseUser.uid });
            } else {
              // Profile might not exist yet if just registered/imported
              console.warn('[Auth] No user doc found for uid:', firebaseUser.uid, '— using defaults');
              setUser({
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                displayName: firebaseUser.displayName || 'Unnamed User',
                role: 'engineer', // Default role
                projectIds: []
              });
            }
            setLoading(false);
          },
          (error) => {
            console.error('[Auth] onSnapshot error for users/' + firebaseUser.uid, 'code:', error.code, 'message:', error.message);
            console.error('[Auth] firebaseUser.uid:', firebaseUser.uid, 'email:', firebaseUser.email);
            // Fallback: use basic auth info so the app doesn't get stuck
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'Unnamed User',
              role: 'engineer',
              projectIds: []
            });
            setLoading(false);
          }
        );
      } else {
        console.log('[Auth] No firebaseUser — clearing user state');
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const login = async (email: string, pass: string) => {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const logout = async () => {
    await auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
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
