import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  Shield,
  Briefcase,
  Loader2,
  Mail,
  User as UserIcon,
  Hash,
  Phone,
  Info,
  CreditCard,
  Shirt,
  Footprints,
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
import { usersApi, projectsApi } from '@/lib/api';
import { Project, UserRole } from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface UserFormProps {
  trigger?: React.ReactNode;
  user?: any;
  nativeButton?: boolean;
  /** Controlled open state (external control) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called after successful save */
  onSaved?: () => void;
  /** Restrict role dropdown (engineers can only create supervisors) */
  allowedRoles?: UserRole[];
  /** Show only these projects in the picker (engineer's own projects) */
  lockedProjectIds?: string[];
}

export function UserForm({
  trigger,
  user: editingUser,
  nativeButton,
  open: controlledOpen,
  onOpenChange: controlledOnChange,
  onSaved,
  allowedRoles,
  lockedProjectIds,
}: UserFormProps) {
  // Support both controlled and uncontrolled open state
  const isControlled  = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open    = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) controlledOnChange?.(v);
    else              setInternalOpen(v);
  };

  const [loading, setLoading] = useState(false);

  // Form state — initialized from prop, refreshed from API when dialog opens
  const [email,            setEmail]            = useState(editingUser?.email || '');
  const [displayName,      setDisplayName]      = useState(editingUser?.displayName || '');
  const [employeeId,       setEmployeeId]       = useState(editingUser?.employeeId || '');
  const [phoneNumber,      setPhoneNumber]      = useState(editingUser?.phoneNumber || '');
  const [idNumber,         setIdNumber]         = useState(editingUser?.idNumber || '');
  const [clothingSize,     setClothingSize]     = useState(editingUser?.clothingSize || '');
  const [shoeSize,         setShoeSize]         = useState(editingUser?.shoeSize || '');
  const [role,             setRole]             = useState<UserRole>(editingUser?.role || 'supervisor');
  const [specialties,      setSpecialties]      = useState<string[]>(
    editingUser?.specialties ?? (editingUser?.specialty ? [editingUser.specialty] : ['general'])
  );
  const [selectedProjects, setSelectedProjects] = useState<string[]>(editingUser?.projectIds || []);
  const [projects,         setProjects]         = useState<Project[]>([]);
  const [onLeave,          setOnLeave]          = useState(editingUser?.onLeave || false);
  const [substituteUid,    setSubstituteUid]    = useState<string | null>(editingUser?.substituteUid || null);
  const [allUsers,         setAllUsers]         = useState<any[]>([]);

  const isCustomTrigger = !!trigger;

  // Load projects list and users once
  useEffect(() => {
    projectsApi.getAll().then(setProjects).catch(() => {});
    usersApi.getAll().then(setAllUsers).catch(() => {});
  }, []);

  // When dialog opens in edit mode → fetch fresh user data from server
  useEffect(() => {
    if (!open || !editingUser) return;
    const uid = editingUser.id ?? editingUser.uid;
    if (!uid) return;
    usersApi.get(uid).then((fresh: any) => {
      if (!fresh) return;
      setDisplayName(fresh.displayName || '');
      setEmail(fresh.email || '');
      setEmployeeId(fresh.employeeId || '');
      setPhoneNumber(fresh.phoneNumber || '');
      setIdNumber((fresh as any).idNumber || '');
      setClothingSize((fresh as any).clothingSize || '');
      setShoeSize((fresh as any).shoeSize || '');
      setRole(fresh.role || 'supervisor');
      setSpecialties(
        fresh.specialties?.length
          ? fresh.specialties
          : fresh.specialty ? [fresh.specialty] : ['general']
      );
      setSelectedProjects(fresh.projectIds || []);
      setOnLeave(fresh.onLeave || false);
      setSubstituteUid(fresh.substituteUid || null);
    }).catch(() => {});
  }, [open]);

  const toggleSpecialty = (s: string) =>
    setSpecialties(prev =>
      prev.includes(s) ? (prev.length > 1 ? prev.filter(x => x !== s) : prev) : [...prev, s]
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingUser) {
      if (!displayName.trim()) { toast.error('يرجى إدخال الاسم الكامل'); return; }
      if (role !== 'admin' && selectedProjects.length === 0) {
        toast.error('يرجى اختيار مشروع واحد على الأقل'); return;
      }
    } else {
      if (!employeeId.trim() && !phoneNumber.trim()) {
        toast.error('يرجى إدخال الرقم الوظيفي أو رقم الهاتف على الأقل'); return;
      }
      if (role !== 'admin' && selectedProjects.length === 0) {
        toast.error('يرجى اختيار مشروع واحد على الأقل'); return;
      }
    }

    setLoading(true);
    try {
      if (editingUser) {
        await usersApi.update(editingUser.id ?? editingUser.uid, {
          displayName,
          employeeId,
          phoneNumber,
          idNumber: idNumber || null,
          clothingSize: clothingSize || null,
          shoeSize: shoeSize || null,
          specialties,
          specialty: specialties[0],
          role,
          projectIds: selectedProjects,
          onLeave,
          substituteUid: onLeave ? substituteUid : null,
        });
        toast.success('تم تحديث بيانات العضو بنجاح');
      } else {
        await usersApi.upsert({
          displayName: '',
          email: '',
          employeeId: employeeId.trim(),
          phoneNumber: phoneNumber.trim(),
          specialties,
          specialty: specialties[0],
          role,
          projectIds: selectedProjects,
          isPending: true,
          profileCompleted: false,
          createdAt: new Date().toISOString(),
        });
        toast.success('تم إضافة العضو بنجاح. يمكنه إتمام تسجيله باستخدام رقمه الوظيفي أو رقم هاتفه.');
      }
      setOpen(false);
      onSaved?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'فشل حفظ بيانات العضو';
      toast.error(message || 'فشل حفظ بيانات العضو');
    } finally {
      setLoading(false);
    }
  };

  const toggleProject = (id: string) =>
    setSelectedProjects(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );

  const roleTranslations: Record<UserRole, string> = {
    admin:      'مدير النظام',
    engineer:   'مهندس مشروع',
    supervisor: 'مشرف',
  };

  // ── In controlled mode (external open), render dialog without trigger ──
  if (isControlled) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[500px] rounded-3xl shadow-2xl shadow-black/40 max-h-[90vh] overflow-y-auto">
          <FormBody
            editingUser={editingUser}
            displayName={displayName} setDisplayName={setDisplayName}
            email={email} setEmail={setEmail}
            employeeId={employeeId} setEmployeeId={setEmployeeId}
            phoneNumber={phoneNumber} setPhoneNumber={setPhoneNumber}
            idNumber={idNumber} setIdNumber={setIdNumber}
            clothingSize={clothingSize} setClothingSize={setClothingSize}
            shoeSize={shoeSize} setShoeSize={setShoeSize}
            role={role} setRole={setRole}
            roleTranslations={roleTranslations}
            specialties={specialties} toggleSpecialty={toggleSpecialty}
            selectedProjects={selectedProjects} toggleProject={toggleProject}
            projects={projects}
            onLeave={onLeave} setOnLeave={setOnLeave}
            substituteUid={substituteUid} setSubstituteUid={setSubstituteUid}
            allUsers={allUsers}
            loading={loading}
            onSubmit={handleSubmit}
            onCancel={() => setOpen(false)}
            allowedRoles={allowedRoles}
            lockedProjectIds={lockedProjectIds}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // ── Uncontrolled mode — render with trigger ──
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
        <FormBody
          editingUser={editingUser}
          displayName={displayName} setDisplayName={setDisplayName}
          email={email} setEmail={setEmail}
          employeeId={employeeId} setEmployeeId={setEmployeeId}
          phoneNumber={phoneNumber} setPhoneNumber={setPhoneNumber}
          idNumber={idNumber} setIdNumber={setIdNumber}
          clothingSize={clothingSize} setClothingSize={setClothingSize}
          shoeSize={shoeSize} setShoeSize={setShoeSize}
          role={role} setRole={setRole}
          roleTranslations={roleTranslations}
          specialties={specialties} toggleSpecialty={toggleSpecialty}
          selectedProjects={selectedProjects} toggleProject={toggleProject}
          projects={projects}
          onLeave={onLeave} setOnLeave={setOnLeave}
          substituteUid={substituteUid} setSubstituteUid={setSubstituteUid}
          allUsers={allUsers}
          loading={loading}
          onSubmit={handleSubmit}
          onCancel={() => setOpen(false)}
          allowedRoles={allowedRoles}
          lockedProjectIds={lockedProjectIds}
        />
      </DialogContent>
    </Dialog>
  );
}

// ── Extracted form body (shared between controlled & uncontrolled) ─────────

interface FormBodyProps {
  editingUser: any;
  displayName: string; setDisplayName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  employeeId: string; setEmployeeId: (v: string) => void;
  phoneNumber: string; setPhoneNumber: (v: string) => void;
  idNumber: string; setIdNumber: (v: string) => void;
  clothingSize: string; setClothingSize: (v: string) => void;
  shoeSize: string; setShoeSize: (v: string) => void;
  role: UserRole; setRole: (v: UserRole) => void;
  roleTranslations: Record<UserRole, string>;
  specialties: string[]; toggleSpecialty: (s: string) => void;
  selectedProjects: string[]; toggleProject: (id: string) => void;
  projects: Project[];
  onLeave: boolean; setOnLeave: (v: boolean) => void;
  substituteUid: string | null; setSubstituteUid: (v: string | null) => void;
  allUsers: any[];
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  allowedRoles?: UserRole[];
  lockedProjectIds?: string[];
}

const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
const SHOE_SIZES = ['38', '39', '40', '41', '42', '43', '44', '45', '46', '47'];

function FormBody({
  editingUser, displayName, setDisplayName, email, setEmail,
  employeeId, setEmployeeId, phoneNumber, setPhoneNumber,
  idNumber, setIdNumber, clothingSize, setClothingSize, shoeSize, setShoeSize,
  role, setRole, roleTranslations,
  specialties, toggleSpecialty,
  selectedProjects, toggleProject, projects,
  onLeave, setOnLeave, substituteUid, setSubstituteUid, allUsers,
  loading, onSubmit, onCancel,
  allowedRoles, lockedProjectIds,
}: FormBodyProps) {
  const visibleRoles = allowedRoles ?? (['admin', 'engineer', 'supervisor'] as UserRole[]);
  const visibleProjects = lockedProjectIds
    ? projects.filter(p => lockedProjectIds.includes(p.id))
    : projects;
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-bold text-white text-right">
          {editingUser ? 'تعديل بيانات العضو' : 'إضافة عضو جديد'}
        </DialogTitle>
        <DialogDescription className="text-slate-500 text-right">
          {editingUser
            ? 'حدد الدور والتخصصات والمشاريع المسؤولة لهذا العضو.'
            : 'أضف الرقم الوظيفي أو رقم الهاتف مع الدور والمشروع. العضو سيكمل بياناته عند التسجيل.'}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} noValidate className="space-y-6 py-4">

        {/* ── Edit mode: name + email ── */}
        {editingUser && (
          <>
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">الاسم الكامل</Label>
              <div className="relative">
                <Input
                  placeholder="مثال: أحمد علي"
                  className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                />
                <UserIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">البريد الإلكتروني</Label>
              <div className="relative">
                <Input
                  type="email"
                  placeholder="name@example.com"
                  className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12 font-mono opacity-60"
                  value={email}
                  disabled
                />
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            </div>
          </>
        )}

        {/* ── New user: identifiers ── */}
        {!editingUser && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl">
              <Info className="w-4 h-4 text-blue-400 shrink-0" />
              <p className="text-xs text-blue-300 text-right">أدخل الرقم الوظيفي أو رقم الهاتف — يكفي واحد منهما. العضو سيُكمل بياناته عند أول تسجيل دخول.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">الرقم الوظيفي</Label>
                <div className="relative">
                  <Input
                    placeholder="EMP001"
                    className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-10 font-mono"
                    value={employeeId}
                    onChange={e => setEmployeeId(e.target.value)}
                  />
                  <Hash className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">رقم الهاتف</Label>
                <div className="relative">
                  <Input
                    placeholder="05xxxxxxxx"
                    className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-10"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                  />
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Role ── */}
        <div className="space-y-2">
          <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">الدور الوظيفي</Label>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" />}>
              <Shield className="w-3 h-3 opacity-50" />
              <span>{roleTranslations[role]}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-card border-border text-slate-200 w-64">
              {visibleRoles.map(r => (
                <DropdownMenuItem key={r} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setRole(r)}>
                  {roleTranslations[r]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ── Specialties ── */}
        {role !== 'admin' && (
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
        )}

        {/* ── Projects ── */}
        {role !== 'admin' && (
          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest flex items-center justify-between">
              <span>المشاريع المسندة <span className="text-red-400 mr-1">*</span></span>
              {selectedProjects.length > 0 && (
                <span className="text-blue-400 text-[10px] font-bold bg-blue-500/10 px-2 py-0.5 rounded-full">
                  {selectedProjects.length} محدد
                </span>
              )}
            </Label>
            <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto p-2 bg-white/5 rounded-xl border border-border">
              {visibleProjects.map(p => (
                <div
                  key={p.id}
                  className={cn(
                    'flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all',
                    selectedProjects.includes(p.id) ? 'bg-blue-500/10 text-blue-400' : 'hover:bg-white/5 text-slate-400'
                  )}
                  onClick={() => toggleProject(p.id)}
                >
                  <span className="text-xs font-bold">{p.name}</span>
                  {selectedProjects.includes(p.id) && <Briefcase className="w-3 h-3" />}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Edit mode: employee ID + phone + Leave options ── */}
        {editingUser && (
          <div className="space-y-4 pt-4 border-t border-white/5">
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">الرقم الوظيفي</Label>
              <div className="relative">
                <Input
                  placeholder="EMP001"
                  className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12 font-mono"
                  value={employeeId}
                  onChange={e => setEmployeeId(e.target.value)}
                />
                <Hash className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">رقم الهاتف</Label>
              <div className="relative">
                <Input
                  placeholder="05xxxxxxxx"
                  className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                />
                <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            </div>

            {/* National ID */}
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">رقم الهوية الحكومي</Label>
              <div className="relative">
                <Input
                  placeholder="1xxxxxxxxx"
                  dir="ltr"
                  className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-left pl-12 font-mono"
                  value={idNumber}
                  onChange={e => setIdNumber(e.target.value)}
                />
                <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            </div>

            {/* Clothing + Shoe sizes */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">مقاس التيشيرت</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" />}>
                    <span className="text-right flex-1 text-sm">{clothingSize || 'اختر'}</span>
                    <Shirt className="w-3.5 h-3.5 opacity-50 shrink-0" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-card border-border text-slate-200">
                    <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-right justify-end text-slate-500" onClick={() => setClothingSize('')}>— بدون —</DropdownMenuItem>
                    {CLOTHING_SIZES.map(s => (
                      <DropdownMenuItem key={s} className={cn("hover:bg-white/5 cursor-pointer text-right justify-end", clothingSize === s && 'text-blue-400')} onClick={() => setClothingSize(s)}>{s}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">مقاس الحذاء</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" />}>
                    <span className="text-right flex-1 text-sm">{shoeSize || 'اختر'}</span>
                    <Footprints className="w-3.5 h-3.5 opacity-50 shrink-0" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-card border-border text-slate-200">
                    <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-right justify-end text-slate-500" onClick={() => setShoeSize('')}>— بدون —</DropdownMenuItem>
                    {SHOE_SIZES.map(s => (
                      <DropdownMenuItem key={s} className={cn("hover:bg-white/5 cursor-pointer text-right justify-end", shoeSize === s && 'text-blue-400')} onClick={() => setShoeSize(s)}>{s}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Leave / Substitute Section */}
            {role !== 'admin' && (
              <div className="space-y-3 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-border">
                  <input 
                    type="checkbox" 
                    id="onLeaveToggle"
                    checked={onLeave} 
                    onChange={(e) => setOnLeave(e.target.checked)} 
                    className="w-4 h-4 rounded text-blue-500" 
                  />
                  <Label htmlFor="onLeaveToggle" className="text-white text-sm font-bold cursor-pointer">العضو في إجازة؟</Label>
                </div>
                {onLeave && (
                  <div className="space-y-2">
                    <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">اختر البديل (المشرف / المهندس الذي سيستلم عمله)</Label>
                    <select
                      value={substituteUid || ''}
                      onChange={e => setSubstituteUid(e.target.value)}
                      className="w-full bg-slate-900 border border-border text-white rounded-xl h-12 px-4 text-right"
                      dir="rtl"
                    >
                      <option value="">بدون بديل</option>
                      {allUsers
                        .filter(u => u.uid !== (editingUser.id ?? editingUser.uid) && !u.disabled && !u.onLeave && u.role === role && u.projectIds?.some((p: string) => selectedProjects.includes(p)))
                        .map(u => (
                          <option key={u.uid} value={u.uid}>
                            {u.displayName} ({u.specialties?.join(', ') || 'عام'})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
            onClick={onCancel}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
