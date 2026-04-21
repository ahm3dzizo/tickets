import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Phone, Lock } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(identifier, password);
      // navigation handled by App route guard once onAuthStateChanged fires
    } catch (error: any) {
      console.error(error);
      toast.error('فشل تسجيل الدخول. يرجى التحقق من البيانات.');
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
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label className="text-muted-foreground block text-right text-[10px] font-bold uppercase tracking-widest px-1">البريد الإلكتروني أو رقم الموبايل</Label>
              <div className="relative group">
                <Input 
                  type="text"
                  inputMode="email"
                  placeholder="05xxxxxxxx أو name@example.com"
                  className="bg-background/70 border-border focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 text-foreground rounded-2xl h-14 pr-12 text-right transition-all"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
                <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-blue-500 transition-colors" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground block text-right text-[10px] font-bold uppercase tracking-widest px-1">كلمة المرور</Label>
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
            <span className="text-muted-foreground">ليس لديك حساب؟ </span>
            <Link to="/register" className="text-blue-400 font-bold hover:text-blue-300 transition-colors underline-offset-4 hover:underline">إنشاء حساب جديد</Link>
          </div>
        </div>

        <p className="text-center text-[10px] text-muted-foreground/70 font-bold uppercase tracking-[0.2em]">
          &copy; 2026 Retal Maintenance System. All rights reserved.
        </p>
      </div>
    </div>
  );
}
