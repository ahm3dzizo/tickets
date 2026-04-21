import React, { useState } from 'react';
import { User as UserIcon, Hash, Phone, Loader2, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { usersApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Props {
  open: boolean;
}

export function ProfileCompletionModal({ open }: Props) {
  const { user, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState(
    user?.displayName && user.displayName !== 'Unnamed User' ? user.displayName : ''
  );
  const [employeeId, setEmployeeId] = useState(user?.employeeId || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) { toast.error('يرجى إدخال الاسم الكامل'); return; }
    if (!employeeId.trim() && !phoneNumber.trim()) {
      toast.error('يرجى إدخال الرقم الوظيفي أو رقم الهاتف على الأقل'); return;
    }

    setLoading(true);
    try {
      await usersApi.claimPending({
        displayName: displayName.trim(),
        employeeId: employeeId.trim() || undefined,
        phoneNumber: phoneNumber.trim() || undefined,
      });

      toast.success('تم تفعيل الحساب وربطه ببيانات العضو بنجاح');
      await refreshUser();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'حدث خطأ، يرجى المحاولة مرة أخرى';
      toast.error(message || 'حدث خطأ، يرجى المحاولة مرة أخرى');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="bg-card border-border text-card-foreground sm:max-w-[440px] rounded-3xl shadow-2xl shadow-black/20 p-6"
        showCloseButton={false}
      >
        <DialogHeader className="items-center text-center gap-3 pb-2">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/15 flex items-center justify-center">
            <ClipboardCheck className="w-7 h-7 text-blue-400" />
          </div>
          <div>
            <DialogTitle className="text-xl font-black text-foreground">أكمل بياناتك</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm mt-1">
              أدخل بياناتك لتفعيل حسابك كاملاً
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4 pt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground block text-right text-[10px] font-bold uppercase tracking-widest">
              الاسم الكامل <span className="text-red-400">*</span>
            </Label>
            <div className="relative">
              <Input
                placeholder="مثال: أحمد علي"
                className="bg-background/70 border-border focus:ring-2 focus:ring-blue-500/20 text-foreground rounded-xl h-12 text-right pr-11"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoFocus
              />
              <UserIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
          </div>

          {/* EmployeeId + Phone side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground block text-right text-[10px] font-bold uppercase tracking-widest">
                الرقم الوظيفي
              </Label>
              <div className="relative">
                <Input
                  placeholder="EMP001"
                  className="bg-background/70 border-border focus:ring-2 focus:ring-blue-500/20 text-foreground rounded-xl h-12 text-right pr-10 font-mono"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                />
                <Hash className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground block text-right text-[10px] font-bold uppercase tracking-widest">
                رقم الهاتف
              </Label>
              <div className="relative">
                <Input
                  placeholder="05xxxxxxxx"
                  className="bg-background/70 border-border focus:ring-2 focus:ring-blue-500/20 text-foreground rounded-xl h-12 text-right pr-10"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground text-right">
            * يكفي إدخال أحدهما — الرقم الوظيفي أو رقم الهاتف
          </p>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-12 font-black shadow-lg shadow-blue-500/20 mt-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ وبدء الاستخدام'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
