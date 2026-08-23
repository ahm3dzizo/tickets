import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wrench, Loader2, Mail, Lock, User } from 'lucide-react';
import { toast } from 'sonner';
import { authApi, authStorage } from '@/lib/api';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await authApi.register({
        displayName: name,
        email,
        password,
      });
      authStorage.setToken(result.token);
      toast.success('تم إنشاء الحساب بنجاح');
      window.location.assign('/');
    } catch (error: any) {
      console.error(error);
      toast.error('فشل إنشاء الحساب. ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 selection:bg-blue-500/30 font-sans">
      <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-[linear-gradient(135deg,#3b82f6_0%,#2563eb_100%)] flex items-center justify-center shadow-2xl shadow-blue-500/20 mb-4">
            <Wrench className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black text-foreground tracking-tight">إنشاء حساب</h1>
          <p className="text-muted-foreground font-medium">انضم إلى نظام صيانة رتال اليوم</p>
        </div>

        <div className="bg-card/85 border border-border p-8 rounded-3xl backdrop-blur-xl shadow-2xl shadow-black/10">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-muted-foreground block text-right text-[10px] font-bold uppercase tracking-widest px-1">الاسم الكامل</Label>
              <div className="relative group">
                <Input 
                  placeholder="محمد أحمد" 
                  className="bg-background/70 border-border focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 text-foreground rounded-2xl h-14 pr-12 text-right transition-all"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <User className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground block text-right text-[10px] font-bold uppercase tracking-widest px-1">البريد الإلكتروني</Label>
              <div className="relative group">
                <Input 
                  type="email" 
                  placeholder="name@example.com" 
                  className="bg-background/70 border-border focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 text-foreground rounded-2xl h-14 pr-12 text-right transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground block text-right text-[10px] font-bold uppercase tracking-widest px-1">كلمة المرور</Label>
              <div className="relative group">
                <Input 
                  type="password" 
                  placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" 
                  className="bg-background/70 border-border focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 text-foreground rounded-2xl h-14 pr-12 text-right transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
              </div>
            </div>

            <Button 
              type="submit" 
              disabled={loading}
              className="w-full bg-[linear-gradient(135deg,#3b82f6_0%,#2563eb_100%)] hover:opacity-90 text-white rounded-2xl h-14 font-black shadow-lg shadow-blue-500/20 text-lg transition-all active:scale-[0.98]"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'إنشاء حساب جديد'}
            </Button>
          </form>

          <div className="mt-8 text-center text-sm">
            <span className="text-muted-foreground">لديك حساب بالفعل؟ </span>
            <Link to="/login" className="text-blue-400 font-bold hover:text-blue-300 transition-colors underline-offset-4 hover:underline">تسجيل الدخول</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
