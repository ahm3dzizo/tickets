import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { 
  AlertTriangle,
  FileUp,
  ChevronDown,
  X,
  Edit,
  MessageCircle,
  CheckSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { TicketForm } from '@/components/tickets/TicketForm';
import { CloseTicketDialog } from '@/components/tickets/CloseTicketDialog';
import { TicketTable, parseIssuedAt, BulkActionBar } from '@/components/tickets/TicketTable';
import { DataImport, FieldDef } from '@/components/ui/DataImport';
import { ticketsApi, projectsApi, clientsApi } from '@/lib/api';
import { Ticket, TicketType, Project, Client } from '@/types';
import { classifyTicket } from '@/services/ticketClassifier';
import { findMatchingSupervisors } from '@/services/supervisorAssignment';
import { WhatsAppService } from '@/services/whatsappService';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function TicketsList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importProjectId, setImportProjectId] = useState('');
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);

  const loadData = async () => {
    if (!user) return;
    try {
      const [allClients, allProjects] = await Promise.all([
        clientsApi.getAll(),
        projectsApi.getAll(),
      ]);
      const clientMap: Record<string, Client> = {};
      allClients.forEach((c: any) => { clientMap[c.id] = c as Client; });
      setClients(clientMap);
      const projectMap: Record<string, Project> = {};
      allProjects.forEach((p: any) => { projectMap[p.id] = p as Project; });
      setProjects(projectMap);

      const params: Parameters<typeof ticketsApi.getAll>[0] = {};
      if (user.role === 'supervisor') params.supervisorId = user.uid;
      else if (user.role !== 'admin' && user.projectIds?.length)
        params.projectIds = user.projectIds;
      const allTickets = await ticketsApi.getAll(params);
      setTickets(allTickets as Ticket[]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // ── Delete all tickets ──────────────────────────────────────
  const handleDeleteAll = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    setDeleteConfirm(false);
    try {
      const result = await ticketsApi.deleteAll();
      toast.success(`تم حذف ${result.count} تذكرة بنجاح`);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('فشل حذف التذاكر');
    }
  };

  // ── Re-assign supervisors for all tickets missing one ──────
  const [reassigning, setReassigning] = useState(false);

  const handleReassignSupervisors = async () => {
    setReassigning(true);
    try {
      const activeStatuses = new Set(['open', 'in-progress', 'pending', 'waiting']);
      const unassigned = tickets.filter(t => {
        const isActive = activeStatuses.has(String(t.status || '').toLowerCase());
        const noSupervisors = !t.assignedSupervisorIds || t.assignedSupervisorIds.length === 0;
        return isActive && noSupervisors;
      });

      if (unassigned.length === 0) {
        toast.info('لا توجد تذاكر نشطة تحتاج إعادة تعيين مشرفين');
        setReassigning(false);
        return;
      }

      const toastId = 'reassign';
      let noProjectCount = 0;
      let noSupervisorCount = 0;
      toast.loading(`⚙ جارٍ تعيين المشرفين: 0 / ${unassigned.length}`, { id: toastId, duration: Infinity });

      let done = 0;
      const updates: Promise<any>[] = [];

      for (const ticket of unassigned) {
        const ticketType = (ticket.type || 'plumbing') as TicketType;
        const projectId = ticket.projectId || '';

        if (!projectId) { done++; noProjectCount++; continue; }

        const { TYPE_TO_SPECIALTY } = await import('@/services/ticketClassifier');
        const detectedTypes: TicketType[] = ticket.detectedTypes?.length ? ticket.detectedTypes as TicketType[] : [ticketType];
        const specialties = [...new Set(detectedTypes.map((t: TicketType) => TYPE_TO_SPECIALTY[t]))] as any[];
        const supervisors = await findMatchingSupervisors(projectId, specialties);
        const primary = supervisors[0];

        if (primary) {
          updates.push(ticketsApi.update(ticket.id, {
            assigneeName:          primary.name,
            assignedSupervisorId:  primary.id,
            assignedSupervisorIds: supervisors.map((s: any) => s.id),
            assignedSupervisors:   supervisors,
          }));
        } else {
          noSupervisorCount++;
        }

        done++;
        if (done % 10 === 0) {
          toast.loading(`⚙ جارٍ تعيين المشرفين: ${done} / ${unassigned.length}`, { id: toastId, duration: Infinity });
        }
      }

      await Promise.all(updates);

      toast.success(
        `✅ تم تعيين المشرفين لـ ${updates.length} تذكرة` +
        (noProjectCount   > 0 ? ` | ${noProjectCount} بدون مشروع`  : '') +
        (noSupervisorCount > 0 ? ` | ${noSupervisorCount} بدون مشرف مطابق` : ''),
        { id: toastId, duration: 8000 }
      );
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('فشل إعادة تعيين المشرفين');
    } finally {
      setReassigning(false);
    }
  };

  // Parse reference like 'NTF-615' → { projectAbbr: 'NTF', villaNumber: '615' }
  const parseTicketRef = (ref: string): { projectAbbr: string; villaNumber: string } => {
    const m = ref.match(/^([A-Za-z]+)-?(\d+)$/);
    return m ? { projectAbbr: m[1].toUpperCase(), villaNumber: m[2] } : { projectAbbr: '', villaNumber: '' };
  };

  const handleImportTickets = async (data: any[]) => {
    if (!importProjectId) {
      toast.error('اختر المشروع أولاً');
      return;
    }

    const clientsInProject = Object.values(clients).filter(c => c.projectId === importProjectId).length;
    if (clientsInProject === 0) {
      toast.error('لا يمكن استيراد التذاكر قبل إضافة عملاء للمشروع');
      return;
    }

    // ── Abbreviation mismatch check ──
    if (importProjectId) {
      const targetAbbr = projects[importProjectId]?.abbreviation?.toUpperCase() ?? '';
      const foreignAbbrs = [...new Set(
        data
          .map(item => parseTicketRef(String(item.refNumber ?? '').trim()).projectAbbr)
          .filter(abbr => abbr && abbr !== targetAbbr)
      )];
      if (foreignAbbrs.length > 0) {
        const targetName = projects[importProjectId]?.abbreviation ?? importProjectId;
        throw new Error(
          `هذه التذاكر تابعة لمشروع آخر (${foreignAbbrs.join(', ')}) وليس لمشروع "${targetName}". تأكد من الملف الصحيح.`
        );
      }
    }

    const allClientsArr = Object.values(clients);
    const ticketsToCreate: any[] = [];

    for (const item of data) {
      const refNumber    = String(item.refNumber    ?? '').trim();
      const { projectAbbr, villaNumber: refVilla } = parseTicketRef(refNumber);
      const villaNumber  = String(item.villaNumber  ?? refVilla).trim();
      const clientName   = String(item.clientName   ?? '').trim();
      const issuedAtRaw  = item.issuedAt ?? item.date ?? item.issuedDate ?? '';
      const daysOpenRaw  = String(item.daysOpen ?? '').trim();
      const derivedIssuedAt = (!issuedAtRaw && daysOpenRaw && !isNaN(Number(daysOpenRaw)))
        ? new Date(Date.now() - Number(daysOpenRaw) * 86400 * 1000) : null;
      const issuedAtStr = issuedAtRaw
        ? (() => { const d = parseIssuedAt(issuedAtRaw); return d ? format(d, 'd/M/yyyy') : String(issuedAtRaw).trim(); })()
        : derivedIssuedAt ? format(derivedIssuedAt, 'd/M/yyyy') : '';
      const description  = String(item.description  ?? '').trim();
      const assigneeRaw  = String(item.assigneeName ?? '').trim();
      const assigneeName = assigneeRaw === '---' ? '' : assigneeRaw;
      const ticketId     = String(item.ticketId     ?? '').trim();
      const priorityRaw  = String(item.priority     ?? '').trim();
      const typeRaw      = String(item.ticketType   ?? item.type ?? '').trim();
      const projectName  = String(item.projectName  ?? '').trim();

      const arabicTypeMap: Record<string, TicketType> = {
        'سباكة': 'plumbing', 'كهرباء': 'electricity', 'أبواب': 'doors',
        'دهانات': 'paints', 'تشققات': 'cracks', 'سيراميك': 'ceramics', 'عزل خزان': 'tank_insulation',
      };
      const fileType = arabicTypeMap[typeRaw] ?? (typeRaw as TicketType) ?? null;
      const classification = classifyTicket(description);
      const finalType = fileType || classification.primaryType;

      const project = importProjectId
        ? (projects[importProjectId] || null)
        : (Object.values(projects) as Project[]).find(
            p => p.name === projectName || p.abbreviation === projectName ||
                 (projectAbbr && p.abbreviation === projectAbbr)
          ) || null;

      const supervisors = project
        ? await findMatchingSupervisors(project.id, classification.requiredSpecialties)
        : [];
      const primarySupervisor = supervisors[0];

      // Find client from cached clients
      let clientId = '';
      let resolvedClientName = clientName;
      if (villaNumber) {
        const found = allClientsArr.find(c =>
          c.villaNumber === villaNumber && (!project || c.projectId === project.id)
        );
        if (found) { clientId = found.id; resolvedClientName = found.name || clientName; }
      }

      const priorityNum = priorityRaw ? (isNaN(Number(priorityRaw)) ? 3 : Number(priorityRaw)) : 3;

      ticketsToCreate.push({
        ticketId,
        refNumber,
        projectAbbr,
        issuedAt: issuedAtStr,
        assigneeName: assigneeName || primarySupervisor?.name || '',
        assignedSupervisorId:  primarySupervisor?.id  || '',
        assignedSupervisorIds: supervisors.map((s: any) => s.id),
        assignedSupervisors:   supervisors,
        detectedTypes:         classification.allTypes,
        projectId:  project?.id || '',
        clientId,
        clientName: resolvedClientName,
        villaNumber,
        description,
        type:   finalType,
        status: 'open',
        priority: priorityNum,
      });
    }

    const unresolved = ticketsToCreate.filter(t => !t.clientId);
    if (unresolved.length > 0) {
      toast.error(`تعذر استيراد ${unresolved.length} تذكرة لعدم وجود عميل مطابق (رقم فيلا/مشروع)`);
      return;
    }

      const withoutSupervisors = ticketsToCreate.filter(t => !t.assignedSupervisorIds || t.assignedSupervisorIds.length === 0);
      if (withoutSupervisors.length > 0) {
        toast.error(`تعذر استيراد ${withoutSupervisors.length} تذكرة لعدم وجود مشرفين مطابقين`);
        return;
      }

    const result = await ticketsApi.bulkCreate(ticketsToCreate);
    setImportOpen(false);
    setImportProjectId('');
    toast.success(`تم استيراد ${result.count} تذكرة بنجاح`);
    loadData();
  };

  const importFieldDefs: FieldDef[] = [
    { key: 'ticketId',     label: 'رقم التذكرة',   aliases: ['#', 'الرقم', 'رقم', 'id', 'ID', 'رقم التذكرة', 'تذكرة', 'ticket'] },
    { key: 'refNumber',    label: 'رقم الفيلا / المرجع', aliases: ['NTF', 'المرجع', 'رقم مرجعي', 'الرقم المرجعي', 'ref', 'refNumber', 'رقم مرجع', 'رقم الفيلا', 'الفيلا'] },
    { key: 'clientName',   label: 'اسم العميل',    aliases: ['العميل', 'اسم العميل', 'المالك', 'الاسم', 'الاسم الكامل', 'client', 'name', 'الساكن'] },
    { key: 'issuedAt',     label: 'تاريخ الإصدار', aliases: ['التاريخ', 'تاريخ', 'date', 'تاريخ الإصدار', 'تاريخ الاصدار', 'تاريخ التذكرة'] },
    { key: 'description',  label: 'الوصف',         aliases: ['الوصف', 'المشكلة', 'الملاحظة', 'الملاحظات', 'الطلب', 'الشكوى', 'description', 'وصف', 'الطلبات'] },
    { key: 'daysOpen',     label: 'عدد الأيام',    aliases: ['أيام', 'الأيام', 'عدد الأيام', 'days', 'مدة', 'المدة'] },
    { key: 'assigneeName', label: 'المسؤول',       aliases: ['المسؤول', 'المهندس', 'المشرف', 'اسم المسؤول', 'assignee', 'منسوب لـ', 'منسوب'] },
    { key: 'ticketType',   label: 'نوع الصيانة', aliases: ['النوع', 'نوع', 'type', 'الصيانة', 'التصنيف'] },
    { key: 'projectName',  label: 'المشروع',       aliases: ['المشروع', 'اسم المشروع', 'project', 'Project', 'الحي', 'المجمع'] },
  ];

  const importTemplateSample: Record<string, string> = {
    'رقم التذكرة':    '182758',
    'رقم الفيلا / المرجع': 'NTF-615',
    'اسم العميل':     'بندر بن محمد القحطاني',
    'تاريخ الإصدار': '15/3/2025',
    'الوصف':          'خزان الموية فيه تصدع',
    'عدد الأيام':     '45',
    'المسؤول':        'احمد',
    'المشروع':        'اسم المشروع',
  };

  const sortedTickets = tickets
    .sort((a, b) => {
      const aClosed = a.status === 'closed' ? 1 : 0;
      const bClosed = b.status === 'closed' ? 1 : 0;
      if (aClosed !== bClosed) return aClosed - bClosed;
      const getMs = (t: Ticket) => {
        if (t.issuedAt) { const d = parseIssuedAt(t.issuedAt); if (d) return d.getTime(); }
        return new Date(t.createdAt as any).getTime() ?? 0;
      };
      return getMs(a) - getMs(b);
    });

  // Show project column if tickets span more than one project
  const distinctProjectIds = new Set(tickets.map(t => t.projectId).filter(Boolean));
  const showProjectColumn = user?.role === 'admin' || distinctProjectIds.size > 1;

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedTicketIds.length === 0) return;
    try {
      await ticketsApi.bulkStatus(selectedTicketIds, newStatus);
      toast.success(`تم تحديث حالة ${selectedTicketIds.length} تذكرة`);
      setSelectedTicketIds([]);
      loadData();
    } catch {
      toast.error('فشل تحديث الحالة');
    }
  };

  const handleSendAppointment = () => {
    const selected = tickets.filter(t => selectedTicketIds.includes(t.id));
    if (selected.length === 0) return;
    // Group tickets by clientId (or villaNumber as fallback)
    const byClient = new Map<string, typeof selected>();
    selected.forEach(t => {
      const key = t.clientId || t.villaNumber || 'unknown';
      if (!byClient.has(key)) byClient.set(key, []);
      byClient.get(key)!.push(t);
    });
    byClient.forEach((clientTickets, key) => {
      const first = clientTickets[0];
      const phone =
        clients[first?.clientId]?.phone ??
        Object.values(clients).find(c => c.villaNumber === first?.villaNumber)?.phone ?? '';
      const ids = clientTickets.map(t => t.ticketId || t.refNumber || t.id).join('، ');
      const msg = `السلام عليكم، بخصوص بلاغ الصيانة رقم ${ids}، نرجو إفادتنا بمواعيد تواجدكم في الفيلا لتنسيق موعد الصيانة. شكراً لتعاونكم.`;
      WhatsAppService.sendUpdate(phone, msg);
    });
  };

  const selectedTickets = tickets.filter(t => selectedTicketIds.includes(t.id));
  const uniqueClientIds = new Set(selectedTickets.map(t => t.clientId || t.villaNumber || 'unknown'));
  const isMultiClient = uniqueClientIds.size > 1;

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="text-right">
            <h1 className="text-3xl font-bold text-white tracking-tight">تذاكر الصيانة</h1>
            <p className="text-slate-500 mt-1">إدارة ومتابعة طلبات الصيانة لجميع المشاريع</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Import dialog — project selector first, then file upload */}
            {(user?.role === 'admin' || user?.role === 'engineer') && <Dialog open={importOpen} onOpenChange={v => { setImportOpen(v); if (!v) setImportProjectId(''); }}>
              <DialogTrigger render={
                <Button variant="outline" className="border-border bg-white/5 text-slate-300 hover:text-white gap-2 rounded-xl h-11 px-5 font-bold">
                  <FileUp className="w-4 h-4" /> استيراد تذاكر
                </Button>
              } />
              <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[540px] rounded-3xl shadow-2xl shadow-black/40">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-white text-right">استيراد تذاكر صيانة</DialogTitle>
                </DialogHeader>
                <div className="space-y-5 py-2">
                  {/* Step 1 — Project selector */}
                  <div className="space-y-2">
                    <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">١. اختر المشروع أولاً</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={
                        <Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12">
                          <ChevronDown className="w-4 h-4 opacity-50" />
                          <span>{importProjectId ? (projects[importProjectId]?.name ?? 'اختر المشروع') : 'اختر المشروع'}</span>
                        </Button>
                      } />
                      <DropdownMenuContent className="bg-card border-border text-slate-200 w-80">
                        {Object.values(projects).map(p => (
                          <DropdownMenuItem key={p.id} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setImportProjectId(p.id)}>
                            {p.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Step 2 — File upload (disabled until project chosen) */}
                  <div className="space-y-2">
                    <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">٢. ارفع ملف Excel</Label>
                    <div className={importProjectId && Object.values(clients).some(c => c.projectId === importProjectId) ? '' : 'opacity-40 pointer-events-none select-none'}>
                      {!importProjectId && (
                        <p className="text-amber-400 text-xs text-right mb-2 font-medium">⚠ اختر المشروع أولاً لتفعيل الاستيراد</p>
                      )}
                      {importProjectId && !Object.values(clients).some(c => c.projectId === importProjectId) && (
                        <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-right">
                          <p className="text-amber-300 text-xs font-bold mb-2">لا يمكن استيراد التذاكر: لا يوجد عملاء مضافون لهذا المشروع.</p>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 border-amber-400/40 text-amber-200 hover:text-white"
                            onClick={() => navigate('/clients')}
                          >
                            الانتقال إلى صفحة العملاء
                          </Button>
                        </div>
                      )}
                      <DataImport
                        title="استيراد تذاكر"
                        description="الأعمدة: رقم التذكرة، المرجع، العميل، التاريخ، الوصف، الأيام — النوع والمسؤول يتحددان تلقائياً"
                        fieldDefs={importFieldDefs}
                        templateSample={importTemplateSample}
                        onImport={handleImportTickets}
                        trigger={
                          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-xl h-12 font-bold">
                            <FileUp className="w-4 h-4" /> رفع ملف Excel
                          </Button>
                        }
                      />
                    </div>
                  </div>

                  {/* Info about auto-detection */}
                  {importProjectId && (
                    <div className="bg-white/5 rounded-2xl p-4 text-xs text-right text-slate-400 space-y-1 border border-border/30">
                      <p className="text-slate-300 font-bold mb-2">يتم تلقائياً:</p>
                      <p>• <span className="text-blue-400">نوع الصيانة</span> — من وصف المشكلة (سباكة / كهرباء / أبواب ...)</p>
                      <p>• <span className="text-blue-400">المسؤول</span> — من مشرفي المشروع حسب التخصص</p>
                      <p>• <span className="text-blue-400">بيانات العميل</span> — من رقم الفيلا في قاعدة بيانات المشروع</p>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>}
            {(user?.role === 'admin' || user?.role === 'engineer') && <TicketForm />}
            {(user?.role === 'admin' || user?.role === 'engineer') && <Button
              onClick={handleReassignSupervisors}
              disabled={reassigning}
              variant="outline"
              className="gap-2 rounded-xl h-11 border border-amber-500/30 bg-amber-500/5 text-amber-400 hover:border-amber-500/60 hover:bg-amber-500/10 font-bold"
            >
              {reassigning
                ? <><span className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /> جارٍ التعيين...</>
                : '⚡ إعادة تعيين المشرفين'}
            </Button>}
            {import.meta.env.DEV && user?.role === 'admin' && (
              <Button
                onClick={handleDeleteAll}
                variant="outline"
                className={cn(
                  'gap-2 rounded-xl h-11 border font-bold transition-all',
                  deleteConfirm
                    ? 'border-red-500 bg-red-500/20 text-red-300 hover:bg-red-500/30 animate-pulse'
                    : 'border-red-500/30 bg-red-500/5 text-red-400 hover:border-red-500/60'
                )}
              >
                <AlertTriangle className="w-4 h-4" />
                {deleteConfirm ? 'اضغط مرة ثانية للتأكيد' : 'حذف جميع التذاكر'}
              </Button>
            )}
          </div>
        </div>

        {/* Floating bulk action bar */}
        {selectedTicketIds.length > 0 && (
          <BulkActionBar
            count={selectedTicketIds.length}
            isMultiClient={isMultiClient}
            onStatusChange={handleBulkStatusChange}
            onAppointment={handleSendAppointment}
            onClose={() => setCloseDialogOpen(true)}
            onClear={() => setSelectedTicketIds([])}
          />
        )}

        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl shadow-black/40">
          <TicketTable
            tickets={sortedTickets}
            selectedIds={selectedTicketIds}
            onSelectionChange={setSelectedTicketIds}
            hideProjectColumn={!showProjectColumn}
            projects={projects}
            showInlineFilters
          />
        </div>

        <CloseTicketDialog
          open={closeDialogOpen}
          onOpenChange={setCloseDialogOpen}
          selectedTickets={tickets.filter(t => selectedTicketIds.includes(t.id))}
          clients={Object.values(clients)}
          projects={projects}
          onSuccess={() => { setSelectedTicketIds([]); setCloseDialogOpen(false); loadData(); }}
        />
      </div>
    </Layout>
  );
}