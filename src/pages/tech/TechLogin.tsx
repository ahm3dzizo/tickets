import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTechAuth } from '@/hooks/useTechAuth';
import { TechLang, t } from '@/i18n/tech';
import { Loader2, Eye, EyeOff, Lock, Phone } from 'lucide-react';
import { toast } from 'sonner';
import './tech.css';

const LANGUAGES = [
  { code: 'ar', label: '🇸🇦 عربي' },
  { code: 'en', label: 'EN' },
  { code: 'hi', label: 'हिंदी' },
  { code: 'ur', label: 'اردو' },
];

export default function TechLogin() {
  const [lang, setLang] = useState<TechLang>('ar');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const { login } = useTechAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || !pin) {
      toast.error(lang === 'ar' ? 'أدخل البيانات' : 'Enter credentials');
      return;
    }
    
    setLoading(true);
    try {
      const data = await login(phone, pin);
      // Profile completion check
      if (data.profile?.profileCompleted) {
        navigate('/tech');
      } else {
        navigate('/tech/setup');
      }
    } catch (err: any) {
      toast.error(err.message || (lang === 'ar' ? 'فشل تسجيل الدخول' : 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const isRtl = lang === 'ar' || lang === 'ur';

  return (
    <div className="tech-app" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Background elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/20 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-600/20 blur-[100px] pointer-events-none" />

      <div className="tech-container min-h-[100dvh] flex flex-col justify-center slide-up relative z-10">
        
        {/* Language selector */}
        <div className="flex justify-center gap-2 mb-8">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              className={`lang-btn ${lang === l.code ? 'active' : ''}`}
              onClick={() => setLang(l.code as TechLang)}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Logo area */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-24 h-24 tech-glass rounded-3xl p-4 mb-4 shadow-[0_0_40px_rgba(59,130,246,0.3)]">
            <img src="/icon.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t(lang, 'login')}</h1>
        </div>

        {/* Login form */}
        <form onSubmit={handleLogin} className="tech-glass rounded-3xl p-6 shadow-xl">
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-[var(--tech-text-muted)] mb-2 px-1">
                {t(lang, 'username')}
              </label>
              <div className="relative">
                <input
                  type="tel"
                  className="tech-input pl-10"
                  style={{ paddingLeft: isRtl ? '16px' : '40px', paddingRight: isRtl ? '40px' : '16px' }}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                />
                <Phone className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--tech-text-muted)] ${isRtl ? 'right-3' : 'left-3'}`} />
              </div>
            </div>

            <div>
              <label className="block text-sm text-[var(--tech-text-muted)] mb-2 px-1">
                {t(lang, 'password')}
              </label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  className="tech-input pl-10 pr-10"
                  style={{ paddingLeft: '40px', paddingRight: '40px' }}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  dir="ltr"
                />
                <Lock className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--tech-text-muted)] ${isRtl ? 'right-3' : 'left-3'}`} />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className={`absolute top-1/2 -translate-y-1/2 text-[var(--tech-text-muted)] ${isRtl ? 'left-3' : 'right-3'}`}
                >
                  {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="tech-btn tech-btn-primary mt-6 w-full text-lg"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : t(lang, 'loginBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
