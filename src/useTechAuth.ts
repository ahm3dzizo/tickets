import { useState, useEffect } from 'react';

interface TechProfile {
  id: string;
  name: string;
  phone: string;
  specialty?: string;
  profileCompleted: boolean;
  lang?: 'ar' | 'en' | 'hi' | 'ur';
  [key: string]: any;
}

export function useTechAuth() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('tech_token'));
  const [profile, setProfile] = useState<TechProfile | null>(
    localStorage.getItem('tech_profile') ? JSON.parse(localStorage.getItem('tech_profile') as string) : null
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function verifyToken() {
      if (!token) {
        setIsLoading(false);
        return;
      }
      
      try {
        const res = await fetch('/api/tech/profile', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (res.ok) {
          const data = await res.json();
          setProfile(data.profile);
          localStorage.setItem('tech_profile', JSON.stringify(data.profile));
        } else {
          // Token invalid
          logout();
        }
      } catch (err) {
        console.error('Error verifying tech token', err);
      } finally {
        setIsLoading(false);
      }
    }
    
    verifyToken();
  }, [token]);

  const login = async (phone: string, pin: string) => {
    const res = await fetch('/api/tech/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phone, pin })
    });
    
    if (!res.ok) {
      throw new Error('Login failed');
    }
    
    const data = await res.json();
    setToken(data.token);
    setProfile(data.profile);
    localStorage.setItem('tech_token', data.token);
    localStorage.setItem('tech_profile', JSON.stringify(data.profile));
    
    return data;
  };

  const logout = () => {
    setToken(null);
    setProfile(null);
    localStorage.removeItem('tech_token');
    localStorage.removeItem('tech_profile');
  };

  return { token, techProfile: profile, isLoading, login, logout, setProfile };
}
