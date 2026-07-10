import React, { useState, useEffect } from 'react';
import {
  Plus,
  AlertCircle,
  Briefcase,
  Home,
  Check,
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
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ticketsApi, projectsApi, clientsApi, usersApi } from '@/lib/api';
import { Project, Client, TicketType } from '@/types';
import { classifyOnServer } from '@/services/classificationApi';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { UnifiedImportModal } from './UnifiedImportModal';

/* ── Constants (خارج الـ component عشان مش تتعمل كل render) ── */
const TYPE_LABELS: Record<TicketType, string> = {
  electricity:    'كهرباء',
  plumbing:       'سباكة',
  doors:          'أبواب',
  paints:         'دهانات',
  cracks:         'تشققات',
  ceramics:       'سيراميك',
  tank_insulation:'عزل خزان',
  drainage:       'صرف صحي',
  ac_ventilation: 'تكييف وتهوية',
  pumps:          'مضخات',
  doors_windows:  'أبواب ونوافذ',
  waterproofing:  'عزل مائي',
  grading:        'ميول وترويبة',
  pest_control:   'مكافحة حشرات',
  cleaning:       'تنظيف',
  'structural': 'إنشائي',
  'painting': 'دهانات',
  'tiles': 'سيراميك',
  'unclassified': 'غير مصنف',
};

const PRIORITY_LABELS: Record<string, string> = {
  '3': '3 - منخفض',
  '4': '4 - عادي',
  '6': '6 - متوسط',
  '7': '7 - مرتفع',
  '9': '9 - عاجل جداً',
};

/* ── Props ─────────────────────────────────────────────────── */
interface TicketFormProps {
  trigger?: React.ReactNode;
  nativeButton?: boolean;
  projectId?: string;
  onSuccess?: () => void;
}

/* ════════════════════════════════════════════════════════════
   TicketForm
   ════════════════════════════════════════════════════════════ */
export function TicketForm({
  trigger,
  nativeButton,
  projectId: defaultProjectId,
  onSuccess,
}: TicketFormProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  /* ── Form fields ──────────────────────────────────────────── */
  const [ticketId,     setTicketId]     = useState('');
  const [projectId,    setProjectId]    = useState(defaultProjectId || '');
  const [clientId,     setClientId]     = useState('');
  const [villaNumber,  setVillaNumber]  = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [description,  setDescription]  = useState('');
  const [types,        setTypes]        = useState<TicketType[]>(['electricity']);
  const [priority,     setPriority]     = useState<string | number>('3');

  /* ── Data — مستقلة لكل غرض ────────────────────────────────
     projects     → للفورم والمودال معاً
     formClients  → للـ dropdown داخل الفورم (مفلترة بالمشروع)
     كل مكون يجيب بياناته بنفسه
  ─────────────────────────────────────────────────────────── */
  const [projects,    setProjects]    = useState<Project[]>([]);
  const [formClients, setFormClients] = useState<Client[]>([]);
  const [projectSupervisors, setProjectSupervisors] = useState<{id: string, name: string}[]>([]);
  const [selectedSupervisors, setSelectedSupervisors] = useState<string[]>([]);
  const [allClients,  setAllClients]  = useState<Client[]>([]); // للـ UnifiedImportModal

  /* ── Load projects ────────────────────────────────────────── */
  useEffect(() => {
    projectsApi.getAll()
      .then((all: Project[]) => {
        if (!user || user.role === 'admin') { setProjects(all); return; }
        const ids = user.projectIds || [];
        setProjects(ids.length ? all.filter(p => ids.includes(p.id)) : []);
      })
      .catch(() => {});
  }, [user]);

  /* ── Sync defaultProjectId ────────────────────────────────── */
  useEffect(() => {
    if (defaultProjectId) setProjectId(defaultProjectId);
  }, [defaultProjectId]);

  /* ── Load form clients (مفلترة بالمشروع المختار ومترتبة برقم الفيلا) ──────── */
  useEffect(() => {
    if (!projectId) { setFormClients([]); return; }
    clientsApi.getByProject(projectId)
      .then(clients => {
        const sorted = clients.sort((a, b) => {
          const numA = parseInt(a.villaNumber, 10) || 0;
          const numB = parseInt(b.villaNumber, 10) || 0;
          return numA - numB;
        });
        setFormClients(sorted);
      })
      .catch(() => {});
      
    // Fetch Next ID for this project
    ticketsApi.getNextId(projectId).then(nextId => setTicketId(nextId)).catch(() => {});

    // Fetch Supervisors for this project
    usersApi.getAll().then(allUsers => {
      const sups = allUsers.filter(u => 
        u.role === 'supervisor' && u.projectIds?.includes(projectId)
      );
      setProjectSupervisors(sups.map(u => ({ id: u.uid, name: u.displayName || u.email })));
      setSelectedSupervisors([]);
    }).catch(() => {});
  }, [projectId]);

  /* ── Load all clients — للـ UnifiedImportModal فقط ────────── */
  useEffect(() => {
    clientsApi.getAll().then(setAllClients).catch(() => {});
  }, []);

  /* ── Auto-classify description ────────────────────────────── */
  useEffect(() => {
    if (!description || description.length < 6 || !projectId) return;
    let cancelled = false;
    classifyOnServer({ description, projectId }).then(result => {
      if (!cancelled && result.confidence > 0)
        setTypes(result.allTypes as TicketType[]);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [description, projectId]);

  /* ── Auto-select client by villa number ───────────────────── */
  const handleVillaChange = (val: string) => {
    setVillaNumber(val);
    if (!val) { setClientId(''); return; }
    const match = formClients.find(c => c.villaNumber.trim() === val.trim());
    if (match) {
      setClientId(match.id);
    } else {
      setClientId(''); // Reset if no match
    }
  };

  /* ── Submit ───────────────────────────────────────────────── */
  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!projectId || !description) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    if (!clientId) {
      toast.error('يجب اختيار العميل أولاً قبل إنشاء التذكرة');
      return;
    }
    try {
      const currentClient = formClients.find(c => c.id === clientId);
      const proj = projects.find(p => p.id === projectId);
      const autoRefNumber = proj ? `${proj.abbreviation}-${villaNumber}` : villaNumber;

      const classification = await classifyOnServer({ description, projectId });
      const supervisors = classification.supervisors;

      const finalSupervisors = selectedSupervisors.length > 0 
        ? projectSupervisors.filter(s => selectedSupervisors.includes(s.id)).map(s => ({ id: s.id, name: s.name, specialty: 'general' }))
        : supervisors;

      if (finalSupervisors.length === 0) {
        toast.error('لا يمكن إنشاء التذكرة: لم يتم العثور على مشرفين');
        return;
      }
      
      await ticketsApi.create({
        ticketId,
        refNumber: autoRefNumber,
        assigneeName: finalSupervisors.map(s => s.name).join('، '),
        projectId,
        clientId,
        clientName: currentClient?.name || '',
        villaNumber,
        description,
        type: classification.primaryType,
        detectedTypes: classification.allTypes,
        assignedSupervisorId: finalSupervisors[0]?.id ?? '',
        assignedSupervisorIds: finalSupervisors.map(s => s.id),
        assignedSupervisors: finalSupervisors,
        status: 'open',
        priority,
        createdAt: new Date().toISOString(),
        createdBy: user?.uid || null,
      });
      toast.success(`تم إنشاء التذكرة بنجاح${finalSupervisors.length > 0 ? ` وتعيين المشرف: ${finalSupervisors.map(s => s.name).join('، ')}` : ''}`);
      setOpen(false);
      resetForm();
      onSuccess?.();
    } catch (error) {
      console.error('Error creating ticket:', error);
      const message = error instanceof Error ? error.message : 'فشل إنشاء التذكرة';
      toast.error(message);
    }
  };

  const resetForm = () => {
    setTicketId('');
    setSelectedSupervisors([]);
    setProjectId(defaultProjectId || '');
    setClientId('');
    setVillaNumber('');
    setDescription('');
    setTypes(['electricity']);
    setPriority('3');
  };

  /* ── Derived ──────────────────────────────────────────────── */
  const selectedProject = projects.find(p => p.id === projectId);
  const selectedClient  = formClients.find(c => c.id === clientId);

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        nativeButton={nativeButton ?? true}
        render={
          React.isValidElement(trigger) ? trigger : (
            <Button className="bg-[linear-gradient(135deg,#3b82f6_0%,#2563eb_100%)] hover:opacity-90 text-white gap-2 rounded-full px-6 h-11 shadow-lg shadow-blue-500/20 font-bold">
              <Plus className="w-4 h-4" />
              تذكرة جديدة
            </Button>
          )
        }
      />

      <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[600px] rounded-2xl shadow-2xl shadow-black/40 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold text-white text-right">
              إنشاء تذكرة صيانة
            </DialogTitle>

            {/* ══ UnifiedImportModal — يجيب بياناته بنفسه ══
                مش بنبعتله clients من هنا
                هو بيعمل clientsApi.getAll() من جوّاه       */}
            {(user?.role === 'admin' || user?.role === 'engineer') && (
              <UnifiedImportModal
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-border text-slate-300 hover:text-white"
                  >
                    استيراد
                  </Button>
                }
                projects={projects}
                clients={allClients}
                onImportSuccess={() => onSuccess?.()}
                currentUserId={user.uid}
              />
            )}
          </div>
          <DialogDescription className="text-slate-500 text-right">
            أدخل بيانات المشروع والعميل ووصف المشكلة.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">

          {/* ── Row 1: ID / Villa / Assignee ─────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">ID</Label>
              <Input
                value={ticketId}
                onChange={e => setTicketId(e.target.value)}
                placeholder="تلقائي"
                className="bg-white/5 border-border text-slate-300 rounded-xl h-12 text-right"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">رقم الفيلا</Label>
              <Input
                value={villaNumber}
                onChange={e => handleVillaChange(e.target.value)}
                placeholder="اكتب رقم الفيلا لجلب العميل"
                className="bg-white/5 border-border text-slate-300 rounded-xl h-12 text-right"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">المسؤول (اختياري)</Label>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12"
                      disabled={!projectId}
                    >
                      <Briefcase className="w-3 h-3 opacity-50 shrink-0" />
                      <span className="truncate flex-1 text-right mr-2">
                        {selectedSupervisors.length > 0
                          ? projectSupervisors.filter(s => selectedSupervisors.includes(s.id)).map(s => s.name).join('، ')
                          : projectId ? 'تلقائي بناءً على العطل' : 'اختر المشروع'}
                      </span>
                    </Button>
                  }
                />
                <DropdownMenuContent className="bg-card border-border text-slate-200 w-64 max-h-[300px] overflow-y-auto">
                  {projectSupervisors.length === 0 ? (
                    <DropdownMenuItem disabled className="text-slate-500 text-start justify-start">
                      لا يوجد مشرفين في المشروع
                    </DropdownMenuItem>
                  ) : (
                    projectSupervisors.map(s => (
                      <div
                        key={s.id}
                        className="flex items-center justify-start px-2 py-2 hover:bg-white/5 cursor-pointer rounded-sm border-b border-border/50 last:border-0"
                        onClick={() => {
                          setSelectedSupervisors(prev => 
                            prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]
                          );
                        }}
                      >
                        <span className="mr-3 text-sm">{s.name}</span>
                        <div className={cn("w-4 h-4 border rounded flex items-center justify-center shrink-0 transition-colors", selectedSupervisors.includes(s.id) ? "bg-blue-500 border-blue-500" : "border-slate-500")}>
                          {selectedSupervisors.includes(s.id) && <Check className="w-3 h-3 text-white" />}
                        </div>
                      </div>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* ── Row 2: Project / Client ─────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Project */}
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">
                المشروع
              </Label>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12"
                    >
                      <Briefcase className="w-3 h-3 opacity-50" />
                      <span>{selectedProject?.name || 'اختر المشروع'}</span>
                    </Button>
                  }
                />
                <DropdownMenuContent className="bg-card border-border text-slate-200 w-64">
                  {projects.map(p => (
                    <DropdownMenuItem
                      key={p.id}
                      className="hover:bg-white/5 cursor-pointer text-start justify-start"
                      onClick={() => { setProjectId(p.id); setClientId(''); setVillaNumber(''); }}
                    >
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Client — مفلتر بالمشروع المختار */}
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">
                العميل
              </Label>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12"
                      disabled={!projectId}
                    >
                      <Home className="w-3 h-3 opacity-50" />
                      <span>
                        {selectedClient
                          ? `${selectedClient.name} - ${selectedClient.villaNumber}`
                          : projectId ? 'اختر العميل' : 'اختر المشروع أولاً'}
                      </span>
                    </Button>
                  }
                />
                <DropdownMenuContent className="bg-card border-border text-slate-200 w-64 max-h-[300px] overflow-y-auto">
                  <div className="p-2 border-b border-white/10 sticky top-0 bg-card z-10">
                    <Input 
                      placeholder="ابحث بالاسم أو الفيلا..."
                      value={clientSearch}
                      onChange={e => setClientSearch(e.target.value)}
                      className="h-8 bg-white/5 border-border text-right"
                    />
                  </div>
                  {formClients.length === 0 ? (
                    <DropdownMenuItem disabled className="text-slate-500 text-start justify-start">
                      لا يوجد عملاء في هذا المشروع
                    </DropdownMenuItem>
                  ) : (
                    formClients
                      .filter(c => { const s = clientSearch.toLowerCase(); return (c.name && String(c.name).toLowerCase().includes(s)) || (c.villaNumber != null && String(c.villaNumber).toLowerCase().includes(s)); })
                      .map(c => (
                      <DropdownMenuItem
                        key={c.id}
                        className="hover:bg-white/5 cursor-pointer text-start justify-start"
                        onClick={() => { setClientId(c.id); setVillaNumber(c.villaNumber); }}
                      >
                        {c.name} - {c.villaNumber}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* ── Types ───────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">
              نوع التذكرة{' '}
              <span className="text-slate-600 normal-case">(يُكتشف تلقائياً من الوصف)</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TYPE_LABELS) as TicketType[]).map(t => (
                <button
                  type="button"
                  key={t}
                  onClick={() =>
                    setTypes(prev =>
                      prev.includes(t)
                        ? prev.length > 1 ? prev.filter(x => x !== t) : prev
                        : [...prev, t]
                    )
                  }
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all',
                    types.includes(t)
                      ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                      : 'bg-white/5 border-border text-slate-500 hover:border-slate-400'
                  )}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* ── Priority ────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">
              الأولوية
            </Label>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12"
                  >
                    <AlertCircle className="w-3 h-3 opacity-50" />
                    <span>{PRIORITY_LABELS[String(priority)]}</span>
                  </Button>
                }
              />
              <DropdownMenuContent className="bg-card border-border text-slate-200 w-64">
                {(['9','7','6','4','3'] as const).map(p => (
                  <DropdownMenuItem
                    key={p}
                    className="hover:bg-white/5 cursor-pointer text-start justify-start"
                    onClick={() => setPriority(p)}
                  >
                    {PRIORITY_LABELS[p]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* ── Description ─────────────────────────────────────── */}
          <div className="space-y-2">
            <Label
              htmlFor="description"
              className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest"
            >
              وصف المشكلة
            </Label>
            <textarea
              id="description"
              className="w-full min-h-[120px] bg-white/5 border border-border rounded-xl p-4 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-right resize-none"
              placeholder="صف المشكلة بالتفصيل..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
            />
          </div>

          {/* ── Footer ──────────────────────────────────────────── */}
          <DialogFooter className="pt-4 gap-3">
            <Button
              type="submit"
              className="bg-[linear-gradient(135deg,#3b82f6_0%,#2563eb_100%)] hover:opacity-90 text-white px-8 rounded-full h-11 font-bold shadow-lg shadow-blue-500/20"
            >
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