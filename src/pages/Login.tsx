import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mail, Phone, Lock, Eye, EyeOff, UserPlus, HelpCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type LoginMethod = 'email' | 'phone';

export default function Login() {
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('phone');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNewEmployee, setShowNewEmployee] = useState(false);
  const [showForgotPass, setShowForgotPass] = useState(false);
  const [forgotStep, setForgotStep] = useState<1|2>(1);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPass, setResetNewPass] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
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

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetIdentifier.trim()) {
      toast.error('يرجى إدخال رقم الهاتف');
      return;
    }
    setResetLoading(true);
    try {
      const res = await authApi.forgotPassword(resetIdentifier);
      toast.success(res.message);
      setForgotStep(2);
    } catch (error: any) {
      toast.error(error.message || 'فشل إرسال الكود');
    } finally {
      setResetLoading(false);
    }
  };

  const handleForgotVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode.trim() || !resetNewPass.trim()) {
      toast.error('يرجى إدخال الكود وكلمة المرور الجديدة');
      return;
    }
    if (resetNewPass.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
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
      setLoginMethod('phone');
    } catch (error: any) {
      toast.error(error.message || 'فشل تعيين كلمة المرور');
    } finally {
      setResetLoading(false);
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
              <img src="/logo.png" alt="Tickets" className="w-full h-full object-contain rounded-2xl" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
              <div className="w-2 h-2 rounded-full bg-white" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">Tickets</h1>
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
                  autoComplete={loginMethod === 'email' ? 'email' : 'tel'}
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

        {/* New employee + forgot password links */}
        <div className="flex items-center justify-between px-1">
          <button
            type="button"
            onClick={() => { setShowForgotPass(v => !v); setShowNewEmployee(false); }}
            className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground transition-colors flex items-center gap-1"
          >
            <HelpCircle className="w-3 h-3" />
            نسيت كلمة المرور؟
          </button>
          <button
            type="button"
            onClick={() => { setShowNewEmployee(v => !v); setShowForgotPass(false); }}
            className="text-[11px] text-primary/80 hover:text-primary transition-colors flex items-center gap-1 font-bold"
          >
            <UserPlus className="w-3 h-3" />
            موظف جديد؟
          </button>
        </div>

        {/* New employee info panel */}
        {showNewEmployee && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
              <button onClick={() => setShowNewEmployee(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              <p className="font-bold text-foreground text-sm flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-primary" />
                تسجيل موظف جديد
              </p>
            </div>
            <div className="text-right space-y-2 text-sm text-muted-foreground leading-relaxed">
              <p>إذا أضافك مدير النظام كموظف، يمكنك الدخول مباشرة:</p>
              <ol className="space-y-1 text-[12px]" dir="rtl">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">١</span>
                  <span>اختر <strong>رقم الهاتف</strong> واكتب رقمك المسجل لدى الشركة</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">٢</span>
                  <span>اكتب كلمة مرور جديدة تريد استخدامها — ستُحفظ تلقائياً</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">٣</span>
                  <span>أكمل بياناتك (الاسم والبريد) في الخطوة التالية</span>
                </li>
              </ol>
            </div>
          </div>
        )}

        {/* Forgot password panel */}
        {showForgotPass && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
              <button onClick={() => { setShowForgotPass(false); setForgotStep(1); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
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
