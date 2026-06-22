import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { useTicketTypes } from '@/contexts/TicketTypesContext';
import { formatAppointmentDayTime } from '@/lib/utils';
import { CloseTicketDialog } from '@/components/tickets/CloseTicketDialog';
import { ReassignSupervisorButton } from '@/components/tickets/ReassignSupervisorButton';
import { AppointmentDialog } from '@/components/tickets/AppointmentDialog';
import { SaveInternalAppointmentDialog } from '@/components/tickets/SaveInternalAppointmentDialog';
import { Ticket, TicketType, Project, Client } from '@/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ticketsApi, projectsApi, clientsApi, whatsappApi, auditApi, settingsApi } from '@/lib/api';
import { learnFromCorrection, getAuthHeaders } from '@/services/classificationApi';
import { toast } from 'sonner';


export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Edit dialog state ──
  const [editOpen, setEditOpen] = useState(false);
  const [editStatus, setEditStatus] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editTypes, setEditTypes] = useState<TicketType[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [availableSupervisors, setAvailableSupervisors] = useState<{uid: string; displayName: string; specialties: string[]}[]>([]);
  const [editAssignedSupervisorIds, setEditAssignedSupervisorIds] = useState<string[]>([]);
  const [supervisorsLoading, setSupervisorsLoading] = useState(false);

  // ── Approval state ──
  const [sendingApproval, setSendingApproval] = useState(false);

  // ── Appointment dialog state ──
  const [apptOpen, setApptOpen] = useState(false);
  const [internalApptOpen, setInternalApptOpen] = useState(false);
  const [apptDate, setApptDate] = useState('');
  const [apptTime, setApptTime] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const [apptSaving, setApptSaving] = useState(false);
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
    const initTypes = (ticket.detectedTypes as TicketType[] | undefined)?.length
      ? (ticket.detectedTypes as TicketType[])
      : [ticket.type];
    setEditTypes(initTypes);
    setEditAssignedSupervisorIds(
      (ticket.assignedSupervisorIds as string[] | undefined) ??
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
      ? (ticket.detectedTypes as TicketType[])
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
        priority:               isNaN(Number(editPriority)) ? editPriority : Number(editPriority),
        type:                   editTypes[0] as TicketType,
        detectedTypes:          editTypes,
        assigneeName:           selectedSupervisors[0]?.displayName ?? ticket.assigneeName ?? '',
        assignedSupervisorId:   editAssignedSupervisorIds[0] ?? '',
        assignedSupervisorIds:  editAssignedSupervisorIds,
        assignedSupervisors:    selectedSupervisors,
      });

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

  const handleSaveAppointment = async () => {
    if (!ticket) return;
    setApptSaving(true);
    try {
      const appointmentTime = apptDate ? `${apptDate}${apptTime ? ' ' + apptTime : ''}` : '';
      await ticketsApi.update(ticket.id, {
        appointmentTime,
        appointmentNotes: apptNotes,
        appointmentAwaitingReply: false,
        status: ticket.status === 'open' || ticket.status === 'waiting' ? 'pending' : ticket.status,
      });

      // إرسال رسالة الموعد عبر واتساب تلقائياً
      const phone = client?.phone?.replace(/\D/g, '') || '';
      if (phone) {
        const apptMsg = `السلام عليكم ${client?.name || ''}\n\nتم تحديد موعد زيارة فريق الصيانة لوحدتكم رقم ${ticket.villaNumber}.\n\nرقم التذكرة: #${ticket.ticketId}\nموعد الزيارة: ${appointmentTime}\n${apptNotes ? `ملاحظات: ${apptNotes}\n` : ''}\nيرجى التواجد في الموعد المحدد.\nشكراً لتعاونكم.`;
        try {
          const r = await whatsappApi.send(phone, apptMsg);
          if (r?.sent) {
            toast.success('تم تأكيد الموعد وإشعار العميل عبر واتساب');
          } else {
            toast.success(`تم حفظ الموعد${appointmentTime ? ` ليوم ${appointmentTime}` : ''}`);
          }
        } catch {
          toast.success(`تم حفظ الموعد${appointmentTime ? ` ليوم ${appointmentTime}` : ''}`);
        }
      } else {
        toast.success(`تم حفظ الموعد${appointmentTime ? ` ليوم ${appointmentTime}` : ''}`);
      }

      setApptOpen(false);
      navigate(-1);
    } catch {
      toast.error('فشل حفظ الموعد');
    } finally {
      setApptSaving(false);
    }
  };

  const todayStr = () => new Date().toISOString().split('T')[0];

  const handleWhatsApp = async () => {
    const phone = client?.phone?.replace(/\D/g, '') || '';
    if (!phone) { toast.error('Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ ØºÙŠØ± Ù…ØªÙˆÙØ±'); return; }
    
    setWaSending(true);
    try {
      const templates = await settingsApi.getWhatsAppTemplates();
      const baseMsg = templates.openingMsg || `Ø§Ù„Ø³Ù„Ø§Ù… Ø¹Ù„ÙŠÙƒÙ…ØŒ\nØªÙ… Ø§Ø³ØªÙ„Ø§Ù… Ø·Ù„Ø¨ Ø§Ù„ØµÙŠØ§Ù†Ø© Ø§Ù„Ø®Ø§Øµ Ø¨Ùƒ\n\nØ±Ù‚Ù… Ø§Ù„ØªØ°ÙƒØ±Ø©: #{ticketId}\nØ§Ù„ÙˆØµÙ: {description}\nØ§Ù„ÙÙŠÙ„Ø§: {villaNumber}\n\nØ³ÙŠØªÙˆØ§ØµÙ„ Ù…Ø¹ÙƒÙ… ÙØ±ÙŠÙ‚ Ø§Ù„ØµÙŠØ§Ù†Ø© ÙÙŠ Ø£Ù‚Ø±Ø¨ ÙˆÙ‚Øª.\nØ´ÙƒØ±Ø§Ù‹ Ù„Ø«Ù‚ØªÙƒÙ….`;
      
      let msg = baseMsg
        .replace(/{ticketId}/g, ticket?.ticketId || '')
        .replace(/{description}/g, ticket?.description || '')
        .replace(/{villaNumber}/g, ticket?.villaNumber || '');

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

  const handleSendApproval = async () => {
    if (!ticket) return;
    setSendingApproval(true);
    try {
      const result = await whatsappApi.sendApprovalRequest(ticket.id);
      if (result.sent) {
        toast.success('تم إرسال طلب الموافقة للعميل عبر واتساب');
        loadData();
      } else {
        toast.error('تعذر الإرسال. تحقق من اتصال الواتساب.');
      }
    } catch {
      toast.error('فشل إرسال طلب الموافقة.');
    } finally {
      setSendingApproval(false);
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
                ID: {ticket.ticketId || '---'} | فيلا {ticket.villaNumber}
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
                <p className="text-slate-300 leading-relaxed text-right text-lg whitespace-pre-wrap break-words">{ticket.description}</p>
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
                    <span className="text-white font-bold">{client?.name || '---'}</span>
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
                    <span className="text-white font-bold">{ticket.villaNumber}</span>
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
                      {((ticket.detectedTypes as string[] | undefined)?.length
                        ? (ticket.detectedTypes as string[])
                        : [ticket.type]
                      ).map((t, i) => (
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
                    <span className="text-xs text-slate-300 font-bold">{ticket.assigneeName || '---'}</span>
                  </div>
                  {ticket.assignedSupervisors && (ticket.assignedSupervisors as any[]).length > 0 && (
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
                        <User className="w-3.5 h-3.5" />
                        فريق المشرفين
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {(ticket.assignedSupervisors as any[]).map((s: any, i: number) => (
                          <span key={i} className="text-[10px] text-slate-400 font-medium">{s.name}</span>
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
                {ticket.appointmentAwaitingReply && ticket.status === 'waiting' && (
                  <div className="w-full flex items-center justify-between p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 mb-3">
                    <div className="flex items-center gap-2 text-orange-400">
                      <Clock className="w-4 h-4 animate-pulse" />
                      <span className="text-xs font-bold">بانتظار رد العميل لتأكيد الموعد</span>
                    </div>
                  </div>
                )}
                {waSent ? (
                  /* ── بعد إرسال الرسالة: اختفاء كل الأزرار ── */
                  <div className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <CheckCircle2 className="w-8 h-8" />
                    <p className="text-sm font-bold">تم إرسال الرسالة بنجاح</p>
                    <p className="text-[10px] text-emerald-500/70">جارٍ العودة للقائمة...</p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 w-full">
                      <Button
                        variant="outline"
                        className="flex-1 justify-center border-border bg-white/5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 text-xs h-12 rounded-2xl font-bold"
                        onClick={() => {
                          setInternalApptOpen(true);
                        }}
                      >
                        <CalendarDays className="w-4 h-4 me-2" />
                        إضافة موعد
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 justify-center border-border bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 text-xs h-12 rounded-2xl font-bold"
                        onClick={() => {
                          setApptOpen(true);
                        }}
                      >
                        <CalendarDays className="w-4 h-4 me-2" />
                        ترتيب موعد
                      </Button>
                    </div>
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

                    {/* زر طلب الموافقة على الإغلاق */}
                    {(ticket.status === 'closed' || ticket.status === 'completed') && client?.phone && (
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          disabled={sendingApproval || (ticket as any).approvalState === 'rated'}
                          className="w-full justify-start border-border bg-white/5 text-purple-400 hover:bg-purple-500/10 text-xs h-12 rounded-2xl font-bold disabled:opacity-50"
                          onClick={handleSendApproval}
                        >
                          <CheckCircle2 className="w-4 h-4 me-2" />
                          {sendingApproval ? 'جاري الإرسال...' : 'طلب موافقة العميل'}
                        </Button>
                        {(ticket as any).approvalState && (
                          <div className={cn(
                            'text-[10px] font-bold px-3 py-1.5 rounded-xl text-center',
                            (ticket as any).approvalState === 'rated'     ? 'bg-emerald-500/10 text-emerald-400' :
                            (ticket as any).approvalState === 'approved'  ? 'bg-blue-500/10 text-blue-400'      :
                            (ticket as any).approvalState === 'rejected'  ? 'bg-red-500/10 text-red-400'        :
                            'bg-amber-500/10 text-amber-400'
                          )}>
                            {(ticket as any).approvalState === 'sent'           && 'في انتظار رد العميل'}
                            {(ticket as any).approvalState === 'awaiting_rating' && 'وافق — في انتظار التقييم'}
                            {(ticket as any).approvalState === 'approved'        && 'وافق العميل'}
                            {(ticket as any).approvalState === 'rejected'        && 'رفض العميل'}
                            {(ticket as any).approvalState === 'rated'           && `التقييم: ${(ticket as any).clientRating}/5`}
                          </div>
                        )}
                      </div>
                    )}
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
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setEditStatus('in-progress')}>قيد التنفيذ</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setEditStatus('pending')}>معلقة</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setEditStatus('completed')}>مكتملة</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-start justify-start" onClick={() => setEditStatus('closed')}>مغلقة</DropdownMenuItem>
                  <DropdownMenuItem className="hover:bg-red-500/10 cursor-pointer text-start justify-start text-rose-400" onClick={() => setEditStatus('out-of-scope')}>خارج اختصاص</DropdownMenuItem>
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

            {/* نوع الصيانة */}
            <div className="space-y-1.5">
              <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">
                نوع الصيانة <span className="text-slate-600 normal-case">(يمكن أكثر من نوع)</span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(typeTranslations) as TicketType[]).map(t => (
                  <button type="button" key={t}
                    onClick={() => setEditTypes(prev =>
                      prev.includes(t) ? (prev.length > 1 ? prev.filter(x => x !== t) : prev) : [...prev, t]
                    )}
                    className={cn('px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all',
                      editTypes.includes(t)
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                        : 'bg-white/5 border-border text-slate-500 hover:border-slate-400'
                    )}
                  >
                    {typeTranslations[t as string]}
                  </button>
                ))}
              </div>
            </div>

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

      {/* ── Appointment Dialog (Smart) ──────────────── */}
      {ticket && (
        <AppointmentDialog
          open={apptOpen}
          onOpenChange={setApptOpen}
          tickets={[{
            id: ticket.id,
            ticketId: ticket.ticketId,
            clientName: ticket.clientName,
            villaNumber: ticket.villaNumber,
            appointmentTime: ticket.appointmentTime,
            appointmentNotes: ticket.appointmentNotes,
            assignedSupervisorIds: ticket.assignedSupervisorIds as string[] | undefined,
            status: ticket.status,
          }]}
          clientPhone={client?.phone}
          onSuccess={() => { setApptOpen(false); loadData(); }}
        />
      )}

      {ticket && (
        <SaveInternalAppointmentDialog
          open={internalApptOpen}
          onOpenChange={setInternalApptOpen}
          tickets={[ticket]}
          onSuccess={() => { setInternalApptOpen(false); loadData(); }}
        />
      )}
    </Layout>
  );
}
