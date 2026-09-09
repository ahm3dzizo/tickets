import React, { useState, useMemo } from 'react';
import { Plus, HardHat, Phone, Briefcase, Loader2, Hash, CreditCard, Shirt, Footprints } from 'lucide-react';
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
import { Project } from '@/types';
import { typeTranslations } from '@/components/tickets/TicketTable';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const SPECIALTY_TO_GROUP: Record<string, string> = {
  electricity: 'electricity',
  plumbing: 'mechanics', tank_insulation: 'mechanics', drainage: 'mechanics',
  ac_ventilation: 'mechanics', pumps: 'mechanics', waterproofing: 'mechanics', mechanics: 'mechanics',
  doors: 'general', paints: 'general', cracks: 'general', ceramics: 'general',
  structural: 'general', painting: 'general', tiles: 'general', aluminum: 'general',
  pest_control: 'general', cleaning: 'general', grading: 'general',
  doors_windows: 'general', garage_door: 'general', general: 'general',
};

const GROUP_SPECIALTIES: Record<string, string[]> = {
  electricity: ['electricity'],
  mechanics: ['plumbing', 'tank_insulation', 'drainage', 'ac_ventilation', 'pumps', 'waterproofing'],
  general: ['doors', 'paints', 'cracks', 'ceramics', 'structural', 'painting', 'tiles', 'aluminum', 'pest_control', 'cleaning', 'grading', 'doors_windows', 'garage_door'],
};

interface TechnicianFormProps {
  trigger?: React.ReactNode;
  nativeButton?: boolean;
  technician?: any;
  onSaved?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const SHOE_SIZES = ['38', '39', '40', '41', '42', '43', '44', '45', '46', '47'];

export function TechnicianForm({ trigger, nativeButton, technician, onSaved, open: openProp, onOpenChange }: TechnicianFormProps) {
  const { user } = useAuth();
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp !== undefined ? openProp : openInternal;
  const setOpen = (value: boolean) => { setOpenInternal(value); onOpenChange?.(value); };
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(technician?.name || '');
  const [phone, setPhone] = useState(technician?.phoneNumber || technician?.phone || '');
  const [employeeId, setEmployeeId] = useState(technician?.employeeId || '');
  const [idNumber, setIdNumber] = useState(technician?.idNumber || '');
  const [clothingSize, setClothingSize] = useState(technician?.clothingSize || '');
  const [shoeSize, setShoeSize] = useState(technician?.shoeSize || '');
  const [specialty, setSpecialty] = useState(technician?.specialty || '');
  const [projectId, setProjectId] = useState(technician?.projectId || '');
  const [supervisorId, setSupervisorId] = useState(technician?.supervisorId || '');
  const [projects, setProjects] = useState<Project[]>([]);
  const [allSupervisors, setAllSupervisors] = useState<any[]>([]);

  React.useEffect(() => {
    if (!open) return;
    Promise.all([projectsApi.getAll(), usersApi.getAll()])
      .then(([allProjects, allUsers]) => {
        const scoped = (!user || user.role === 'admin')
          ? (allProjects as Project[])
          : (allProjects as Project[]).filter(project => (user.projectIds || []).includes(project.id));
        setProjects(scoped);
        setAllSupervisors((allUsers as any[]).filter(candidate => candidate.role === 'supervisor'));
        if (!technician?.projectId && scoped.length === 1) {
          setProjectId(scoped[0].id);
        }
      })
      .catch(() => {});
  }, [open, user, technician?.projectId]);

  const handleProjectChange = (nextProjectId: string) => {
    setProjectId(nextProjectId);
    const supervisorsInProject = allSupervisors
      .filter(supervisor => (supervisor.projectIds as string[] | undefined)?.includes(nextProjectId))
      .map(supervisor => supervisor.uid);
    if (supervisorId && !supervisorsInProject.includes(supervisorId)) {
      setSupervisorId('');
      setSpecialty('');
    }
  };

  const handleSupervisorChange = (uid: string) => {
    setSupervisorId(uid);
    const supervisor = allSupervisors.find(candidate => candidate.uid === uid);
    if (supervisor?.specialties?.length) {
      const groups = new Set<string>();
      for (const supervisorSpecialty of supervisor.specialties as string[]) {
        const group = SPECIALTY_TO_GROUP[supervisorSpecialty];
        if (group) groups.add(group);
      }
      const allowed: string[] = [];
      for (const group of groups) allowed.push(...(GROUP_SPECIALTIES[group] || []));
      if (specialty && !allowed.includes(specialty)) setSpecialty('');
    }
  };

  const filteredSupervisors = useMemo(() =>
    projectId
      ? allSupervisors.filter(supervisor => (supervisor.projectIds as string[] | undefined)?.includes(projectId))
      : allSupervisors,
  [allSupervisors, projectId]);

  const allowedSpecialties = useMemo(() => {
    const supervisor = allSupervisors.find(candidate => candidate.uid === supervisorId);
    if (!supervisor?.specialties?.length) return Object.keys(typeTranslations);
    const groups = new Set<string>();
    for (const supervisorSpecialty of supervisor.specialties as string[]) {
      const group = SPECIALTY_TO_GROUP[supervisorSpecialty];
      if (group) groups.add(group);
    }
    if (groups.size === 0) return Object.keys(typeTranslations);
    const allowed: string[] = [];
    for (const group of groups) allowed.push(...(GROUP_SPECIALTIES[group] || []));
    return [...new Set(allowed)];
  }, [allSupervisors, supervisorId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !phone.trim() || !projectId || !supervisorId || !specialty) {
      toast.error('يرجى ملء جميع الحقول المطلوبة واختيار تخصص الفني');
      return;
    }
    if (!allowedSpecialties.includes(specialty)) {
      toast.error('التخصص المختار غير متاح تحت هذا المشرف');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        phoneNumber: phone.trim(),
        employeeId: employeeId.trim() || null,
        idNumber: idNumber.trim() || null,
        clothingSize: clothingSize || null,
        shoeSize: shoeSize || null,
        specialty,
        projectId,
        supervisorId,
      };

      if (technician?.id) {
        await techniciansApi.update(technician.id, payload);
        toast.success('تم تحديث بيانات الفني بنجاح');
      } else {
        const data = await techniciansApi.invite({
          name: name.trim(),
          phoneNumber: phone.trim(),
          projectId,
          supervisorId,
          specialty,
        } as any);

        if (data.waSent) {
          toast.success(`تم إنشاء الحساب وإرسال الدعوة عبر واتساب تلقائياً! PIN: ${data.tempPassword}`, {
            duration: 10000,
          });
        } else {
          toast.success(`تم إنشاء حساب الفني! الرمز المؤقت: ${data.tempPassword}`, {
            duration: 10000,
          });
          const cleanPhone = phone.replace(/[^0-9]/g, '');
          const origin = window.location.origin;
          const msg = `Hello ${name.trim()} 👋,\nWelcome to Retal Maintenance Team!\n\nYour Technician Portal Login:\n🔗 ${origin}/tech/login\n👤 Username: ${phone.trim()}\n🔑 Temporary PIN: ${data.tempPassword}\n\nLogin once, complete your profile, and choose a new 6-digit PIN.`;
          const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
          const opened = window.open(waUrl, '_blank');
          toast.info('لم يتم إرسال الدعوة تلقائياً', {
            description: !opened || opened.closed ? 'اضغط لفتح واتساب وإرسال الدعوة يدوياً' : 'تم فتح واتساب — تأكد من الإرسال',
            action: { label: 'فتح واتساب', onClick: () => window.open(waUrl, '_blank') },
            duration: 20000,
          });
        }
      }

      setOpen(false);
      if (!technician) {
        setName('');
        setPhone('');
        setEmployeeId('');
        setIdNumber('');
        setClothingSize('');
        setShoeSize('');
        setSpecialty('');
        setProjectId('');
        setSupervisorId('');
      }
      onSaved?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'فشل حفظ بيانات الفني';
      toast.error(message);
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
      <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[420px] rounded-2xl shadow-2xl shadow-black/40 max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white text-right">
            {technician ? 'تعديل بيانات الفني' : 'إضافة فني جديد'}
          </DialogTitle>
          <DialogDescription className="text-slate-500 text-right">
            {technician ? 'تعديل بيانات الفني وتخصصه' : 'أدخل بيانات الفني وحدد المشروع والمشرف والتخصص قبل إرسال الدعوة.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 py-4">
          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">المشروع <span className="text-red-400">*</span></Label>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" />}>
                <span className="text-right flex-1">{projects.find(project => project.id === projectId)?.name || 'اختر المشروع'}</span>
                <Briefcase className="w-3.5 h-3.5 opacity-50 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-border text-slate-200 w-64 max-h-60 overflow-y-auto">
                {projects.map(project => (
                  <DropdownMenuItem key={project.id} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => handleProjectChange(project.id)}>
                    {project.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">
              المشرف المسؤول <span className="text-red-400">*</span>
              {!projectId && <span className="text-amber-400 mr-1 normal-case text-[9px]">(اختر المشروع أولاً)</span>}
            </Label>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" disabled={!projectId} className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12 disabled:opacity-50" />}>
                <span className="text-right flex-1">
                  {filteredSupervisors.find(supervisor => supervisor.uid === supervisorId)?.displayName || 'اختر المشرف'}
                </span>
                <HardHat className="w-3.5 h-3.5 opacity-50 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-border text-slate-200 w-64 max-h-60 overflow-y-auto">
                {filteredSupervisors.length === 0
                  ? <div className="px-3 py-2 text-slate-500 text-sm text-right">لا يوجد مشرفين في هذا المشروع</div>
                  : filteredSupervisors.map(supervisor => (
                    <DropdownMenuItem key={supervisor.uid} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => handleSupervisorChange(supervisor.uid)}>
                      {supervisor.displayName}
                    </DropdownMenuItem>
                  ))
                }
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">اسم الفني <span className="text-red-400">*</span></Label>
            <div className="relative">
              <Input
                placeholder="مثال: كومار"
                className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12"
                value={name}
                onChange={event => setName(event.target.value)}
                required
              />
              <HardHat className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">رقم الهاتف <span className="text-red-400">*</span></Label>
            <div className="relative">
              <Input
                placeholder="05xxxxxxx"
                dir="ltr"
                className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-left pl-12 font-mono"
                value={phone}
                onChange={event => setPhone(event.target.value)}
                required
              />
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">رقم الموظف</Label>
            <div className="relative">
              <Input
                placeholder="EMP-001"
                className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12 font-mono"
                value={employeeId}
                onChange={event => setEmployeeId(event.target.value)}
              />
              <Hash className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">رقم الهوية الحكومي</Label>
            <div className="relative">
              <Input
                placeholder="1xxxxxxxxx"
                dir="ltr"
                className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-left pl-12 font-mono"
                value={idNumber}
                onChange={event => setIdNumber(event.target.value)}
              />
              <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">مقاس التيشيرت</Label>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" />}>
                  <span className="text-right flex-1 text-sm">{clothingSize || 'اختر المقاس'}</span>
                  <Shirt className="w-3.5 h-3.5 opacity-50 shrink-0" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-card border-border text-slate-200">
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-right justify-end text-slate-500" onClick={() => setClothingSize('')}>— بدون —</DropdownMenuItem>
                  {CLOTHING_SIZES.map(size => (
                    <DropdownMenuItem key={size} className={cn("hover:bg-white/5 cursor-pointer text-right justify-end", clothingSize === size && 'text-blue-400')} onClick={() => setClothingSize(size)}>{size}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">مقاس الحذاء</Label>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" />}>
                  <span className="text-right flex-1 text-sm">{shoeSize || 'اختر المقاس'}</span>
                  <Footprints className="w-3.5 h-3.5 opacity-50 shrink-0" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-card border-border text-slate-200">
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-right justify-end text-slate-500" onClick={() => setShoeSize('')}>— بدون —</DropdownMenuItem>
                  {SHOE_SIZES.map(size => (
                    <DropdownMenuItem key={size} className={cn("hover:bg-white/5 cursor-pointer text-right justify-end", shoeSize === size && 'text-blue-400')} onClick={() => setShoeSize(size)}>{size}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">
              التخصص <span className="text-red-400">*</span>
              {!supervisorId && <span className="text-amber-400 mr-1 normal-case text-[9px]">(اختر المشرف أولاً)</span>}
            </Label>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" disabled={!supervisorId} className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12 disabled:opacity-50" />}>
                <span className="text-right flex-1">{typeTranslations[specialty] || specialty || 'اختر التخصص'}</span>
                <Briefcase className="w-3.5 h-3.5 opacity-50 shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-border text-slate-200 min-w-[var(--radix-dropdown-menu-trigger-width)] max-h-60 overflow-y-auto" align="end">
                {allowedSpecialties.length === 0
                  ? <div className="px-3 py-2 text-slate-500 text-sm text-right">لا توجد تخصصات متاحة</div>
                  : allowedSpecialties.map(availableSpecialty => (
                    <DropdownMenuItem key={availableSpecialty} className={cn("hover:bg-white/5 cursor-pointer text-right justify-end", specialty === availableSpecialty && 'text-blue-400')} onClick={() => setSpecialty(availableSpecialty)}>
                      {typeTranslations[availableSpecialty] || availableSpecialty}
                    </DropdownMenuItem>
                  ))
                }
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="text-[10px] text-slate-500 text-right">التخصص يُحدد من الإدارة ولا يمكن للفني تغييره بعد تسجيل الدخول.</p>
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
