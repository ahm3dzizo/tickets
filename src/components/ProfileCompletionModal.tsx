import React, { useState } from 'react';
import { Loader2, Mail, User, Lock, Eye, EyeOff, CheckCircle2, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const roleLabels: Record<string, string> = {
  admin:      'مدير النظام',
  engineer:   'مهندس مشروع',
  supervisor: 'مشرف',
  client:     'عميل',
};

const specialtyLabels: Record<string, string> = {
  mechanics:   'ميكانيكا',
  electricity: 'كهرباء',
  general:     'عام',
};

interface ProfileCompletionModalProps {
  open: boolean;
  pendingUser?: { displayName?: string; role?: string; specialty?: string; phoneNumber?: string } | null;
  onComplete: (data: { displayName: string; email: string; password: string }) => Promise<void>;
}

export function ProfileCompletionModal({ open, pendingUser, onComplete }: ProfileCompletionModalProps) {
  const [loading, setLoading]             = useState(false);
  const [displayName, setDisplayName]     = useState(pendingUser?.displayName || '');
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirmPass] = useState('');
  const [showPass, setShowPass]           = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);

  if (!open) return null;

  const role      = pendingUser?.role      || 'engineer';
  const specialty = pendingUser?.specialty || '';
  const roleLabel = roleLabels[role] ?? role;
  const spLabel   = specialtyLabels[specialty] ?? specialty;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) { toast.error('يرجى إدخال الاسم الكامل'); return; }
    if (!email.includes('@')) { toast.error('يرجى إدخال بريد إلكتروني صحيح'); return; }
    if (password.length < 6)  { toast.error('كلمة المرور 6 أحرف على الأقل'); return; }
    if (password !== confirmPassword) { toast.error('كلمتا المرور غير متطابقتان'); return; }

    setLoading(true);
    try {
      await onComplete({ displayName: displayName.trim(), email: email.trim().toLowerCase(), password });
      toast.success('مرحباً بك! تم تفعيل حسابك بنجاح');
    } catch (err: any) {
      toast.error(err.message || 'حدث خطأ أثناء حفظ البيانات');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6 space-y-3">
          <div className="relative">
            <div className="w-16 h-16 rounded-[1.5rem] bg-white dark:bg-card border border-border shadow-xl p-2.5">
              <img src="/logo.jpg" alt="Retal" className="w-full h-full object-contain rounded-xl" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
              <CheckCircle2 className="w-3.5 h-3.5 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground">أكمل تسجيلك</h1>
            <p className="text-muted-foreground text-sm mt-0.5">تم إضافتك من قبل مدير النظام</p>
          </div>
        </div>

        {/* Role badge */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-2">
            <Briefcase className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm font-bold text-primary">{roleLabel}</span>
            {spLabel && (
              <>
                <span className="text-primary/40">·</span>
                <span className="text-sm text-primary/70">{spLabel}</span>
              </>
            )}
          </div>
        </div>

        {/* Form card */}
        <div className="bg-card border border-border rounded-3xl shadow-2xl shadow-black/10 p-6 space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest block text-right px-1">
                الاسم الكامل
              </label>
              <div className="relative group">
                <Input
                  placeholder="محمد أحمد"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="h-12 rounded-2xl pr-11 text-right bg-muted/50 border-transparent focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
                  required
                />
                <User className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest block text-right px-1">
                البريد الإلكتروني
              </label>
              <div className="relative group">
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="h-12 rounded-2xl pr-11 text-right bg-muted/50 border-transparent focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
                  required
                />
                <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest block text-right px-1">
                كلمة المرور
              </label>
              <div className="relative group">
                <Input
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-12 rounded-2xl pr-11 pl-11 text-right bg-muted/50 border-transparent focus:border-primary/40 focus:ring-3 focus:ring-primary/10"
                  required
                />
                <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground/70 text-right px-1">6 أحرف على الأقل</p>
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-muted-foreground uppercase tracking-widest block text-right px-1">
                تأكيد كلمة المرور
              </label>
              <div className="relative group">
                <Input
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="••••••••••"
                  value={confirmPassword}
                  onChange={e => setConfirmPass(e.target.value)}
                  className={cn(
                    'h-12 rounded-2xl pr-11 pl-11 text-right bg-muted/50 border-transparent focus:border-primary/40 focus:ring-3 focus:ring-primary/10',
                    confirmPassword && password !== confirmPassword && 'border-red-500/50 focus:border-red-500/50'
                  )}
                  required
                />
                <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-[10px] text-red-400 text-right px-1">كلمتا المرور غير متطابقتان</p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black shadow-lg shadow-primary/25 text-base transition-all active:scale-[0.98] mt-2"
            >
              {loading
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : 'تفعيل الحساب والدخول'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
