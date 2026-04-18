import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Wrench, Loader2, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (error: any) {
      console.error(error);
      toast.error('فشل تسجيل الدخول. يرجى التحقق من البيانات.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 selection:bg-blue-500/30 font-sans">
      <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-16 h-16 rounded-2xl bg-[linear-gradient(135deg,#3b82f6_0%,#2563eb_100%)] flex items-center justify-center shadow-2xl shadow-blue-500/20 mb-4">
            <Wrench className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">MaintenanceFlow</h1>
          <p className="text-slate-500 font-medium">نظام إدارة تذاكر الصيانة الذكي</p>
        </div>

        <div className="bg-zinc-900/50 border border-white/5 p-8 rounded-3xl backdrop-blur-xl shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest px-1">البريد الإلكتروني</Label>
              <div className="relative group">
                <Input 
                  type="email" 
                  placeholder="name@example.com" 
                  className="bg-white/5 border-white/10 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 text-white rounded-2xl h-14 pr-12 text-right transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest px-1">كلمة المرور</Label>
              <div className="relative group">
                <Input 
                  type="password" 
                  placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" 
                  className="bg-white/5 border-white/10 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 text-white rounded-2xl h-14 pr-12 text-right transition-all"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
              </div>
            </div>

            <Button 
              type="submit" 
              disabled={loading}
              className="w-full bg-[linear-gradient(135deg,#3b82f6_0%,#2563eb_100%)] hover:opacity-90 text-white rounded-2xl h-14 font-black shadow-lg shadow-blue-500/20 text-lg transition-all active:scale-[0.98]"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'تسجيل الدخول'}
            </Button>
          </form>

          <div className="mt-8 text-center text-sm">
            <span className="text-slate-500">ليس لديك حساب؟ </span>
            <Link to="/register" className="text-blue-400 font-bold hover:text-blue-300 transition-colors underline-offset-4 hover:underline">إنشاء حساب جديد</Link>
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-700 font-bold uppercase tracking-[0.2em]">
          &copy; 2026 MaintenanceFlow. All rights reserved.
        </p>
      </div>
    </div>
  );
}
