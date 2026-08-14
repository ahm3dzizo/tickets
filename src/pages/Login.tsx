import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Phone, Lock, Eye, EyeOff, HelpCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTechAuth } from '@/hooks/useTechAuth';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [identifier, setIdentifier]   = useState('');
  const [password, setPassword]       = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [showForgotPass, setShowForgotPass] = useState(false);
  const [forgotStep, setForgotStep]   = useState<1|2>(1);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetCode, setResetCode]     = useState('');
  const [resetNewPass, setResetNewPass] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const { login }           = useAuth();
  const { login: techLogin } = useTechAuth();
  const navigate             = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id  = identifier.trim();
    const pwd = password.trim();
    if (!id || !pwd) {
      toast.error('يرجى إدخال رقم الهاتف وكلمة المرور');
      return;
    }
    setLoading(true);
    try {
      // ── 1. جرّب الـ regular auth أولاً ─────────────────────────
      await login(id, pwd);
      console.info('[Login] regular auth success');
      // AuthContext/router هيتولى التوجيه
    } catch (regularErr: any) {
      console.warn('[Login] regular auth failed, trying tech auth…', regularErr?.message);
      // ── 2. لو فشل جرّب الـ tech auth ───────────────────────────
      try {
        const data = await techLogin(id, pwd);
        console.info('[Login] tech auth success', data?.profile?.name);
        if (data?.profile?.profileCompleted) {
          navigate('/tech');
        } else {
          navigate('/tech/setup');
        }
      } catch (techErr: any) {
        console.warn('[Login] tech auth also failed', techErr?.message);
        toast.error('رقم الهاتف أو كلمة المرور غير صحيحة');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetIdentifier.trim()) { toast.error('يرجى إدخال رقم الهاتف'); return; }
    setResetLoading(true);
    try {
      const res = await authApi.forgotPassword(resetIdentifier);
      toast.success(res.message);
      setForgotStep(2);
    } catch (err: any) {
      toast.error(err.message || 'فشل إرسال الكود');
    } finally { setResetLoading(false); }
  };

  const handleForgotVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode.trim() || !resetNewPass.trim()) { toast.error('يرجى إدخال الكود وكلمة المرور الجديدة'); return; }
    if (resetNewPass.length < 6) { toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    setResetLoading(true);
    try {
      const res = await authApi.resetPassword(resetIdentifier, resetCode, resetNewPass);
      toast.success(res.message);
      setShowForgotPass(false);
      setForgotStep(1);
      setResetCode('');
      setResetNewPass('');
      setIdentifier(resetIdentifier);
      setPassword(resetNewPass);
    } catch (err: any) {
      toast.error(err.message || 'فشل تعيين كلمة المرور');
    } finally { setResetLoading(false); }
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col items-center justify-center p-4 selection:bg-primary/25 font-sans">
      {/* خلفية */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 w-72 h-72 bg-primary/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm space-y-6 animate-in fade-in zoom-in-95 duration-500 relative">

        {/* لوجو */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative">
            <div className="w-20 h-20 rounded-[1.75rem] bg-white dark:bg-card border border-border shadow-xl shadow-primary/10 p-3 backdrop-blur-sm">
              <img src="/icon.png" alt="Tickets" className="w-full h-full object-contain rounded-2xl" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Tickets</h1>
            <p className="text-muted-foreground text-sm mt-0.5 font-medium">نظام إدارة الصيانة</p>
          </div>
        </div>

        {/* الكارد */}
        <div className="bg-card border border-border rounded-3xl shadow-xl shadow-black/5 overflow-hidden">
          <form onSubmit={handleSubmit} className="p-6 space-y-4">

            {/* رقم الهاتف */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest block text-right px-1">
                رقم الهاتف
              </label>
              <div className="relative group">
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="05xxxxxxxx"
                  className="h-12 rounded-2xl pr-11 text-right bg-muted/50 border-transparent focus:border-primary/40 focus:bg-card focus:ring-3 focus:ring-primary/10 transition-all"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  required
                />
                <Phone className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              </div>
            </div>

            {/* كلمة المرور */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest block text-right px-1">
                كلمة المرور
              </label>
              <div className="relative group">
                <Input
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
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
            </div>

            {/* زر الدخول */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black shadow-lg shadow-primary/25 text-base transition-all active:scale-[0.98] mt-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'تسجيل الدخول'}
            </Button>
          </form>
        </div>

        {/* نسيت كلمة المرور */}
        <div className="flex items-center justify-center px-1">
          <button
            type="button"
            onClick={() => setShowForgotPass(v => !v)}
            className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground transition-colors flex items-center gap-1"
          >
            <HelpCircle className="w-3 h-3" />
            نسيت كلمة المرور؟
          </button>
        </div>

        {/* باني استعادة كلمة المرور */}
        {showForgotPass && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
              <button onClick={() => { setShowForgotPass(false); setForgotStep(1); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
              <p className="font-bold text-amber-500 text-sm flex items-center gap-2">
                <HelpCircle className="w-4 h-4" />
                استعادة كلمة المرور
              </p>
            </div>
            {forgotStep === 1 ? (
              <form onSubmit={handleForgotRequest} className="space-y-3">
                <p className="text-right text-[12px] text-muted-foreground">أدخل رقم الهاتف المسجل لتصلك رسالة واتساب بكود الاستعادة.</p>
                <Input
                  type="tel"
                  placeholder="رقم الهاتف (مثال: 05xxxxxxxx)"
                  className="h-10 text-right bg-background border-amber-500/20 focus:border-amber-500/40"
                  value={resetIdentifier}
                  onChange={e => setResetIdentifier(e.target.value)}
                  required
                />
                <Button type="submit" disabled={resetLoading} className="w-full h-10 bg-amber-500 hover:bg-amber-600 text-white shadow-none">
                  {resetLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إرسال الكود'}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleForgotVerify} className="space-y-3">
                <p className="text-right text-[12px] text-muted-foreground">أدخل الكود المرسل إليك وكلمة المرور الجديدة.</p>
                <Input
                  type="text"
                  placeholder="كود الاستعادة (6 أرقام)"
                  className="h-10 text-center tracking-widest font-bold bg-background border-amber-500/20 focus:border-amber-500/40"
                  value={resetCode}
                  onChange={e => setResetCode(e.target.value)}
                  maxLength={6}
                  required
                />
                <Input
                  type="password"
                  placeholder="كلمة المرور الجديدة (6 أحرف على الأقل)"
                  className="h-10 text-right bg-background border-amber-500/20 focus:border-amber-500/40"
                  value={resetNewPass}
                  onChange={e => setResetNewPass(e.target.value)}
                  required
                />
                <Button type="submit" disabled={resetLoading} className="w-full h-10 bg-amber-500 hover:bg-amber-600 text-white shadow-none">
                  {resetLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ كلمة المرور'}
                </Button>
                <button type="button" onClick={() => setForgotStep(1)} className="w-full text-[11px] text-muted-foreground hover:text-foreground">
                  تعديل رقم الهاتف
                </button>
              </form>
            )}
          </div>
        )}

        <p className="text-center text-[10px] text-muted-foreground/60 font-bold uppercase tracking-[0.2em]">
          &copy; 2026 Tickets Maintenance System
        </p>
      </div>
    </div>
  );
}
