import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { 
  Search, 
  Filter, 
  Calendar,
  Clock,
  Home,
  Tag,
  CheckCircle2,
  AlertTriangle,
  FileUp,
  ChevronDown,
  X,
  Edit,
  MessageCircle,
  CheckSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { TicketTable, parseIssuedAt, statusTranslations, typeTranslations } from '@/components/tickets/TicketTable';
import { DataImport, FieldDef } from '@/components/ui/DataImport';
import { collection, collectionGroup, onSnapshot, query, orderBy, getDocs, addDoc, serverTimestamp, where, writeBatch, doc, updateDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase';
import { Ticket, TicketType, Project, Client } from '@/types';
import { classifyTicket } from '@/services/ticketClassifier';
import { scheduleAiEnrichment } from '@/services/ticketEnricher';
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
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importProjectId, setImportProjectId] = useState('');
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState<TicketType | ''>('');
  const [filterProject, setFilterProject] = useState('');

  useEffect(() => {
    if (!user) return;
    const db = getFirestoreDb();
    const unsub = onSnapshot(collectionGroup(db, 'clients'), snap => {
      const map: Record<string, Client> = {};
      snap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() } as Client; });
      setClients(map);
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    const db = getFirestoreDb();
    const unsubProjects = onSnapshot(collection(db, 'projects'), (snap) => {
      const map: Record<string, Project> = {};
      snap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() } as Project; });
      setProjects(map);
    });
    return () => unsubProjects();
  }, []);

  useEffect(() => {
    const db = getFirestoreDb();

    if (!user) return;

    let q: ReturnType<typeof query> | null = null;

    if (user.role === 'admin') {
      q = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
    } else if (user.role === 'supervisor') {
      // Supervisors only see tickets assigned to them
      q = query(collection(db, 'tickets'), where('assignedSupervisorIds', 'array-contains', user.uid));
    } else if (user.projectIds && user.projectIds.length > 0) {
      q = query(collection(db, 'tickets'), where('projectId', 'in', user.projectIds));
    }

    if (!q) {
      setTickets([]);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const ticketsData = snapshot.docs
        .map(d => ({ id: d.id, ...(d.data() as object) } as Ticket))
        .sort((a, b) => {
          const ta = (a.createdAt as any)?.toMillis?.() ?? new Date(a.createdAt as any).getTime() ?? 0;
          const tb = (b.createdAt as any)?.toMillis?.() ?? new Date(b.createdAt as any).getTime() ?? 0;
          return tb - ta;
        });

      setTickets(ticketsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ── Delete all tickets ──────────────────────────────────────
  const handleDeleteAll = async () => {
    if (!deleteConfirm) { setDeleteConfirm(true); return; }
    setDeleteConfirm(false);
    try {
      const db = getFirestoreDb();
      const snap = await getDocs(collection(db, 'tickets'));
      // Firestore batch limit = 500 ops
      const CHUNK = 499;
      for (let i = 0; i < snap.docs.length; i += CHUNK) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      toast.success(`تم حذف ${snap.docs.length} تذكرة بنجاح`);
    } catch (err) {
      console.error(err);
      toast.error('فشل حذف التذاكر');
    }
  };

  // ── Re-assign supervisors for all tickets missing one ──────
  const [reassigning, setReassigning] = useState(false);

  const handleReassignSupervisors = async () => {
    setReassigning(true);
    const db = getFirestoreDb();
    try {
      // Get tickets without assigned supervisors
      const snap = await getDocs(collection(db, 'tickets'));
      const unassigned = snap.docs.filter(d => {
        const data = d.data();
        const noAssignee = !data.assigneeName || data.assigneeName === '---';
        const noSupervisors = !data.assignedSupervisorIds || data.assignedSupervisorIds.length === 0;
        return noAssignee && noSupervisors;
      });

      if (unassigned.length === 0) {
        toast.info('جميع التذاكر لديها مشرفون مُعيَّنون');
        setReassigning(false);
        return;
      }

      const toastId = 'reassign';
      let noProjectCount = 0;
      let noSupervisorCount = 0;
      toast.loading(`⚙ جارٍ تعيين المشرفين: 0 / ${unassigned.length}`, { id: toastId, duration: Infinity });

      let done = 0;
      const CHUNK = 499;
      let batchUpdates: { ref: any; data: any }[] = [];

      for (const ticketDoc of unassigned) {
        const ticket = ticketDoc.data();
        const ticketType = (ticket.type || 'plumbing') as TicketType;
        const projectId = ticket.projectId || '';

        if (!projectId) { done++; noProjectCount++; continue; }

        const { TYPE_TO_SPECIALTY } = await import('@/services/ticketClassifier');
        const detectedTypes: TicketType[] = ticket.detectedTypes?.length ? ticket.detectedTypes : [ticketType];
        const specialties = [...new Set(detectedTypes.map((t: TicketType) => TYPE_TO_SPECIALTY[t]))] as any[];
        const supervisors = await findMatchingSupervisors(projectId, specialties);
        const primary = supervisors[0];

        if (primary) {
          batchUpdates.push({
            ref: ticketDoc.ref,
            data: {
              assigneeName:          primary.name,
              assignedSupervisorId:  primary.id,
              assignedSupervisorIds: supervisors.map(s => s.id),
              assignedSupervisors:   supervisors,
            },
          });
        } else {
          noSupervisorCount++;
        }

        done++;
        if (done % 10 === 0) {
          toast.loading(`⚙ جارٍ تعيين المشرفين: ${done} / ${unassigned.length}`, { id: toastId, duration: Infinity });
        }
      }

      // Commit batch writes in chunks of 499
      for (let i = 0; i < batchUpdates.length; i += CHUNK) {
        const batch = writeBatch(db);
        batchUpdates.slice(i, i + CHUNK).forEach(({ ref, data }) => batch.update(ref, data));
        await batch.commit();
      }

      toast.success(
        `✅ تم تعيين المشرفين لـ ${batchUpdates.length} تذكرة` +
        (noProjectCount   > 0 ? ` | ${noProjectCount} بدون مشروع`  : '') +
        (noSupervisorCount > 0 ? ` | ${noSupervisorCount} بدون مشرف مطابق` : ''),
        { id: toastId, duration: 8000 }
      );
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
    const db = getFirestoreDb();

    const importPromises = data.map(async (item) => {
      const refNumber    = String(item.refNumber    ?? '').trim();
      const { projectAbbr, villaNumber: refVilla } = parseTicketRef(refNumber);
      const villaNumber  = String(item.villaNumber  ?? refVilla).trim();
      const clientName   = String(item.clientName   ?? '').trim();
      const issuedAtRaw  = item.issuedAt ?? item.date ?? item.issuedDate ?? '';
      const daysOpenRaw  = String(item.daysOpen ?? '').trim();
      // If no issuedAt but daysOpen provided, derive date going back N days
      const derivedIssuedAt = (!issuedAtRaw && daysOpenRaw && !isNaN(Number(daysOpenRaw)))
        ? new Date(Date.now() - Number(daysOpenRaw) * 86400 * 1000)
        : null;
      const issuedAtStr = issuedAtRaw
        ? (() => { const d = parseIssuedAt(issuedAtRaw); return d ? format(d, 'd/M/yyyy') : String(issuedAtRaw).trim(); })()
        : derivedIssuedAt ? format(derivedIssuedAt, 'd/M/yyyy') : '';
      const projectName  = String(item.projectName  ?? '').trim();
      const description  = String(item.description  ?? '').trim();
      const assigneeRaw  = String(item.assigneeName ?? '').trim();
      const assigneeName = assigneeRaw === '---' ? '' : assigneeRaw;
      const ticketId     = String(item.ticketId     ?? '').trim();
      const priorityRaw  = String(item.priority     ?? '').trim();
      const typeRaw      = String(item.ticketType   ?? item.type ?? '').trim();

      // Arabic type → TicketType
      const arabicTypeMap: Record<string, TicketType> = {
        'سباكة': 'plumbing', 'كهرباء': 'electricity', 'أبواب': 'doors',
        'دهانات': 'paints', 'تشققات': 'cracks', 'سيراميك': 'ceramics',
        'عزل خزان': 'tank_insulation',
      };
      const fileType = arabicTypeMap[typeRaw] ?? (typeRaw as TicketType) ?? null;

      // Classify description — use rule-based only during bulk import to avoid Gemini 429 rate limits
      const classification = classifyTicket(description);
      const finalType = fileType || classification.primaryType;

      // Find project — importProjectId takes priority, then column-based matching
      const project = importProjectId
        ? (projects[importProjectId] || null)
        : (Object.values(projects) as Project[]).find(
            p => p.name === projectName || p.abbreviation === projectName ||
                 (projectAbbr && p.abbreviation === projectAbbr)
          ) || null;

      // Auto-assign supervisors
      const supervisors = project
        ? await findMatchingSupervisors(project.id, classification.requiredSpecialties)
        : [];
      const primarySupervisor = supervisors[0];

      // Look up client by villa number — use project subcollection if project found
      let clientId = '';
      let resolvedClientName = clientName;
      if (villaNumber) {
        try {
          const clientQ = project
            ? query(collection(db, `projects/${project.id}/clients`), where('villaNumber', '==', villaNumber))
            : query(collection(db, 'clients'), where('villaNumber', '==', villaNumber));
          const snap = await getDocs(clientQ);
          if (!snap.empty) {
            const cd = snap.docs[0];
            clientId = cd.id;
            resolvedClientName = (cd.data() as Client).name || clientName;
          }
        } catch (_) { /* client not found */ }
      }

      const priorityNum = priorityRaw ? (isNaN(Number(priorityRaw)) ? 3 : Number(priorityRaw)) : 3;

      return addDoc(collection(db, 'tickets'), {
        ticketId,
        refNumber,
        projectAbbr,
        issuedAt: issuedAtStr,
        assigneeName: assigneeName || primarySupervisor?.name || '',
        assignedSupervisorId:  primarySupervisor?.id  || '',
        assignedSupervisorIds: supervisors.map(s => s.id),
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
        createdAt: serverTimestamp(),
        createdBy: user?.uid,
      });
    });

    const docRefs = await Promise.all(importPromises);
    setImportOpen(false);
    setImportProjectId('');

    // Fire-and-forget: AI enrichment runs sequentially with delay after dialog closes
    const resolvedProjectId = importProjectId || '';
    const enrichJobs = docRefs.map((ref, i) => ({
      docRef: ref,
      description: String(data[i].description ?? '').trim(),
      projectId: resolvedProjectId ||
        (Object.values(projects) as Project[]).find(p => {
          const abbr = parseTicketRef(String(data[i].refNumber ?? '')).projectAbbr;
          return p.name === String(data[i].projectName ?? '') || (abbr && p.abbreviation === abbr);
        })?.id || '',
    }));

    const AI_TOAST_ID = 'ai-enrichment';
    toast.loading(`🤖 جارٍ تحسين التصنيف: 0 / ${enrichJobs.length}`, { id: AI_TOAST_ID, duration: Infinity });

    scheduleAiEnrichment(enrichJobs, ({ done, total, failed, finished }) => {
      if (finished) {
        if (failed === 0) {
          toast.success(`✅ اكتمل التصنيف الذكي: ${total} تذكرة`, { id: AI_TOAST_ID, duration: 6000 });
        } else {
          toast.warning(`⚠ اكتمل التصنيف: ${total - failed} نجح، ${failed} فشل`, { id: AI_TOAST_ID, duration: 8000 });
        }
      } else {
        toast.loading(`🤖 جارٍ تحسين التصنيف: ${done} / ${total}${failed > 0 ? ` (${failed} فشل)` : ''}`, { id: AI_TOAST_ID, duration: Infinity });
      }
    }); // intentionally not awaited
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

  const filteredTickets = tickets
    .filter(ticket => {
      const s = searchTerm.toLowerCase();
      const matchSearch = !s ||
        ticket.villaNumber?.toLowerCase().includes(s) ||
        ticket.description?.toLowerCase().includes(s) ||
        ticket.clientName?.toLowerCase().includes(s) ||
        ticket.ticketId?.toLowerCase().includes(s) ||
        ticket.refNumber?.toLowerCase().includes(s);
      const matchStatus = !filterStatus || ticket.status === filterStatus;
      const matchType = !filterType ||
        ticket.type === filterType ||
        (ticket.detectedTypes as string[] | undefined)?.includes(filterType);
      const matchProject = !filterProject || ticket.projectId === filterProject;
      return matchSearch && matchStatus && matchType && matchProject;
    })
    .sort((a, b) => {
      // Closed tickets always at the bottom
      const aClosed = a.status === 'closed' ? 1 : 0;
      const bClosed = b.status === 'closed' ? 1 : 0;
      if (aClosed !== bClosed) return aClosed - bClosed;
      // Oldest first: use issuedAt when present, fall back to createdAt
      const getMs = (t: Ticket) => {
        if (t.issuedAt) { const d = parseIssuedAt(t.issuedAt); if (d) return d.getTime(); }
        return (t.createdAt as any)?.toMillis?.() ?? new Date(t.createdAt as any).getTime() ?? 0;
      };
      return getMs(a) - getMs(b);
    });

  // Show project column if tickets span more than one project
  const distinctProjectIds = new Set(tickets.map(t => t.projectId).filter(Boolean));
  const showProjectColumn = user?.role === 'admin' || distinctProjectIds.size > 1;

  const activeFiltersCount = [filterStatus, filterType, filterProject].filter(Boolean).length;

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedTicketIds.length === 0) return;
    const db = getFirestoreDb();
    const batch = writeBatch(db);
    selectedTicketIds.forEach(id => batch.update(doc(db, 'tickets', id), { status: newStatus }));
    try {
      await batch.commit();
      toast.success(`تم تحديث حالة ${selectedTicketIds.length} تذكرة`);
      setSelectedTicketIds([]);
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
                    <div className={importProjectId ? '' : 'opacity-40 pointer-events-none select-none'}>
                      {!importProjectId && (
                        <p className="text-amber-400 text-xs text-right mb-2 font-medium">⚠ اختر المشروع أولاً لتفعيل الاستيراد</p>
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

        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <div className="relative flex-1">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input 
              placeholder="البحث برقم التذكرة، العميل، أو الوصف..." 
              className="pr-12 bg-card border-border rounded-2xl h-12 text-white text-right"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* Status filter */}
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="outline" className={cn(
                  'border-border bg-card text-slate-300 rounded-2xl h-12 gap-2 px-4 font-medium',
                  filterStatus && 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                )}>
                  <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                  {filterStatus ? statusTranslations[filterStatus] ?? filterStatus : 'الحالة'}
                </Button>
              } />
              <DropdownMenuContent className="bg-card border-border text-slate-200">
                <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setFilterStatus('')}>كل الحالات</DropdownMenuItem>
                {Object.entries(statusTranslations).map(([k, v]) => (
                  <DropdownMenuItem key={k} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setFilterStatus(k)}>{v}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Type filter */}
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="outline" className={cn(
                  'border-border bg-card text-slate-300 rounded-2xl h-12 gap-2 px-4 font-medium',
                  filterType && 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                )}>
                  <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                  {filterType ? typeTranslations[filterType] ?? filterType : 'التخصص'}
                </Button>
              } />
              <DropdownMenuContent className="bg-card border-border text-slate-200">
                <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setFilterType('')}>كل التخصصات</DropdownMenuItem>
                {Object.entries(typeTranslations).map(([k, v]) => (
                  <DropdownMenuItem key={k} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setFilterType(k as TicketType)}>{v}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Project filter — only when multiple projects */}
            {showProjectColumn && (
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button variant="outline" className={cn(
                    'border-border bg-card text-slate-300 rounded-2xl h-12 gap-2 px-4 font-medium',
                    filterProject && 'border-blue-500/50 bg-blue-500/10 text-blue-300'
                  )}>
                    <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                    {filterProject ? (projects[filterProject]?.name ?? 'المشروع') : 'المشروع'}
                  </Button>
                } />
                <DropdownMenuContent className="bg-card border-border text-slate-200">
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setFilterProject('')}>كل المشاريع</DropdownMenuItem>
                  {Object.values(projects).map(p => (
                    <DropdownMenuItem key={p.id} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setFilterProject(p.id)}>{p.name}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Clear filters */}
            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                className="rounded-2xl h-12 px-4 text-slate-500 hover:text-white gap-1"
                onClick={() => { setFilterStatus(''); setFilterType(''); setFilterProject(''); }}
              >
                <X className="w-3.5 h-3.5" />
                مسح ({activeFiltersCount})
              </Button>
            )}
          </div>
        </div>
        {/* Floating bulk action bar */}
        {selectedTicketIds.length > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900/95 backdrop-blur-md border border-blue-500/30 rounded-2xl shadow-2xl shadow-black/60 px-3 py-2.5 w-[calc(100vw-2rem)] max-w-2xl">
            <div className="flex flex-col text-right px-3 border-r border-white/10 shrink-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">المختارة</span>
              <span className="text-lg font-black text-blue-400">{selectedTicketIds.length}</span>
            </div>
            <div className="flex items-center gap-2 flex-1 flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button variant="outline" size="sm" className="border-blue-500/30 bg-blue-500/10 text-blue-400 font-bold rounded-xl gap-1.5 h-9 px-3">
                    <Edit className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">تغيير الحالة</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                } />
                <DropdownMenuContent className="bg-card border-border text-slate-200">
                  <DropdownMenuItem className="text-right justify-end hover:bg-white/5" onClick={() => handleBulkStatusChange('open')}>مفتوحة</DropdownMenuItem>
                  <DropdownMenuItem className="text-right justify-end hover:bg-white/5" onClick={() => handleBulkStatusChange('in-progress')}>قيد التنفيذ</DropdownMenuItem>
                  <DropdownMenuItem className="text-right justify-end hover:bg-white/5" onClick={() => handleBulkStatusChange('waiting')}>بانتظار الموعد</DropdownMenuItem>
                  <DropdownMenuItem className="text-right justify-end hover:bg-white/5" onClick={() => handleBulkStatusChange('pending')}>معلقة</DropdownMenuItem>
                  <DropdownMenuItem className="text-right justify-end hover:bg-white/5" onClick={() => handleBulkStatusChange('completed')}>مكتملة</DropdownMenuItem>
                  <DropdownMenuItem className="text-right justify-end hover:bg-white/5" onClick={() => handleBulkStatusChange('closed')}>مغلقة</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="sm"
                className="border-green-500/30 bg-green-500/10 text-green-400 font-bold rounded-xl gap-1.5 h-9 px-3"
                onClick={handleSendAppointment}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">تحديد موعد</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                disabled={isMultiClient}
                title={isMultiClient ? 'الإغلاق يتطلب تذاكر لنفس العميل' : undefined}
                className="border-yellow-500/30 bg-yellow-500/10 text-yellow-400 font-bold rounded-xl gap-1.5 h-9 px-3 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => setCloseDialogOpen(true)}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">إغلاق التذكرة</span>
              </Button>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-slate-500 hover:text-white h-9 w-9"
              onClick={() => setSelectedTicketIds([])}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl shadow-black/40">
          <TicketTable
            tickets={filteredTickets}
            selectedIds={selectedTicketIds}
            onSelectionChange={setSelectedTicketIds}
            hideProjectColumn={!showProjectColumn}
            projects={projects}
          />
        </div>

        <CloseTicketDialog
          open={closeDialogOpen}
          onOpenChange={setCloseDialogOpen}
          selectedTickets={tickets.filter(t => selectedTicketIds.includes(t.id))}
          clients={Object.values(clients)}
          projects={projects}
          onSuccess={() => { setSelectedTicketIds([]); setCloseDialogOpen(false); }}
        />
      </div>
    </Layout>
  );
}