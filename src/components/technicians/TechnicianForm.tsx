import React, { useState } from 'react';
import { Plus, HardHat, Phone, Briefcase, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';

interface TechnicianFormProps {
  trigger?: React.ReactNode;
  nativeButton?: boolean;
}

export function TechnicianForm({ trigger, nativeButton }: TechnicianFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [specialty, setSpecialty] = useState('general');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'technicians'), {
        name,
        phone,
        specialty,
        createdAt: new Date().toISOString()
      });
      toast.success('تم إضافة الفني بنجاح');
      setOpen(false);
      setName('');
      setPhone('');
      setSpecialty('general');
    } catch (error) {
      console.error('Error adding technician:', error);
      toast.error('فشل إضافة الفني');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger 
        nativeButton={nativeButton ?? true}
        render={React.isValidElement(trigger) ? trigger : (
          <Button className="bg-[linear-gradient(135deg,#3b82f6_0%,#2563eb_100%)] hover:opacity-90 text-white gap-2 rounded-full px-6 h-11 shadow-lg shadow-blue-500/20 font-bold">
            <Plus className="w-4 h-4" />
            إضافة فني
          </Button>
        )} 
      />
      <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[400px] rounded-2xl shadow-2xl shadow-black/40">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white text-right">إضافة فني جديد</DialogTitle>
          <DialogDescription className="text-slate-500 text-right">
            أدخل بيانات الفني وتخصصه المهني.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">اسم الفني</Label>
            <div className="relative">
              <Input 
                placeholder="مثال: كومار" 
                className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <HardHat className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">رقم الهاتف</Label>
            <div className="relative">
              <Input 
                placeholder="05xxxxxxx" 
                className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12 font-mono"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
              <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">التخصص</Label>
            <div className="relative">
              <select 
                className="w-full pr-12 bg-white/5 border-border rounded-xl focus:ring-2 focus:ring-blue-500/20 text-white h-12 transition-all text-right appearance-none"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
              >
                <option value="mechanics" className="bg-slate-900">ميكانيكا</option>
                <option value="electricity" className="bg-slate-900">كهرباء</option>
                <option value="plumbing" className="bg-slate-900">سباكة</option>
                <option value="general" className="bg-slate-900">عام</option>
              </select>
              <Briefcase className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>
          </div>

          <DialogFooter className="pt-4 gap-3">
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 rounded-xl h-12 font-bold shadow-lg shadow-blue-500/20 flex-1"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ الفني'}
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              className="text-slate-500 hover:text-white rounded-xl h-12"
              onClick={() => setOpen(false)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
