import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mail, Phone, Lock, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type LoginMethod = 'email' | 'phone';

export default function Login() {
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('phone');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, isFirstLogin } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      toast.error(`يرجى إدخال ${loginMethod === 'email' ? 'البريد الإلكتروني' : 'رقم الهاتف'} وكلمة المرور`);
      return;
    }
    if (loginMethod === 'email' && !identifier.includes('@')) {
      toast.error('يرجى إدخال بريد إلكتروني صحيح');
      return;
    }
    setLoading(true);
    try {
      await login(identifier, password);
    } catch (error: any) {
      toast.error(error.message || 'فشل تسجيل الدخول. يرجى التحقق من البيانات.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-4 selection:bg-primary/25 font-sans">
      {/* Background decorations */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 w-72 h-72 bg-primary/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm space-y-6 animate-in fade-in zoom-in-95 duration-500 relative">

        {/* Logo + Title */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative">
            <div className="w-20 h-20 rounded-[1.75rem] bg-white dark:bg-card border border-border shadow-xl shadow-primary/10 p-3 backdrop-blur-sm">
              <img src="/logo.jpg" alt="Retal" className="w-full h-full object-contain rounded-2xl" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">نظام ريتال</h1>
            <p className="text-muted-foreground text-sm mt-0.5 font-medium">إدارة تذاكر الصيانة</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-3xl shadow-xl shadow-black/5 overflow-hidden">
          {/* Method tabs */}
          <div className="flex border-b border-border">
            {(['phone', 'email'] as LoginMethod[]).map(method => (
              <button
                key={method}
                type="button"
                onClick={() => { setLoginMethod(method); setIdentifier(''); }}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-4 text-sm font-bold transition-all duration-200 border-b-2',
                  loginMethod === method
                    ? 'text-primary border-primary bg-primary/4'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50'
                )}
              >
                {method === 'phone' ? <Phone className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                {method === 'phone' ? 'رقم الهاتف' : 'البريد الإلكتروني'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Identifier field */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest block text-right px-1">
                {loginMethod === 'email' ? 'البريد الإلكتروني' : 'رقم الهاتف'}
              </label>
              <div className="relative group">
                <Input
                  type={loginMethod === 'email' ? 'email' : 'tel'}
                  inputMode={loginMethod === 'email' ? 'email' : 'tel'}
                  placeholder={loginMethod === 'email' ? 'name@example.com' : '05xxxxxxxx'}
                  className="h-12 rounded-2xl pr-11 text-right bg-muted/50 border-transparent focus:border-primary/40 focus:bg-card focus:ring-3 focus:ring-primary/10 transition-all"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  required
                />
                {loginMethod === 'email'
                  ? <Mail    className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  : <Phone   className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />}
              </div>
              <p className="text-[10px] text-muted-foreground/70 text-right px-1">
                {loginMethod === 'email'
                  ? 'مدير النظام والمهندسون يسجلون بالبريد الإلكتروني'
                  : 'العملاء يسجلون برقم الهاتف المسجل لديك'}
              </p>
            </div>

            {/* Password field */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest block text-right px-1">
                كلمة المرور
              </label>
              <div className="relative group">
                <Input
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  className="h-12 rounded-2xl pr-11 pl-11 text-right bg-muted/50 border-transparent focus:border-primary/40 focus:bg-card focus:ring-3 focus:ring-primary/10 transition-all"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {loginMethod === 'phone' && isFirstLogin && (
                <p className="text-[10px] text-amber-500/90 text-right px-1 font-medium">
                  أول مرة تسجل؟ اختر كلمة مرور قوية — ستكون كلمتك الدائمة
                </p>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black shadow-lg shadow-primary/25 text-base transition-all active:scale-[0.98] mt-2"
            >
              {loading
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : 'تسجيل الدخول'}
            </Button>
          </form>
        </div>

        <p className="text-center text-[10px] text-muted-foreground/60 font-bold uppercase tracking-[0.2em]">
          &copy; 2026 Retal Maintenance System
        </p>
      </div>
    </div>
  );
}
