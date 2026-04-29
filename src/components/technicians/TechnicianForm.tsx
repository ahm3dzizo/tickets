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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { techniciansApi, projectsApi, usersApi } from '@/lib/api';
import { Project, User, TicketType } from '@/types';
import { typeTranslations } from '@/components/tickets/TicketTable';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface TechnicianFormProps {
  trigger?: React.ReactNode;
  nativeButton?: boolean;
  technician?: any;
  onSaved?: () => void;
}

export function TechnicianForm({ trigger, nativeButton, technician, onSaved }: TechnicianFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(technician?.name || '');
  const [phone, setPhone] = useState(technician?.phoneNumber || technician?.phone || '');
  const [specialty, setSpecialty] = useState(technician?.specialty || 'general');
  const [projectId, setProjectId] = useState(technician?.projectId || '');
  const [supervisorId, setSupervisorId] = useState(technician?.supervisorId || '');
  const [projects, setProjects] = useState<Project[]>([]);
  const [supervisors, setSupervisors] = useState<User[]>([]);

  React.useEffect(() => {
    if (!open) return;
    Promise.all([projectsApi.getAll(), usersApi.getAll()])
      .then(([allProjects, allUsers]) => {
        setProjects(allProjects as Project[]);
        setSupervisors((allUsers as User[]).filter(u => u.role === 'supervisor'));
      })
      .catch(() => {});
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !projectId || !supervisorId) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name,
        phoneNumber: phone,
        specialty,
        projectId,
        supervisorId,
        createdAt: new Date().toISOString(),
      };

      if (technician?.id) {
        await techniciansApi.update(technician.id, payload);
        toast.success('تم تحديث بيانات الفني بنجاح');
      } else {
        await techniciansApi.create(payload);
        toast.success('تم إضافة الفني بنجاح');
      }

      setOpen(false);
      if (!technician) {
        setName('');
        setPhone('');
        setSpecialty('general');
        setProjectId('');
        setSupervisorId('');
      }
      onSaved?.();
    } catch (error) {
      console.error('Error adding technician:', error);
      const message = error instanceof Error ? error.message : 'فشل حفظ بيانات الفني';
      toast.error(message || 'فشل حفظ بيانات الفني');
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
            {technician ? 'تعديل بيانات الفني وتخصصه' : 'أدخل بيانات الفني وتخصصه المهني.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">المشروع</Label>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" />}>
                <Briefcase className="w-3 h-3 opacity-50" />
                <span>{projects.find(p => p.id === projectId)?.name || 'اختر المشروع'}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-border text-slate-200 w-64 max-h-60 overflow-y-auto">
                {projects.map((p) => (
                  <DropdownMenuItem key={p.id} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setProjectId(p.id)}>
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">المشرف المسؤول</Label>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" />}>
                <HardHat className="w-3 h-3 opacity-50" />
                <span>{supervisors.find(s => s.uid === supervisorId)?.displayName || 'اختر المشرف'}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-border text-slate-200 w-64 max-h-60 overflow-y-auto">
                {supervisors.map((s) => (
                  <DropdownMenuItem key={s.uid} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setSupervisorId(s.uid)}>
                    {s.displayName}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

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
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" />}
                className="w-full"
              >
                <Briefcase className="w-3 h-3 opacity-50" />
                <span>{typeTranslations[specialty as keyof typeof typeTranslations] || specialty || 'اختر التخصص'}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-border text-slate-200 min-w-[var(--radix-dropdown-menu-trigger-width)] max-h-60 overflow-y-auto" align="end">
                <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setSpecialty('general')}>عام</DropdownMenuItem>
                {(Object.keys(typeTranslations) as TicketType[]).map(t => (
                  <DropdownMenuItem key={t} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setSpecialty(t)}>
                    {typeTranslations[t]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <DialogFooter className="pt-4 gap-3">
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 rounded-xl h-12 font-bold shadow-lg shadow-blue-500/20 flex-1"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : technician ? 'تحديث الفني' : 'حفظ الفني'}
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
