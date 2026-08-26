import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft,
  User,
  Tag,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  MapPin,
  CalendarDays,
  Pencil,
  Phone,
  PhoneCall,
  ChevronDown,
  Clock,
  ExternalLink,
  X,
  ZoomIn,
  ChevronLeft,
  ChevronRight,
  Play,
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatAppointmentDayTime } from '@/lib/utils';
import { CloseTicketDialog } from '@/components/tickets/CloseTicketDialog';
import { ReassignSupervisorButton } from '@/components/tickets/ReassignSupervisorButton';
import { UnifiedAppointmentDialog } from '@/components/tickets/UnifiedAppointmentDialog';
import { TypesSelector } from '@/components/tickets/TypesSelector';
import { Ticket, TicketType, Project, Client } from '@/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ticketsApi, projectsApi, clientsApi, whatsappApi, auditApi, settingsApi, appointmentsApi } from '@/lib/api';
import { invalidateTicketCache } from '@/lib/ticketCache';
import { learnFromCorrection, getAuthHeaders } from '@/services/classificationApi';
import { toast } from 'sonner';


function TryImage({ url, index, onOpen }: { url: string; index: number; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-3 p-4 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all h-max">
        <ExternalLink className="w-5 h-5 shrink-0" />
        <span className="text-sm font-bold text-right">فتح الصورة في تبويب جديد</span>
      </a>
    );
  }
  return (
    <button onClick={onOpen}
      className="relative group block rounded-2xl overflow-hidden border border-white/10 bg-black/20 hover:border-white/30 transition-all flex items-center justify-center min-h-[160px] w-full cursor-pointer">
      <img src={url} alt={`مرفق ${index + 1}`}
        className="w-full h-auto max-h-80 object-contain"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={() => setFailed(true)} />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
        <ZoomIn className="w-8 h-8 text-white drop-shadow-lg" />
      </div>
    </button>
  );
}

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);

  const [lightbox, setLightbox] = useState<{ items: { url: string; type: 'image' | 'video' }[]; index: number } | null>(null);

  const isVideo = (url: string) => /\.(mp4|webm|ogg|mov|avi|mkv)(\?.*)?$/i.test(url);

  const openLightbox = (items: { url: string; type: 'image' | 'video' }[], index: number) => setLightbox({ items, index });
  const closeLightbox = () => setLightbox(null);
  const lightboxPrev = () => setLightbox(lb => lb ? { ...lb, index: (lb.index - 1 + lb.items.length) % lb.items.length } : null);
  const lightboxNext = () => setLightbox(lb => lb ? { ...lb, index: (lb.index + 1) % lb.items.length } : null);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') lightboxNext();
      if (e.key === 'ArrowRight') lightboxPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  const renderDetailedDescription = (text?: string) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex) || [];
    const cleanText = text.replace(urlRegex, '').trim();

    const mediaItems = urls.map(url => ({ url, type: isVideo(url) ? 'video' as const : 'image' as const }));

    return (
      <div className="space-y-6">
        {cleanText && (
          <p className="text-slate-300 leading-relaxed text-right text-lg whitespace-pre-wrap break-words">
            {cleanText}
          </p>
        )}
        {urls.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 border-t border-white/5 pt-6">
            {mediaItems.map((item, i) => {
              if (item.type === 'video') {
                return (
                  <div
                    key={i}
                    className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/20 flex items-center justify-center min-h-[160px] cursor-pointer group"
                    onClick={() => openLightbox(mediaItems, i)}
                  >
                    <video src={item.url} className="w-full h-auto max-h-80 outline-none pointer-events-none" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="w-12 h-12 text-white drop-shadow-lg" />
                    </div>
                  </div>
                );
              }
              return (
                <TryImage
                  key={i}
                  url={item.url}
                  index={i}
                  onOpen={() => openLightbox(mediaItems, i)}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  };
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Edit dialog state ──
  const [editOpen, setEditOpen] = useState(false);
  const [editStatus, setEditStatus] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTypes, setEditTypes] = useState<TicketType[]>([]);
  const [editSubTypeIds, setEditSubTypeIds] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [availableSupervisors, setAvailableSupervisors] = useState<{uid: string; displayName: string; specialties: string[]}[]>([]);
  const [editAssignedSupervisorIds, setEditAssignedSupervisorIds] = useState<string[]>([]);
  const [supervisorsLoading, setSupervisorsLoading] = useState(false);

  // ── Approval state ──

  // ── Appointment dialog state ──
  const [apptOpen, setApptOpen] = useState(false);
  const [waSent, setWaSent] = useState(false);
  const [waSending, setWaSending] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'audit'>('details');

  const loadAudit = async () => {
    if (!id) return;
    try { setAuditLog(await auditApi.getForTicket(id)); } catch {}
  };

  const loadData = async () => {
    if (!id) return;
    try {
      const ticketData = await ticketsApi.get(id);
      if (!ticketData) { toast.error('التذكرة غير موجودة'); navigate('/tickets'); return; }
      setTicket(ticketData as Ticket);
      if (ticketData.projectId) {
        const proj = await projectsApi.get(ticketData.projectId);
        if (proj) setProject(proj as Project);
      }
      if (ticketData.clientId && ticketData.projectId) {
        const projectClients = await clientsApi.getByProject(ticketData.projectId);
        const found = (projectClients as Client[]).find(c => c.id === ticketData.clientId);
        if (found) setClient(found);
      }
    } catch {
      navigate('/tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); loadAudit(); }, [id, navigate]);

  const typeTranslations: Record<string, string> = {
    'electricity': 'كهرباء',
    'plumbing': 'سباكة',
    'doors': 'أبواب',
    'paints': 'دهانات',
    'painting': 'دهانات',
    'cracks': 'تشققات',
    'ceramics': 'سيراميك',
    'tiles': 'سيراميك',
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
  };

  const statusTranslations: Record<string, string> = {
    'open': 'مفتوحة',
    'in-progress': 'قيد التنفيذ',
    'pending': 'معلقة',
    'completed': 'مكتملة',
    'closed': 'مغلقة',
    'out-of-scope': 'خارج اختصاص',
  };

  const priorityTranslations: Record<string, string> = {
    '3': '3 - منخفض',
    '4': '4 - عادي',
    '6': '6 - متوسط',
    '7': '7 - مرتفع',
    '9': '9 - عاجل جداً',
    'low': 'منخفضة',
    'medium': 'متوسطة',
    'high': 'عالية',
    'urgent': 'عاجلة',
  };

  const openEdit = () => {
    if (!ticket) return;
    setEditStatus(ticket.status);
    setEditPriority(String(ticket.priority));
    setEditDescription(ticket.description || '');
    const initTypes = (ticket.detectedTypes as TicketType[] | undefined)?.length
      ? [...new Set(ticket.detectedTypes as TicketType[])]
      : [ticket.type];
    setEditTypes(initTypes);
    setEditSubTypeIds([...new Set(((ticket as any).detectedSubTypeIds ?? []) as string[])]);
    setEditAssignedSupervisorIds(
      ticket.assignedSupervisorIds
        ? [...new Set(ticket.assignedSupervisorIds as string[])]
        :
      (ticket.assignedSupervisorId ? [ticket.assignedSupervisorId as string] : [])
    );
    setEditOpen(true);
  };

  // ── جلب المشرفين مباشرة من DB عند فتح المودال ──
  useEffect(() => {
    if (!editOpen || !ticket?.projectId) return;
    setSupervisorsLoading(true);
    fetch(`/api/projects/${ticket.projectId}/supervisors`, {
      headers: getAuthHeaders(),
    })
      .then(r => r.json())
      .then(data => setAvailableSupervisors(Array.isArray(data) ? data : []))
      .catch(() => toast.error('تعذر جلب المشرفين'))
      .finally(() => setSupervisorsLoading(false));
  }, [editOpen, ticket?.projectId]);

  const handleSaveEdit = async () => {
    if (!ticket) return;
    setEditSaving(true);

    const originalTypes = ((ticket.detectedTypes as TicketType[] | undefined)?.length
      ? [...new Set(ticket.detectedTypes as TicketType[])]
      : [ticket.type]
    ).sort();
    const newTypes = [...editTypes].sort();
    const typesChanged =
      originalTypes.length !== newTypes.length ||
      originalTypes.some((t, i) => t !== newTypes[i]);

    try {
      const selectedSupervisors = availableSupervisors.filter(s => editAssignedSupervisorIds.includes(s.uid));
      await ticketsApi.update(ticket.id, {
        status:                 editStatus,
        description:            editDescription,
        priority:               isNaN(Number(editPriority)) ? editPriority : Number(editPriority),
        type:                   editTypes[0] as TicketType,
        detectedTypes:          editTypes,
        detectedSubTypeIds:     editSubTypeIds,
        assigneeName:           selectedSupervisors[0]?.displayName ?? ticket.assigneeName ?? '',
        assignedSupervisorId:   editAssignedSupervisorIds[0] ?? '',
        assignedSupervisorIds:  editAssignedSupervisorIds,
        assignedSupervisors:    selectedSupervisors,
      });
      invalidateTicketCache();

      if (typesChanged && editTypes.length > 0) {
        const primaryTypeKey = editTypes[0];
        learnFromCorrection(ticket.description || primaryTypeKey, primaryTypeKey)
          .then(result => console.log(`[Learn] تم تعلم ${result.learned} كلمات للنوع ${primaryTypeKey}`))
          .catch(() => {});
      }

      toast.success(`تم تحديث حالة التذكرة إلى: ${statusTranslations[editStatus] || editStatus}`);
      setEditOpen(false);
      loadData();
    } catch {
      toast.error('فشل تحديث التذكرة');
    } finally {
      setEditSaving(false);
    }
  };


  const todayStr = () => new Date().toISOString().split('T')[0];

  const handleWhatsApp = async () => {
    const phone = client?.phone?.replace(/\D/g, '') || '';
    if (!phone) { toast.error('Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ ØºÙŠØ± Ù…ØªÙˆÙØ±'); return; }
    
    setWaSending(true);
    try {
      const templates = await settingsApi.getWhatsAppTemplates();
      const baseMsg = templates.openingMsg || `Ø§Ù„Ø³Ù„Ø§Ù… Ø¹Ù„ÙŠÙƒÙ…ØŒ\nØªÙ… Ø§Ø³ØªÙ„Ø§Ù… Ø·Ù„Ø¨ Ø§Ù„ØµÙŠØ§Ù†Ø© Ø§Ù„Ø®Ø§Øµ Ø¨Ùƒ\n\nØ±Ù‚Ù… Ø§Ù„ØªØ°ÙƒØ±Ø©: #{ticketId}\nØ§Ù„ÙˆØµÙ: {description}\nØ§Ù„ÙÙŠÙ„Ø§: {unitNumber}\n\nØ³ÙŠØªÙˆØ§ØµÙ„ Ù…Ø¹ÙƒÙ… ÙØ±ÙŠÙ‚ Ø§Ù„ØµÙŠØ§Ù†Ø© ÙÙŠ Ø£Ù‚Ø±Ø¨ ÙˆÙ‚Øª.\nØ´ÙƒØ±Ø§Ù‹ Ù„Ø«Ù‚ØªÙƒÙ….`;
      
      let msg = baseMsg
        .replace(/{ticketId}/g, ticket?.ticketId || '')
        .replace(/{description}/g, ticket?.description || '')
        .replace(/{unitNumber}/g, ticket?.unitNumber || '');

      if (ticket?.appointmentTime) {
        msg += `\n\nØªØ­Ø¯ÙŠØ«: Ù…ÙˆØ¹Ø¯ Ø§Ù„Ø²ÙŠØ§Ø±Ø© Ø§Ù„Ù…Ø­Ø¯Ø¯ Ù‡Ùˆ ${ticket.appointmentTime}`;
      }

      const r = await whatsappApi.send(phone, msg);
      if (r?.sent) {
        toast.success('ØªÙ… Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø±Ø³Ø§Ù„Ø© Ù„Ù„Ø¹Ù…ÙŠÙ„ Ø¹Ø¨Ø± ÙˆØ§ØªØ³Ø§Ø¨');
        setWaSent(true);
        setTimeout(() => navigate(-1), 800);
      } else {
        toast.error('ÙØ´Ù„ Ø¥Ø±Ø³Ø§Ù„ Ø§Ù„Ø±Ø³Ø§Ù„Ø©');
      }
    } catch {
      toast.error('Ø®Ø·Ø£ ÙÙŠ Ø§Ù„Ø§ØªØµØ§Ù„');
    } finally {
      setWaSending(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
        </div>
      </Layout>
    );
  }

  if (!ticket) return null;

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in duration-700">
        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-4 flex-1">
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-white rounded-2xl bg-white/5 order-first"
              onClick={() => navigate('/tickets')}
            >
              <ArrowLeft className="w-5 h-5 rtl:rotate-180" />
            </Button>
            <div className="text-start flex-1">
              <div className="flex items-center gap-2 mb-1 justify-start">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest leading-none">{ticket.refNumber || ticket.id.slice(0, 8)}</span>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-[10px] uppercase font-bold px-3 py-0.5 h-auto">
                  {statusTranslations[ticket.status]}
                </Badge>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight">
                ID: {ticket.ticketId || '---'} | فيلا{' '}
                {ticket.unitId ? (
                  <Link to={`/units/${ticket.unitId}`} className="text-blue-400 hover:underline hover:text-blue-300 transition-colors">{ticket.unitNumber}</Link>
                ) : ticket.unitNumber}
              </h1>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              className="border-border bg-white/5 text-slate-400 rounded-xl px-4 sm:px-6 font-bold h-10 sm:h-11 flex-1 sm:flex-none"
              onClick={openEdit}
            >
              <Pencil className="w-4 h-4 me-2" />
              تعديل
            </Button>
            {ticket.status !== 'closed' && (
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 rounded-xl px-4 sm:px-6 shadow-lg shadow-emerald-500/20 font-bold h-10 sm:h-11 flex-1 sm:flex-none order-1 sm:order-2"
                onClick={() => setCloseDialogOpen(true)}
              >
                <CheckCircle2 className="w-4 h-4" />
                إغلاق التذكرة
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8 space-y-6">
            {/* ── Tabs ── */}
            <div className="flex gap-2 border-b border-border pb-0" dir="rtl">
              {([['details', 'تفاصيل التذكرة'], ['audit', `سجل التغييرات (${auditLog.length})`]] as const).map(([key, label]) => (
                <button key={key} onClick={() => setActiveTab(key)}
                  className={cn('px-4 py-2 text-xs font-bold rounded-t-xl border-b-2 transition-all',
                    activeTab === key
                      ? 'border-primary text-primary bg-primary/5'
                      : 'border-transparent text-muted-foreground hover:text-foreground')}>
                  {label}
                </button>
              ))}
            </div>

            {/* ── Audit Tab ── */}
            {activeTab === 'audit' && (
              <div className="bg-card border border-border rounded-2xl overflow-hidden" dir="rtl">
                {auditLog.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground text-sm">لا توجد تغييرات مسجلة بعد</div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {auditLog.map((a: any) => (
                      <div key={a.id} className="flex items-start gap-4 px-5 py-3 hover:bg-muted/20 transition-colors">
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5 shrink-0">
                          {new Date(a.changedAt).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div className="flex-1 text-right">
                          <p className="text-xs">
                            <span className="font-semibold text-foreground">{a.changedByName}</span>
                            <span className="text-muted-foreground"> غيّر </span>
                            <span className="font-bold text-primary">{a.field}</span>
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {a.oldValue && <span className="line-through text-red-400/70 me-2">{a.oldValue}</span>}
                            <span className="text-emerald-400">{a.newValue}</span>
                          </p>
                        </div>
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-1.5 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'details' && (<>
            <Card className="bg-card border-border rounded-3xl shadow-xl shadow-black/20 overflow-hidden">
              <CardHeader className="border-b border-white/5 p-6 bg-white/5">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest text-right">وصف المشكلة</CardTitle>
              </CardHeader>
              <CardContent className="p-8">
                {renderDetailedDescription(ticket.description)}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-card border-border rounded-3xl shadow-xl shadow-black/20">
                <CardHeader className="border-b border-white/5 p-6">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest text-right">بيانات العميل</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-xs">الاسم</span>
                    {client?.id ? (
                      <Link to={`/clients/${client.id}`} className="text-blue-400 font-bold hover:underline transition-colors block truncate max-w-[150px]">
                        {client.name}
                      </Link>
                    ) : (
                      <span className="text-white font-bold">{client?.name || '---'}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col items-start">
                      <span className="text-slate-500 text-xs mb-0.5">رقم الهاتف</span>
                      {client?.phone
                        ? <a href={`tel:${client.phone}`} onClick={e => e.stopPropagation()} className="text-blue-400 font-mono text-sm hover:text-blue-300 transition-colors">{client.phone}</a>
                        : <span className="text-slate-500 font-mono">---</span>
                      }
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {client?.phone && (() => {
                        const raw = String(client.phone).replace(/\D/g, '');
                        const intl = raw.startsWith('966') ? raw : raw.startsWith('0') ? '966' + raw.slice(1) : '966' + raw;
                        return (
                          <>
                            <a href={`tel:+${intl}`} onClick={e => e.stopPropagation()}
                              className="flex items-center justify-center w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors" title="اتصال">
                              <PhoneCall className="w-3.5 h-3.5" />
                            </a>
                            <a href={`https://wa.me/${intl}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                              className="flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors" title="واتساب">
                              <MessageSquare className="w-3.5 h-3.5" />
                            </a>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-xs">رقم الفيلا</span>
                    {ticket.unitId ? (
                      <Link to={`/units/${ticket.unitId}`} className="text-blue-400 font-bold hover:underline hover:text-blue-300 transition-colors">
                        {ticket.unitNumber}
                      </Link>
                    ) : (
                      <span className="text-blue-400 font-bold">{ticket.unitNumber}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-xs">رقم البلوك</span>
                    <span className="text-white font-bold">{client?.blockNumber || '---'}</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border rounded-3xl shadow-xl shadow-black/20">
                <CardHeader className="border-b border-white/5 p-6">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest text-right">الموعد والجدولة</CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 text-xs">موعد الزيارة</span>
                    <span className="text-amber-500 font-bold">{formatAppointmentDayTime(ticket.appointmentTime)}</span>
                  </div>
                  {(ticket as any).appointmentSession && (
                    <AppointmentSessionRow session={(ticket as any).appointmentSession} />
                  )}
                  <div className="space-y-2">
                    <span className="text-slate-500 text-xs block text-right">ملاحظات الموعد</span>
                    <p className="text-slate-400 text-xs text-right bg-white/5 p-3 rounded-xl">
                      {ticket.appointmentNotes || 'لا توجد ملاحظات'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
            </>)}
          </div>

          <div className="col-span-12 lg:col-span-4 space-y-6">
            <Card className="bg-card border-border rounded-3xl shadow-xl shadow-black/20">
              <CardHeader className="border-b border-white/5 p-6">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest text-right">معلومات التذكرة</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <AlertCircle className="w-3.5 h-3.5" />
                      الأولوية
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-[10px] uppercase font-bold px-3 py-0.5 rounded-full",
                      (ticket.priority === 'urgent' || ticket.priority === 9) ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      (ticket.priority === 'high' || ticket.priority === 7) ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      (ticket.priority === 6 || ticket.priority === 4) ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    )}>
                      {priorityTranslations[String(ticket.priority)]}
                    </Badge>
                  </div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
                      <Tag className="w-3.5 h-3.5" />
                      النوع
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {[...new Set((ticket.detectedTypes as string[] | undefined)?.length
                        ? (ticket.detectedTypes as string[])
                        : [ticket.type]
                      )].map((t, i) => (
                        <span key={i} className="text-xs text-slate-300 font-bold">{typeTranslations[t] || t}</span>
                      ))}
                      {(ticket as any).subTypeName && (
                        <span className="text-[10px] text-slate-400 bg-slate-700/50 px-1.5 py-0.5 rounded">
                          {(ticket as any).subTypeName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Briefcase className="w-3.5 h-3.5" />
                      المشروع
                    </div>
                    <span className="text-xs text-slate-300 font-bold">{project?.name || '---'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <MapPin className="w-3.5 h-3.5" />
                      الموقع
                    </div>
                    <span className="text-xs text-slate-500">{project?.location || '---'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <User className="w-3.5 h-3.5" />
                      المشرف المسؤول
                    </div>
                    {ticket.status === 'contractor' && ticket.contractorId ? (
                      <Link to={`/contractors/${ticket.contractorId}`} className="text-xs text-emerald-400 font-bold hover:underline transition-colors block truncate max-w-[150px]">
                        {ticket.assigneeName || '---'}
                      </Link>
                    ) : ticket.assignedSupervisorId ? (
                      <Link to={`/team/${ticket.assignedSupervisorId}`} className="text-xs text-blue-400 font-bold hover:underline transition-colors block truncate max-w-[150px]">
                        {ticket.assigneeName || '---'}
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-300 font-bold">{ticket.assigneeName || '---'}</span>
                    )}
                  </div>
                  {ticket.assignedSupervisors && (ticket.assignedSupervisors as any[]).length > 0 && (
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
                        <User className="w-3.5 h-3.5" />
                        فريق المشرفين
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {(ticket.assignedSupervisors as any[]).map((s: any, i: number) => (
                          <Link key={i} to={`/team/${s.id || s.uid}`} className="text-[10px] text-blue-400 font-medium hover:underline transition-colors">
                            {s.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <Separator className="bg-white/5" />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <CalendarDays className="w-3.5 h-3.5" />
                      تاريخ الإصدار
                    </div>
                    <span className="text-xs text-slate-300">{ticket.issuedAt || '---'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <CalendarDays className="w-3.5 h-3.5" />
                      تاريخ الإنشاء
                    </div>
                    <span className="text-xs text-slate-300">{format(ticket.createdAt?.toDate ? ticket.createdAt.toDate() : new Date(ticket.createdAt), 'yyyy/MM/dd')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      تاريخ الإغلاق
                    </div>
                    {ticket.closedAt ? (
                      <span className="text-xs text-emerald-400 font-bold">{format(ticket.closedAt?.toDate ? ticket.closedAt.toDate() : new Date(ticket.closedAt), 'yyyy/MM/dd')}</span>
                    ) : (
                      <span className="text-[10px] text-slate-600">لم يغلق بعد</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border rounded-3xl shadow-xl shadow-black/20">
              <CardHeader className="border-b border-white/5 p-6">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest text-right">إجراءات سريعة</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                {waSent ? (
                  /* ── بعد إرسال الرسالة: اختفاء كل الأزرار ── */
                  <div className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <CheckCircle2 className="w-8 h-8" />
                    <p className="text-sm font-bold">تم إرسال الرسالة بنجاح</p>
                    <p className="text-[10px] text-emerald-500/70">جارٍ العودة للقائمة...</p>
                  </div>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      className="w-full justify-center border-border bg-white/5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 text-xs h-12 rounded-2xl font-bold"
                      onClick={() => {
                        setApptOpen(true);
                      }}
                    >
                      <CalendarDays className="w-4 h-4 me-2" />
                      تحديد موعد
                    </Button>
                    <ReassignSupervisorButton ticket={ticket} onReassigned={loadData} />
                    <Button
                      variant="outline"
                      disabled={waSending}
                      className="w-full justify-start border-border bg-white/5 text-emerald-400 hover:bg-emerald-500/10 text-xs h-12 rounded-2xl font-bold disabled:opacity-60"
                      onClick={handleWhatsApp}
                    >
                      <Phone className="w-4 h-4 me-2" />
                      {waSending ? 'جارٍ الإرسال...' : 'إرسال تحديث للعميل'}
                    </Button>

                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <CloseTicketDialog
          open={closeDialogOpen}
          onOpenChange={setCloseDialogOpen}
          selectedTickets={[ticket]}
          clients={client ? [client] : []}
          projects={project ? { [project.id]: project } : undefined}
          onSuccess={() => { setCloseDialogOpen(false); loadData(); }}
        />
      </div>

      {/* ── Edit Dialog ───────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[440px] rounded-3xl shadow-2xl shadow-black/40">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white text-right">تعديل التذكرة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* الحالة */}
            <div className="space-y-1.5">
              <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">الحالة</Label>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-200 rounded-xl h-11 px-3 text-sm" />}
                  className="w-full"
                >
                  {statusTranslations[editStatus] || editStatus || 'اختر الحالة'}
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-card border-border text-slate-200 min-w-[var(--radix-dropdown-menu-trigger-width)]" align="end">
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setEditStatus('open')}>مفتوحة</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setEditStatus('in_progress')}>قيد التنفيذ</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setEditStatus('waiting')}>بانتظار الموعد</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setEditStatus('pending')}>معلقة</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setEditStatus('contractor')}>مقاول / ملاحظة</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setEditStatus('completed')}>مكتملة</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setEditStatus('closed')}>مغلقة</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-amber-500/10 cursor-pointer text-start justify-start text-amber-400" onClick={() => setEditStatus('absent')}>عدم تواجد</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-red-500/10 cursor-pointer text-start justify-start text-rose-400" onClick={() => setEditStatus('out_of_scope')}>خارج اختصاص</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* الأولوية */}
            <div className="space-y-1.5">
              <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">الأولوية</Label>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-200 rounded-xl h-11 px-3 text-sm" />}
                  className="w-full"
                >
                  {priorityTranslations[editPriority] || editPriority || 'اختر الأولوية'}
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-card border-border text-slate-200 min-w-[var(--radix-dropdown-menu-trigger-width)]" align="end">
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setEditPriority('9')}>9 - عاجل جداً</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setEditPriority('7')}>7 - مرتفع</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setEditPriority('6')}>6 - متوسط</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setEditPriority('4')}>4 - عادي</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setEditPriority('3')}>3 - منخفض</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* الوصف */}
            <div className="space-y-1.5">
              <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">وصف التذكرة</Label>
              <Textarea 
                value={editDescription} 
                onChange={(e) => setEditDescription(e.target.value)} 
                className="bg-muted/50 border-transparent focus:border-primary/30 rounded-xl min-h-[80px] text-right" 
                placeholder="تفاصيل المشكلة..." 
              />
            </div>

            {/* نوع الصيانة */}
            <TypesSelector
              label="نوع الصيانة (يمكن أكثر من نوع)"
              value={editTypes}
              onChange={setEditTypes}
              min={1}
              showSubTypes
              selectedSubTypeIds={editSubTypeIds}
              onSubTypeChange={setEditSubTypeIds}
            />

            {/* المشرفون */}
            <div className="space-y-1.5">
              <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">
                المشرفون {supervisorsLoading ? '...' : availableSupervisors.length > 0 ? `(${availableSupervisors.length})` : ''}
              </Label>
              {supervisorsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
                </div>
              ) : availableSupervisors.length > 0 ? (
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {availableSupervisors.map(s => (
                    <div
                      key={s.uid}
                      onClick={() => setEditAssignedSupervisorIds(prev =>
                        prev.includes(s.uid) ? prev.filter(x => x !== s.uid) : [...prev, s.uid]
                      )}
                      className={cn('flex items-center justify-between px-3 py-2 rounded-xl border cursor-pointer transition-all',
                        editAssignedSupervisorIds.includes(s.uid)
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                          : 'bg-white/5 border-border text-slate-400 hover:border-slate-500'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{s.displayName}</span>
                        <span className="text-[10px] text-slate-500">{(s.specialties as string[])?.join(' · ')}</span>
                      </div>
                      <div className={cn('w-3.5 h-3.5 rounded border-2 shrink-0',
                        editAssignedSupervisorIds.includes(s.uid) ? 'bg-blue-500 border-blue-500' : 'border-slate-600'
                      )} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-600 text-right">لا يوجد مشرفون مخصصون لهذا المشروع</p>
              )}
            </div>

            <Button onClick={handleSaveEdit} disabled={editSaving}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-12 font-bold mt-2">
              {editSaving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Appointment Dialog (Unified) ──────────────── */}
      {ticket && (
        <UnifiedAppointmentDialog
          open={apptOpen}
          onOpenChange={setApptOpen}
          tickets={[{
            id: ticket.id,
            ticketId: ticket.ticketId,
            clientName: ticket.clientName,
            unitNumber: ticket.unitNumber,
            unitId: ticket.unitId ?? undefined,
            projectId: ticket.projectId,
            clientId: ticket.clientId,
            appointmentId: (ticket as any).appointmentId,
            appointmentTime: ticket.appointmentTime,
            type: ticket.type as string,
            detectedTypes: ticket.detectedTypes,
            assignedSupervisorIds: ticket.assignedSupervisorIds as string[] | undefined,
            status: ticket.status,
          }]}
          clientPhone={client?.phone}
          onSuccess={() => { setApptOpen(false); loadData(); }}
        />
      )}

      {/* Lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(o) => { if (!o) closeLightbox(); }}>
        <DialogContent className="sm:max-w-2xl bg-zinc-900 border-white/10 p-0 overflow-hidden rounded-2xl [&>button]:text-white [&>button]:opacity-80 [&>button]:bg-white/10 [&>button]:hover:bg-white/20 [&>button]:rounded-full [&>button]:top-3 [&>button]:right-3">
          {lightbox && (() => {
            const current = lightbox.items[lightbox.index];
            const hasMany = lightbox.items.length > 1;
            return (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10 pr-12">
                  {hasMany ? (
                    <span className="text-white/60 text-xs font-mono">{lightbox.index + 1} / {lightbox.items.length}</span>
                  ) : <span />}
                  <a
                    href={current.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                {/* Media + arrows */}
                <div className="relative flex items-center justify-center bg-zinc-950 min-h-[200px]">
                  {hasMany && (
                    <button
                      className="absolute left-3 z-10 p-2 rounded-full bg-white/15 hover:bg-white/30 text-white border border-white/20 transition-colors shadow-lg"
                      onClick={lightboxPrev}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  )}

                  <div className="w-full flex items-center justify-center p-3">
                    {current.type === 'image' ? (
                      <img
                        key={current.url}
                        src={current.url}
                        alt="عرض الصورة"
                        className="max-w-full max-h-[70vh] object-contain rounded-lg"
                      />
                    ) : (
                      <video
                        key={current.url}
                        src={current.url}
                        controls
                        autoPlay
                        className="max-w-full max-h-[70vh] rounded-lg outline-none"
                      />
                    )}
                  </div>

                  {hasMany && (
                    <button
                      className="absolute right-3 z-10 p-2 rounded-full bg-white/15 hover:bg-white/30 text-white border border-white/20 transition-colors shadow-lg"
                      onClick={lightboxNext}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function AppointmentSessionRow({ session }: { session: any }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (session?.status !== 'in_progress') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session?.status]);

  if (!session) return null;

  const start = session.claimedAt ? new Date(session.claimedAt).getTime() : null;
  const end = session.finishedAt ? new Date(session.finishedAt).getTime() : now;
  const mins = start ? Math.max(0, Math.floor((end - start) / 60000)) : (session.totalDurationMins ?? 0);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const label = h > 0 ? `${h}س ${m}د` : `${m}د`;

  const inProgress = session.status === 'in_progress';
  const color = inProgress ? 'blue' : session.status === 'completed' ? 'emerald' : 'slate';

  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
      <div className="flex flex-col items-start gap-0.5">
        <span className="text-slate-500 text-[10px]">جلسة الفني</span>
        <span className={`text-${color}-400 font-black text-sm`}>
          {inProgress ? 'جارية الآن' : session.status === 'completed' ? 'اكتملت' : 'ملغاة'}
          {session.technician?.name && ` • ${session.technician.name}`}
        </span>
      </div>
      <span className={`text-${color}-400 font-black text-base tabular-nums`}>
        {label}
      </span>
    </div>
  );
}
