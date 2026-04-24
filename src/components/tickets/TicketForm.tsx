// src/components/tickets/TicketForm.tsx
import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  AlertCircle,
  Tag,
  User,
  Calendar as CalendarIcon,
  Briefcase,
  Home,
  AlertTriangle
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ticketsApi, projectsApi, clientsApi } from '@/lib/api';
import { Project, Client, TicketType } from '@/types';
import { classifyTicket, TYPE_TO_SPECIALTY } from '@/services/ticketClassifier';
import { findMatchingSupervisors } from '@/services/supervisorAssignment';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { UnifiedImportModal } from './UnifiedImportModal';

interface TicketFormProps {
  trigger?: React.ReactNode;
  nativeButton?: boolean;
  projectId?: string;
}

export function TicketForm({ trigger, nativeButton, projectId: defaultProjectId }: TicketFormProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ticketId, setTicketId] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [assigneeName, setAssigneeName] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [clientId, setClientId] = useState('');
  const [villaNumber, setVillaNumber] = useState('');
  const [description, setDescription] = useState('');
  const [types, setTypes] = useState<TicketType[]>(['electricity']);
  const [priority, setPriority] = useState<number>(3);

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    projectsApi.getAll()
      .then(all => {
        if (!user) {
          setProjects(all);
          return;
        }
        if (user.role === 'admin') {
          setProjects(all);
          return;
        }
        const userProjectIds = user.projectIds || [];
        if (userProjectIds.length > 0) {
          setProjects(all.filter((p: Project) => userProjectIds.includes(p.id)));
        } else {
          setProjects([]);
        }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (defaultProjectId) {
      setProjectId(defaultProjectId);
    }
  }, [defaultProjectId]);

  useEffect(() => {
    if (!projectId) { setClients([]); return; }
    clientsApi.getByProject(projectId).then(setClients).catch(() => {});
  }, [projectId]);

  // Auto-classify description → suggest types
  useEffect(() => {
    if (!description || description.length < 6) return;
    const result = classifyTicket(description);
    if (result.confidence > 0) setTypes(result.allTypes);
  }, [description]);

  // Auto-generate refNumber
  useEffect(() => {
    if (projectId && villaNumber) {
      const selectedProject = projects.find(p => p.id === projectId);
      if (selectedProject) {
        setRefNumber(`${selectedProject.abbreviation}-${villaNumber}`);
      }
    }
  }, [projectId, villaNumber, projects]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !description) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    if (!clientId) {
      toast.error('يجب اختيار العميل أولاً قبل إنشاء التذكرة');
      return;
    }
    setLoading(true);

    try {
      const currentClient = clients.find(c => c.id === clientId);
      const requiredSpecialties = [...new Set(types.map(t => TYPE_TO_SPECIALTY[t]))] as any[];
      const supervisors = projectId ? await findMatchingSupervisors(projectId, requiredSpecialties) : [];
      if (supervisors.length === 0) {
        toast.error('لا يمكن إنشاء التذكرة: لا يوجد مشرفون مطابقون لهذا النوع في المشروع');
        return;
      }
      await ticketsApi.create({
        ticketId,
        refNumber,
        assigneeName: assigneeName || (supervisors[0]?.name ?? ''),
        projectId,
        clientId,
        clientName: currentClient?.name || '',
        villaNumber,
        description,
        type: types[0],
        detectedTypes: types,
        assignedSupervisorId: supervisors[0]?.id ?? '',
        assignedSupervisorIds: supervisors.map(s => s.id),
        assignedSupervisors: supervisors,
        status: 'open',
        priority: priority, // رقم مباشرة
        createdAt: new Date().toISOString(),
        createdBy: user?.uid || null,
      });
      toast.success('تم إنشاء التذكرة بنجاح');
      setOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error creating ticket:', error);
      const message = error instanceof Error ? error.message : 'فشل إنشاء التذكرة';
      toast.error(message || 'فشل إنشاء التذكرة');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTicketId('');
    setRefNumber('');
    setAssigneeName('');
    setProjectId(defaultProjectId || '');
    setClientId('');
    setVillaNumber('');
    setDescription('');
    setTypes(['electricity']);
    setPriority(3);
  };

  // تحديث الترجمة لتشمل الأنواع الجديدة
  const typeTranslations: Record<TicketType, string> = {
    'electricity': 'كهرباء',
    'plumbing': 'سباكة',
    'doors': 'أبواب',
    'paints': 'دهانات',
    'cracks': 'تشققات',
    'ceramics': 'سيراميك',
    'tank_insulation': 'عزل خزان',
    'drainage': 'صرف صحي',
    'ac_ventilation': 'تكييف وتهوية',
    'pumps': 'مضخات',
    'doors_windows': 'أبواب ونوافذ',
    'waterproofing': 'عزل مائي',
    'grading': 'ميول وترويبة',
    'pest_control': 'مكافحة حشرات',
    'cleaning': 'تنظيف',
    'structural': 'إنشائي',
    'painting': 'دهانات',
    'tiles': 'سيراميك',
  };

  const priorityTranslations: Record<number, string> = {
    3: '3 - منخفض',
    4: '4 - عادي',
    6: '6 - متوسط',
    7: '7 - مرتفع',
    9: '9 - عاجل جداً',
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger 
        nativeButton={nativeButton ?? true}
        render={React.isValidElement(trigger) ? trigger : (
          <Button className="bg-[linear-gradient(135deg,#3b82f6_0%,#2563eb_100%)] hover:opacity-90 text-white gap-2 rounded-full px-6 h-11 shadow-lg shadow-blue-500/20 font-bold">
            {trigger || (
              <>
                <Plus className="w-4 h-4" />
                تذكرة جديدة
              </>
            )}
          </Button>
        )} 
      />
      <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[600px] rounded-2xl shadow-2xl shadow-black/40 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold text-white text-right">إنشاء تذكرة صيانة</DialogTitle>
            {/* زر الاستيراد الموحد - اختياري، يمكن إزالته إذا كنت تريد الاكتفاء به في TicketsList */}
            {user && (user.role === 'admin' || user.role === 'engineer') && (
              <UnifiedImportModal
                trigger={<Button variant="outline" size="sm">استيراد</Button>}
                projects={projects}
                clients={clients}
                onImportSuccess={() => {
                  // يمكن إعادة تحميل البيانات إذا لزم الأمر
                }}
                currentUserId={user.uid}
              />
            )}
          </div>
          <DialogDescription className="text-slate-500 text-right">
            أدخل بيانات المشروع والعميل ووصف المشكلة.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">ID</Label>
              <Input 
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
                placeholder="182787"
                className="bg-white/5 border-border text-slate-300 rounded-xl h-12 text-right"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">المرجع</Label>
              <Input 
                value={refNumber}
                onChange={(e) => setRefNumber(e.target.value)}
                placeholder="NTF-685"
                className="bg-white/5 border-border text-slate-300 rounded-xl h-12 text-right"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">المسؤول</Label>
              <Input 
                value={assigneeName}
                onChange={(e) => setAssigneeName(e.target.value)}
                placeholder="أحمد"
                className="bg-white/5 border-border text-slate-300 rounded-xl h-12 text-right"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">المشروع</Label>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" />}>
                  <Briefcase className="w-3 h-3 opacity-50" />
                  <span>{projects.find(p => p.id === projectId)?.name || 'اختر المشروع'}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-card border-border text-slate-200 w-64">
                  {projects.map((p) => (
                    <DropdownMenuItem key={p.id} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setProjectId(p.id)}>
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">العميل / الفيلا</Label>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" disabled={!projectId} />}>
                  <Home className="w-3 h-3 opacity-50" />
                  <span>{clients.find(c => c.id === clientId)?.name ? `${clients.find(c => c.id === clientId)?.name} - ${clients.find(c => c.id === clientId)?.villaNumber}` : 'اختر العميل'}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-card border-border text-slate-200 w-64">
                  {clients.map((c) => (
                    <DropdownMenuItem key={c.id} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => { setClientId(c.id); setVillaNumber(c.villaNumber); }}>
                      {c.name} - {c.villaNumber}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">
              نوع التذكرة <span className="text-slate-600 normal-case">(اختر واحداً أو أكثر — يُكتشف تلقائياً من الوصف)</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(typeTranslations) as TicketType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTypes(prev =>
                    prev.includes(t)
                      ? (prev.length > 1 ? prev.filter(x => x !== t) : prev)
                      : [...prev, t]
                  )}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all',
                    types.includes(t)
                      ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                      : 'bg-white/5 border-border text-slate-500 hover:border-slate-400'
                  )}
                >
                  {typeTranslations[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">الأولوية</Label>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" />}>
                <AlertCircle className="w-3 h-3 opacity-50" />
                <span>{priorityTranslations[priority]}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-border text-slate-200 w-64">
                {[3, 4, 6, 7, 9].map((p) => (
                  <DropdownMenuItem key={p} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setPriority(p)}>
                    {priorityTranslations[p]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">وصف المشكلة</Label>
            <textarea 
              id="description"
              className="w-full min-h-[120px] bg-white/5 border border-border rounded-xl p-4 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-right"
              placeholder="صف المشكلة بالتفصيل..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          <DialogFooter className="pt-4 gap-3">
            <Button type="submit" className="bg-[linear-gradient(135deg,#3b82f6_0%,#2563eb_100%)] hover:opacity-90 text-white px-8 rounded-full h-11 font-bold shadow-lg shadow-blue-500/20">
              إنشاء التذكرة
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              className="text-slate-500 hover:text-white rounded-full"
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