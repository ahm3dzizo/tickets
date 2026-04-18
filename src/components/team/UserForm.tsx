import React, { useState, useEffect } from 'react';
import { 
  UserPlus, 
  Shield,
  Briefcase,
  Loader2,
  Mail,
  User as UserIcon,
  Hash,
  Phone
} from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { collection, onSnapshot, query, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase';
import { Project, UserRole } from '@/types';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

interface UserFormProps {
  trigger?: React.ReactNode;
  user?: any; // If editing
  nativeButton?: boolean;
}

export function UserForm({ trigger, user: editingUser, nativeButton }: UserFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(editingUser?.email || '');
  const [displayName, setDisplayName] = useState(editingUser?.displayName || '');
  const [employeeId, setEmployeeId] = useState(editingUser?.employeeId || '');
  const [phoneNumber, setPhoneNumber] = useState(editingUser?.phoneNumber || '');
  const [specialties, setSpecialties] = useState<string[]>(
    editingUser?.specialties ?? (editingUser?.specialty ? [editingUser.specialty] : ['general'])
  );

  const toggleSpecialty = (s: string) =>
    setSpecialties(prev =>
      prev.includes(s) ? (prev.length > 1 ? prev.filter(x => x !== s) : prev) : [...prev, s]
    );
  const [role, setRole] = useState<UserRole>(editingUser?.role || 'supervisor');
  const [selectedProjects, setSelectedProjects] = useState<string[]>(editingUser?.projectIds || []);
  
  const [projects, setProjects] = useState<Project[]>([]);

  const isCustomTrigger = !!trigger;

  useEffect(() => {
    const db = getFirestoreDb();
    const q = query(collection(db, 'projects'));
    return onSnapshot(q, (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      toast.error('يرجى إدخال الاسم الكامل');
      return;
    }
    if (!email.trim()) {
      toast.error('يرجى إدخال البريد الإلكتروني');
      return;
    }
    if (role !== 'admin' && selectedProjects.length === 0) {
      toast.error('يرجى اختيار مشروع واحد على الأقل من قائمة المشاريع');
      return;
    }

    setLoading(true);
    try {
      const db = getFirestoreDb();
      if (editingUser) {
        await updateDoc(doc(db, 'users', editingUser.id ?? editingUser.uid), {
          displayName,
          employeeId,
          phoneNumber,
          specialties,
          specialty: specialties[0], // keep legacy field in sync
          role,
          projectIds: selectedProjects
        });
        toast.success('تم تحديث بيانات المستخدم بنجاح');
      } else {
        // Create new user profile (pre-registration)
        const userRef = doc(collection(db, 'users'));
        await setDoc(userRef, {
          uid: userRef.id, // Temporary ID, will be linked on first login
          email,
          displayName,
          employeeId,
          phoneNumber,
          specialties,
          specialty: specialties[0], // keep legacy field in sync
          role,
          projectIds: selectedProjects,
          isPending: true,
          createdAt: new Date().toISOString()
        });
        toast.success('تم إضافة بيانات العضو بنجاح، سيتم تفعيل حسابه فور تسجيله بنفس البريد الإلكتروني.');
      }
      setOpen(false);
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('فشل تحديث بيانات المستخدم');
    } finally {
      setLoading(false);
    }
  };

  const toggleProject = (id: string) => {
    setSelectedProjects(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const roleTranslations: Record<UserRole, string> = {
    'admin': 'مدير النظام',
    'engineer': 'مهندس مشروع',
    'supervisor': 'مشرف'
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger 
        nativeButton={nativeButton ?? !isCustomTrigger}
        render={React.isValidElement(trigger) ? trigger : (
          <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-xl h-12 px-6 font-bold shadow-lg shadow-blue-500/20">
            <UserPlus className="w-5 h-5" />
            إضافة عضو
          </Button>
        )} 
      />
      <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[500px] rounded-3xl shadow-2xl shadow-black/40 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white text-right">
            {editingUser ? 'تعديل بيانات العضو' : 'إضافة عضو جديد'}
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-right">
            حدد الدور والتخصصات والمشاريع المسؤولة لهذا العضو.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">الاسم الكامل</Label>
            <div className="relative">
              <Input 
                placeholder="مثال: أحمد علي" 
                className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <UserIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">الرقم الوظيفي</Label>
            <div className="relative">
              <Input 
                placeholder="مثال: EMP001" 
                className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12 font-mono"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              />
              <Hash className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">البريد الإلكتروني</Label>
            <div className="relative">
              <Input 
                type="email"
                placeholder="name@example.com" 
                className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12 font-mono"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!!editingUser}
              />
              <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">الدور الوظيفي</Label>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" />}>
                <Shield className="w-3 h-3 opacity-50" />
                <span>{roleTranslations[role]}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-border text-slate-200 w-64">
                {(['admin', 'engineer', 'supervisor'] as UserRole[]).map((r) => (
                  <DropdownMenuItem key={r} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setRole(r)}>
                    {roleTranslations[r]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">
              التخصصات <span className="text-slate-600 normal-case">(يمكن اختيار أكثر من واحد)</span>
            </Label>
            <div className="flex flex-col gap-2">
              {([
                { value: 'mechanics',   label: 'ميكانيكا', icon: '🔧' },
                { value: 'electricity', label: 'كهرباء',   icon: '⚡' },
                { value: 'general',     label: 'عام',      icon: '🏠' },
              ] as const).map(({ value, label, icon }) => (
                <div
                  key={value}
                  onClick={() => toggleSpecialty(value)}
                  className={cn(
                    'flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition-all select-none',
                    specialties.includes(value)
                      ? 'bg-blue-500/10 border-blue-500/40 text-blue-300'
                      : 'bg-white/5 border-border text-slate-400 hover:border-slate-500'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span>{icon}</span>
                    <span className="font-bold text-sm">{label}</span>
                  </div>
                  <div className={cn(
                    'w-4 h-4 rounded border-2 flex items-center justify-center transition-all',
                    specialties.includes(value) ? 'bg-blue-500 border-blue-500' : 'border-slate-600'
                  )}>
                    {specialties.includes(value) && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest flex items-center justify-between">
              <span>
                المشاريع المسندة
                {role !== 'admin' && <span className="text-red-400 mr-1">*</span>}
              </span>
              {selectedProjects.length > 0 && (
                <span className="text-blue-400 text-[10px] font-bold bg-blue-500/10 px-2 py-0.5 rounded-full">
                  {selectedProjects.length} محدد
                </span>
              )}
            </Label>
            <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto p-2 bg-white/5 rounded-xl border border-border">
              {projects.map((p) => (
                <div 
                  key={p.id} 
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all",
                    selectedProjects.includes(p.id) ? "bg-blue-500/10 text-blue-400" : "hover:bg-white/5 text-slate-400"
                  )}
                  onClick={() => toggleProject(p.id)}
                >
                  <span className="text-xs font-bold">{p.name}</span>
                  {selectedProjects.includes(p.id) && <Briefcase className="w-3 h-3" />}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-white/5">
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">رقم الهاتف</Label>
              <div className="relative">
                <Input 
                  placeholder="05xxxxxxxx" 
                  className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
                <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 gap-3">
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 rounded-xl h-12 font-bold shadow-lg shadow-blue-500/20 flex-1"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : editingUser ? 'تحديث البيانات' : 'إضافة العضو'}
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
