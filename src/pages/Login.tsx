import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, Phone, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type LoginMethod = 'email' | 'phone';

export default function Login() {
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('phone');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isFirstLogin } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!identifier.trim() || !password.trim()) {
      toast.error(`يرجى إدخال ${loginMethod === 'email' ? 'البريد الإلكتروني' : 'رقم الهاتف'} وكلمة المرور`);
      return;
    }

    // ✨ التحقق من صيغة الإيميل
    if (loginMethod === 'email' && !identifier.includes('@')) {
      toast.error('يرجى إدخال بريد إلكتروني صحيح');
      return;
    }

    setLoading(true);
    try {
      await login(identifier, password);
    } catch (error: any) {
      console.error(error);
      const errorMessage = error.message || 'فشل تسجيل الدخول. يرجى التحقق من البيانات.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 selection:bg-blue-500/30 font-sans">
      <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-24 h-24 rounded-[2rem] bg-white/80 border border-border shadow-2xl shadow-blue-500/10 p-3 mb-3 backdrop-blur-sm">
            <img src="/logo.jpg" alt="Retal" className="w-full h-full object-contain rounded-[1.4rem]" />
          </div>
          <h1 className="text-3xl font-black text-foreground tracking-tight">Retal Maintenance System</h1>
          <p className="text-muted-foreground font-medium">منصة إدارة تذاكر الصيانة والتشغيل</p>
        </div>

        <div className="bg-card/85 border border-border p-8 rounded-3xl backdrop-blur-xl shadow-2xl shadow-black/10">
          {/* ✨ تبويب اختيار طريقة تسجيل الدخول */}
          <div className="flex gap-2 mb-6 bg-background/50 p-1 rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setLoginMethod('phone');
                setIdentifier('');
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all",
                loginMethod === 'phone'
                  ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <Phone className="w-4 h-4" />
              رقم الهاتف
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginMethod('email');
                setIdentifier('');
              }}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all",
                loginMethod === 'email'
                  ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              )}
            >
              <Mail className="w-4 h-4" />
              البريد الإلكتروني
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-muted-foreground block text-right text-[10px] font-bold uppercase tracking-widest px-1">
                {loginMethod === 'email' ? 'البريد الإلكتروني' : 'رقم الهاتف'}
              </Label>
              <div className="relative group">
                <Input 
                  type={loginMethod === 'email' ? 'email' : 'tel'}
                  inputMode={loginMethod === 'email' ? 'email' : 'tel'}
                  placeholder={loginMethod === 'email' ? 'name@example.com' : '05xxxxxxxx'}
                  className="bg-background/70 border-border focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 text-foreground rounded-2xl h-14 pr-12 text-right transition-all"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
                {loginMethod === 'email' ? (
                  <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
                ) : (
                  <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/70 text-right px-1">
                {loginMethod === 'email' 
                  ? 'مدير النظام أو المهندسين يسجلوا بالبريد الإلكتروني'
                  : 'العملاء يسجلوا برقم الهاتف المسجل لدى مدير النظام'}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground block text-right text-[10px] font-bold uppercase tracking-widest px-1">
                كلمة المرور
              </Label>
              <div className="relative group">
                <Input 
                  type="password" 
                  placeholder="**************" 
                  className="bg-background/70 border-border focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 text-foreground rounded-2xl h-14 pr-12 text-right transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
              </div>
              <p className="text-[10px] text-muted-foreground/70 text-right px-1">
                {loginMethod === 'phone' && isFirstLogin 
                  ? 'أول مرة تسجل؟ اختر كلمة مرور قوية - هتكون كلمة مرورك الدائمة'
                  : 'أدخل كلمة المرور الخاصة بك'}
              </p>
            </div>

            <Button 
              type="submit" 
              disabled={loading}
              className="w-full bg-[linear-gradient(135deg,#3b82f6_0%,#2563eb_100%)] hover:opacity-90 text-white rounded-2xl h-14 font-black shadow-lg shadow-blue-500/20 text-lg transition-all active:scale-[0.98]"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'تسجيل الدخول'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground">
              {loginMethod === 'email' 
                ? 'الدخول مخصص للموظفين فقط'
                : 'أول مرة تسجل؟ مدير النظام هيضيف حسابك الأول'}
            </p>
          </div>
        </div>

        <p className="text-center text-[10px] text-muted-foreground/70 font-bold uppercase tracking-[0.2em]">
          &copy; 2026 Retal Maintenance System. All rights reserved.
        </p>
      </div>
    </div>
  );
}