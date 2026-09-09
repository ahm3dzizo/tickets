import { useEffect, useState } from 'react';
import { registerPush, isPushSupported, getPushPermission } from '@/lib/pushNotifications';

interface TechProfile {
  id: string;
  name: string;
  phone?: string;
  phoneNumber?: string;
  username?: string;
  specialty?: string;
  profileCompleted: boolean;
  language?: 'ar' | 'en' | 'hi' | 'ur';
  [key: string]: any;
}

function readStoredProfile(): TechProfile | null {
  try {
    const raw = localStorage.getItem('tech_profile');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as TechProfile : null;
  } catch {
    localStorage.removeItem('tech_profile');
    return null;
  }
}

function readStoredToken(): string | null {
  try { return localStorage.getItem('tech_token'); }
  catch { return null; }
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' && body.error.trim() ? body.error : fallback;
}

export function useTechAuth() {
  const [token, setToken] = useState<string | null>(readStoredToken);
  const [profile, setProfileState] = useState<TechProfile | null>(readStoredProfile);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const clearSession = () => {
    setToken(null);
    setProfileState(null);
    try {
      localStorage.removeItem('tech_token');
      localStorage.removeItem('tech_profile');
    } catch {}
  };

  const setProfile = (next: TechProfile | null) => {
    setProfileState(next);
    try {
      if (next) localStorage.setItem('tech_profile', JSON.stringify(next));
      else localStorage.removeItem('tech_profile');
      if (next?.language) localStorage.setItem('tech_language', next.language);
    } catch {}
  };

  useEffect(() => {
    let cancelled = false;

    async function verifyToken() {
      if (!token) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/tech/profile', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });

        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setProfile(data);
          return;
        }

        // 401/403 means the JWT is expired, invalid, the technician is disabled,
        // or the server no longer authorizes this account. Never keep stale PII
        // visible in that situation.
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) clearSession();
          return;
        }

        console.warn('[tech-auth] profile verification failed:', res.status);
      } catch (err) {
        // Network/offline failures are not authentication failures. Keep the
        // cached safe profile so the UI can show a proper connectivity state.
        console.warn('[tech-auth] profile verification network error:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void verifyToken();
    return () => { cancelled = true; };
  }, [token]);

  const login = async (phone: string, pin: string) => {
    const res = await fetch('/api/tech/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: phone.trim(), password: pin }),
    });

    if (!res.ok) {
      throw new Error(await readErrorMessage(res, 'Login failed'));
    }

    const data = await res.json();
    setToken(data.token);
    setProfile(data.technician);
    try { localStorage.setItem('tech_token', data.token); } catch {}

    // Best effort only. The profile page still exposes an explicit browser
    // notification enable button when permission has not been granted yet.
    if (isPushSupported() && getPushPermission() === 'granted') {
      registerPush(`Bearer ${data.token}`, true).catch(() => {});
    }

    return data;
  };

  const logout = () => {
    clearSession();
  };

  return { token, techProfile: profile, isLoading, login, logout, setProfile };
}
