import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Briefcase, 
  MapPin, 
  Users, 
  Ticket as TicketIcon,
  Plus,
  UserCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageCircle,
  Edit,
  Trash2,
  MoreVertical,
  CheckSquare,
  Square,
  CheckCircle,
  XCircle,
  Calendar
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Project, Ticket, Client, User, TicketType } from '@/types';
import { doc, onSnapshot, collection, query, where, getDocs, getDoc, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase';
import { TicketCard } from '@/components/tickets/TicketCard';
import { TicketTable, BulkActionBar } from '@/components/tickets/TicketTable';
import { ClientForm } from '@/components/clients/ClientForm';
import { TicketForm } from '@/components/tickets/TicketForm';
import { CloseTicketDialog } from '@/components/tickets/CloseTicketDialog';
import { DataImport } from '@/components/ui/DataImport';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, differenceInDays, parse, isValid } from 'date-fns';
import { ar } from 'date-fns/locale';
import { classifyTicket } from '@/services/ticketClassifier';
import { findMatchingSupervisors } from '@/services/supervisorAssignment';

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [engineers, setEngineers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    const db = getFirestoreDb();
    
    // Project listener
    const unsubProject = onSnapshot(doc(db, 'projects', id), async (snapshot) => {
      if (snapshot.exists()) {
        const pData = { id: snapshot.id, ...snapshot.data() } as Project;
        setProject(pData);

        // Fetch engineers
        if (pData.engineerIds?.length > 0) {
          const engs: User[] = [];
          for (const uid of pData.engineerIds) {
            const uDoc = await getDoc(doc(db, 'users', uid));
            if (uDoc.exists()) {
              engs.push({ uid: uDoc.id, ...uDoc.data() } as User);
            }
          }
          setEngineers(engs);
        }
      } else {
        navigate('/projects');
      }
    }, (error) => {
      console.error("Project listener error:", error);
    });

    // Tickets listener
    const unsubTickets = onSnapshot(query(collection(db, 'tickets'), where('projectId', '==', id)), (snapshot) => {
      setTickets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ticket)));
    }, (error) => {
      console.error("Tickets listener error:", error);
    });

    // Clients listener
    const unsubClients = onSnapshot(collection(db, `projects/${id}/clients`), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
      setLoading(false);
    }, (error) => {
      console.error("Clients listener error:", error);
      setLoading(false);
    });

    return () => {
      unsubProject();
      unsubTickets();
      unsubClients();
    };
  }, [id, navigate]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      </Layout>
    );
  }

  if (!project) return null;

  const toggleSelectTicket = (ticketId: string) => {
    setSelectedTicketIds(prev => 
      prev.includes(ticketId) 
        ? prev.filter(id => id !== ticketId)
        : [...prev, ticketId]
    );
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedTicketIds.length === 0) return;
    const db = getFirestoreDb();
    const batch = writeBatch(db);

    selectedTicketIds.forEach(id => {
      const ref = doc(db, 'tickets', id);
      batch.update(ref, { status: newStatus });
    });

    try {
      await batch.commit();
      toast.success('تم تحديث حالة التذاكر المختارة');
      setSelectedTicketIds([]);
    } catch (error) {
      console.error('Error updating tickets:', error);
      toast.error('فشل تحديث حالة التذاكر');
    }
  };

  const handleSendWhatsApp = () => {
    if (selectedTicketIds.length === 0) return;

    // Group selected tickets by villa/client
    const selectedTickets = tickets.filter(t => selectedTicketIds.includes(t.id));
    const byVilla: Record<string, Ticket[]> = {};
    
    selectedTickets.forEach(t => {
      if (!byVilla[t.villaNumber]) byVilla[t.villaNumber] = [];
      byVilla[t.villaNumber].push(t);
    });

    // For now, let's process the first villa's tickets to avoid pop-up blockers
    const villaNumbers = Object.keys(byVilla);
    if (villaNumbers.length > 1) {
      toast.info('سيتم فتح واتساب لأول فيلا مختارة فقط حالياً');
    }

    const targetVilla = villaNumbers[0];
    const villaTickets = byVilla[targetVilla];
    const firstTicket = villaTickets[0];
    const client = clients.find(c => c.id === firstTicket.clientId || c.phone === firstTicket.clientId); // Fallback handle
    
    // We might need to find client by villa if ID is missing or mismatched
    const targetClient = client || clients.find(c => c.villaNumber === targetVilla);

    if (!targetClient?.phone) {
      toast.error('لم يتم العثور على رقم هاتف لهذا العميل');
      return;
    }

    const ticketIdsList = villaTickets.map(t => t.ticketId || t.refNumber).join('، ');
    const message = `السلام عليكم، بخصوص بلاغ الصيانة رقم ${ticketIdsList} لوحدتكم فيلا ${targetVilla}، نرجو إفادتنا بمواعيد تواجدكم لتنسيق موعد الصيانة.`;
    
    const phone = targetClient.phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const statusTranslations: Record<string, string> = {
    'open': 'مفتوحة',
    'in-progress': 'جاري العمل',
    'waiting': 'بانتظار الموعد',
    'closed': 'مغلقة'
  };

  const typeTranslations: Record<string, string> = {
    'electricity': 'كهرباء',
    'plumbing': 'سباكة',
    'doors': 'أبواب',
    'paints': 'دهانات',
    'cracks': 'تشققات',
    'ceramics': 'سيراميك',
    'tank_insulation': 'عزل خزان',
  };

  const specialtyTranslations: Record<string, string> = {
    'mechanics': 'ميكانيكا',
    'electricity': 'كهرباء',
    'general': 'عام',
  };

  const specialtyColors: Record<string, string> = {
    'mechanics': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'electricity': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'general': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };

  const handleImportClients = async (data: any[]) => {
    const db = getFirestoreDb();
    const batch = data.map(item => {
      return addDoc(collection(db, `projects/${project.id}/clients`), {
        name: item.name || item['الاسم'] || '',
        phone: String(item.phone || item['الهاتف'] || ''),
        villaNumber: String(item.villaNumber || item['رقم الفيلا'] || ''),
        handoverDate: item.handoverDate || item['تاريخ الاستلام'] || '',
        warrantyExpiryDate: item.warrantyExpiryDate || item['انتهاء الضمان'] || '',
        projectId: project.id,
        createdAt: new Date().toISOString()
      });
    });
    await Promise.all(batch);
    toast.success('تم استيراد العملاء بنجاح');
  };

  const handleImportTickets = async (data: any[]) => {
    const db = getFirestoreDb();

    // Parse 'ABBR-NUMBER' reference → { projectAbbr, villaNumber }
    const parseTicketRef = (ref: string) => {
      const m = ref.match(/^([A-Za-z]+)-?(\d+)$/);
      return m ? { projectAbbr: m[1].toUpperCase(), villaNumber: m[2] } : { projectAbbr: '', villaNumber: '' };
    };

    // ── Abbreviation mismatch check ────────────────────────────────────────
    const projectAbbr = project!.abbreviation?.toUpperCase() ?? '';
    const foreignAbbrs = [...new Set(
      data
        .map(item => parseTicketRef(String(item.refNumber ?? '').trim()).projectAbbr)
        .filter(abbr => abbr && abbr !== projectAbbr)
    )];
    if (foreignAbbrs.length > 0) {
      throw new Error(
        `هذه التذاكر تابعة لمشروع آخر (${foreignAbbrs.join(', ')}) وليس لمشروع "${project!.abbreviation}". تأكد من الملف الصحيح.`
      );
    }

    // Arabic type names → TicketType
    const arabicTypeMap: Record<string, TicketType> = {
      'سباكة': 'plumbing', 'كهرباء': 'electricity', 'أبواب': 'doors',
      'دهانات': 'paints', 'تشققات': 'cracks', 'سيراميك': 'ceramics',
      'عزل خزان': 'tank_insulation',
    };

    const importPromises = data.map(async (item) => {
      const refNumber    = String(item.refNumber    ?? '').trim();
      const { projectAbbr, villaNumber: refVilla } = parseTicketRef(refNumber);
      const villaNumber  = String(item.villaNumber  ?? refVilla).trim();
      const clientName   = String(item.clientName   ?? '').trim();
      const issuedAtRaw  = String(item.issuedAt ?? item.date ?? '').trim();
      const description  = String(item.description  ?? '').trim();
      const assigneeName = String(item.assigneeName ?? '').trim();
      const ticketId     = String(item.ticketId     ?? '').trim();
      const priorityRaw  = String(item.priority     ?? '').trim();
      const typeRaw      = String(item.ticketType   ?? item.type ?? '').trim();
      const fileType     = arabicTypeMap[typeRaw] ?? (typeRaw as TicketType) ?? null;

      // Classify description (rule-based)
      const classification = classifyTicket(description);
      const finalType = fileType || classification.primaryType;

      // Auto-assign supervisors
      const supervisors = await findMatchingSupervisors(project!.id, classification.requiredSpecialties);
      const primarySupervisor = supervisors[0];

      // Look up client by villa number — uses project subcollection
      let clientId = '';
      let resolvedClientName = clientName;
      if (villaNumber) {
        try {
          const clientQ = query(
            collection(db, `projects/${project!.id}/clients`),
            where('villaNumber', '==', villaNumber)
          );
          const snap = await getDocs(clientQ);
          if (!snap.empty) {
            const cd = snap.docs[0];
            clientId = cd.id;
            resolvedClientName = (cd.data() as Client).name || clientName;
          }
        } catch (_) {}
      }

      const priorityNum = priorityRaw ? (isNaN(Number(priorityRaw)) ? 3 : Number(priorityRaw)) : 3;

      return addDoc(collection(db, 'tickets'), {
        ticketId,
        refNumber,
        projectAbbr,
        issuedAt: issuedAtRaw,
        assigneeName: assigneeName || primarySupervisor?.name || '',
        assignedSupervisorId:  primarySupervisor?.id  || '',
        assignedSupervisorIds: supervisors.map(s => s.id),
        assignedSupervisors:   supervisors,
        detectedTypes:         classification.allTypes,
        projectId:  project!.id,
        clientId,
        clientName: resolvedClientName,
        villaNumber,
        description,
        type:   finalType,
        status: 'open',
        priority: priorityNum,
        createdAt: serverTimestamp(),
        createdBy: currentUser?.uid,
      });
    });

    await Promise.all(importPromises);
    toast.success(`تم استيراد ${data.length} تذكرة بنجاح`);
  };

  return (
    <Layout>
      <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-700">
        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-slate-400 hover:text-white rounded-2xl bg-white/5 order-last sm:order-first"
              onClick={() => navigate('/projects')}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="text-right flex-1">
              <div className="flex items-center gap-2 mb-1 justify-end">
                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] uppercase font-bold px-3">
                  {project.abbreviation}
                </Badge>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{project.name}</h1>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 w-full sm:w-auto sm:mr-auto">
            {(currentUser?.role === 'admin' || currentUser?.role === 'engineer') && (
              <>
                <DataImport 
                  title="استيراد تذاكر"
                  description="ارفع ملف Excel أو PDF ثم حدد أي عمود يقابل كل حقل."
                  fieldDefs={[
                    { key: 'ticketId',     label: 'رقم التذكرة',        aliases: ['#', 'الرقم', 'رقم', 'id', 'ID', 'رقم التذكرة', 'تذكرة'] },
                    { key: 'refNumber',    label: 'رقم الفيلا / المرجع', aliases: ['NTF', 'المرجع', 'رقم الفيلا', 'الرقم المرجعي', 'ref'] },
                    { key: 'clientName',   label: 'اسم العميل',         aliases: ['العميل', 'اسم العميل', 'المالك', 'الاسم', 'client', 'name'] },
                    { key: 'issuedAt',     label: 'تاريخ الإصدار',       aliases: ['التاريخ', 'تاريخ', 'date', 'تاريخ الاصدار'] },
                    { key: 'description',  label: 'الوصف',              aliases: ['الوصف', 'المشكلة', 'الملاحظات', 'وصف', 'description'] },
                    { key: 'daysOpen',     label: 'عدد الأيام',         aliases: ['أيام', 'الأيام', 'عدد الأيام', 'days', 'مدة'] },
                    { key: 'assigneeName', label: 'المسؤول',            aliases: ['المسؤول', 'المهندس', 'المشرف', 'assignee'] },
                    { key: 'ticketType',   label: 'نوع الصيانة',        aliases: ['النوع', 'نوع', 'type', 'الصيانة', 'التصنيف'] },
                  ]}
                  onImport={handleImportTickets}
                  trigger={
                    <Button variant="outline" className="border-border bg-white/5 text-slate-400 hover:text-white rounded-2xl gap-2 h-10 px-4">
                      <Plus className="w-4 h-4" />
                      استيراد تذاكر
                    </Button>
                  }
                />
                <ClientForm projectId={project.id} />
                <TicketForm projectId={project.id} />
              </>
            )}
          </div>
        </div>

        {/* Action Bar for selected tickets */}
        {selectedTicketIds.length > 0 && (() => {
          const selTickets = tickets.filter(t => selectedTicketIds.includes(t.id));
          const uniqueClientKeys = new Set(selTickets.map(t => t.clientId || t.villaNumber || 'unknown'));
          const isMultiClient = uniqueClientKeys.size > 1;
          return (
            <BulkActionBar
              count={selectedTicketIds.length}
              isMultiClient={isMultiClient}
              onStatusChange={handleBulkStatusChange}
              onAppointment={handleSendWhatsApp}
              onClose={() => setIsCloseDialogOpen(true)}
              onClear={() => setSelectedTicketIds([])}
              statusOptions={[
                { key: 'open', label: 'مفتوحة' },
                { key: 'in-progress', label: 'جاري العمل' },
                { key: 'waiting', label: 'بانتظار الموعد' },
              ]}
            />
          );
        })()}

        {/* Primary Content: Tickets Table */}
        <div className="space-y-3">
          <h2 className="text-xl font-bold text-white">إدارة تذاكر المشروع</h2>
          <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl shadow-black/40">
            <TicketTable
              tickets={tickets}
              selectedIds={selectedTicketIds}
              onSelectionChange={setSelectedTicketIds}
              hideSupervisorColumn={currentUser?.role === 'supervisor'}
              emptyMessage="لا توجد تذاكر مسجلة لهذا المشروع"
              maxHeight="calc(100vh - 320px)"
              showInlineFilters
            />
          </div>
        </div>

        {/* Statistics and Secondary Info */}
        <div className="grid grid-cols-12 gap-6 sm:gap-8">
          <div className="col-span-12 lg:col-span-8 space-y-6 sm:space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              <Card className="bg-card border-border rounded-3xl shadow-xl shadow-black/20">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-4">
                    <TicketIcon className="w-6 h-6" />
                  </div>
                  <div className="text-2xl font-black text-white">{tickets.length}</div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">إجمالي التذاكر</div>
                </CardContent>
              </Card>
              <Card className="bg-card border-border rounded-3xl shadow-xl shadow-black/20">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-4">
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <div className="text-2xl font-black text-white">{clients.length}</div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">إجمالي العملاء</div>
                </CardContent>
              </Card>
              <Card className="bg-card border-border rounded-3xl shadow-xl shadow-black/20">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 mb-4">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div className="text-2xl font-black text-white">{tickets.filter(t => t.status === 'open').length}</div>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">تذاكر مفتوحة</div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-4 space-y-8">
            <Card className="bg-card border-border rounded-3xl shadow-xl shadow-black/20">
              <CardHeader className="border-b border-white/5 p-6">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest text-right">معلومات المشروع</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <MapPin className="w-3.5 h-3.5" />
                      الموقع
                    </div>
                    <span className="text-xs text-slate-300 font-bold">{project.location}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Users className="w-3.5 h-3.5" />
                      المهندسين
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {engineers.map(eng => (
                        <span key={eng.uid} className="text-xs text-slate-300">{eng.displayName}</span>
                      ))}
                      {engineers.length === 0 && <span className="text-xs text-slate-500">لا يوجد</span>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <CloseTicketDialog 
        open={isCloseDialogOpen}
        onOpenChange={setIsCloseDialogOpen}
        selectedTickets={tickets.filter(t => selectedTicketIds.includes(t.id))}
        clients={clients}
        onSuccess={() => setSelectedTicketIds([])}
      />
    </Layout>
  );
}
