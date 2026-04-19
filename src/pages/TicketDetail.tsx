import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Clock, 
  User, 
  Tag, 
  Calendar,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Home,
  Briefcase,
  MapPin,
  CalendarDays,
  Pencil,
  Phone,
  PhoneCall,
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Ticket, TicketType, Project, Client } from '@/types';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { doc, onSnapshot, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getFirestoreDb } from '@/lib/firebase';
import { TYPE_TO_SPECIALTY } from '@/services/ticketClassifier';
import { findMatchingSupervisors } from '@/services/supervisorAssignment';
import { NotificationService } from '@/services/notificationService';
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
  const [editAssignee, setEditAssignee] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [availableSupervisors, setAvailableSupervisors] = useState<{id: string; name: string; specialties: string[]}[]>([]);
  const [editAssignedSupervisorIds, setEditAssignedSupervisorIds] = useState<string[]>([]);

  // ── Appointment dialog state ──
  const [apptOpen, setApptOpen] = useState(false);
  const [apptDate, setApptDate] = useState('');
  const [apptTime, setApptTime] = useState('');
  const [apptNotes, setApptNotes] = useState('');
  const [apptSaving, setApptSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    const db = getFirestoreDb();
    const ticketRef = doc(db, 'tickets', id);

    const unsubscribe = onSnapshot(ticketRef, async (snapshot) => {
      if (snapshot.exists()) {
        const ticketData = { id: snapshot.id, ...snapshot.data() } as Ticket;
        setTicket(ticketData);

        // Fetch project
        const pDoc = await getDoc(doc(db, 'projects', ticketData.projectId));
        if (pDoc.exists()) {
          setProject({ id: pDoc.id, ...pDoc.data() } as Project);
        }

        // Fetch client (only if clientId is set)
        if (ticketData.clientId && ticketData.projectId) {
          const cDoc = await getDoc(doc(db, `projects/${ticketData.projectId}/clients`, ticketData.clientId));
          if (cDoc.exists()) {
            setClient({ id: cDoc.id, ...cDoc.data() } as Client);
          }
        }
      } else {
        toast.error('التذكرة غير موجودة');
        navigate('/tickets');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [id, navigate]);

  const typeTranslations: Record<TicketType, string> = {
    'electricity': 'كهرباء',
    'plumbing': 'سباكة',
    'doors': 'أبواب',
    'paints': 'دهانات',
    'cracks': 'تشققات',
    'ceramics': 'سيراميك',
    'tank_insulation': 'عزل خزان',
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

  // Open edit dialog pre-filled with current values
  const openEdit = () => {
    if (!ticket) return;
    setEditStatus(ticket.status);
    setEditPriority(String(ticket.priority));
    const initTypes = (ticket.detectedTypes as TicketType[] | undefined)?.length
      ? (ticket.detectedTypes as TicketType[])
      : [ticket.type];
    setEditTypes(initTypes);
    setEditAssignee(ticket.assigneeName || '');
    setEditAssignedSupervisorIds(
      (ticket.assignedSupervisorIds as string[] | undefined) ??
      (ticket.assignedSupervisorId ? [ticket.assignedSupervisorId as string] : [])
    );
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!ticket) return;
    setEditSaving(true);
    try {
      const db = getFirestoreDb();
      const selectedSupervisors = availableSupervisors.filter(s => editAssignedSupervisorIds.includes(s.id));
      await updateDoc(doc(db, 'tickets', ticket.id), {
        status:                 editStatus,
        priority:               isNaN(Number(editPriority)) ? editPriority : Number(editPriority),
        type:                   editTypes[0] as TicketType,
        detectedTypes:          editTypes,
        assigneeName:           editAssignee || (selectedSupervisors[0]?.name ?? ''),
        assignedSupervisorId:   editAssignedSupervisorIds[0] ?? '',
        assignedSupervisorIds:  editAssignedSupervisorIds,
        assignedSupervisors:    selectedSupervisors,
      });
      // Notify newly added supervisors only
      const previousIds: string[] = (ticket.assignedSupervisorIds as string[] | undefined) ?? [];
      const newlySupervisors = selectedSupervisors.filter(s => !previousIds.includes(s.id));
      if (newlySupervisors.length > 0) {
        NotificationService.writeAssignmentNotifications(
          newlySupervisors,
          ticket.id,
          ticket.refNumber,
          ticket.villaNumber,
          ticket.description
        ).catch(console.warn);
      }
      toast.success('تم تحديث التذكرة');
      setEditOpen(false);
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
      const db = getFirestoreDb();
      const appointmentTime = apptDate ? `${apptDate}${apptTime ? ' ' + apptTime : ''}` : '';
      await updateDoc(doc(db, 'tickets', ticket.id), {
        appointmentTime,
        appointmentNotes: apptNotes,
        status: ticket.status === 'open' ? 'pending' : ticket.status,
      });
      // Write/update appointment reminder notification for all involved parties
      if (appointmentTime) {
        const supervisorIds: string[] = (ticket.assignedSupervisorIds as string[] | undefined) ?? [];
        NotificationService.writeAppointmentReminder(
          ticket.id,
          ticket.refNumber,
          ticket.villaNumber,
          appointmentTime,
          supervisorIds,
          (ticket as any).createdBy
        ).catch(console.warn);
      }
      toast.success('تم تحديد الموعد');
      setApptOpen(false);
    } catch {
      toast.error('فشل حفظ الموعد');
    } finally {
      setApptSaving(false);
    }
  };

  // helper to get today's date as yyyy-MM-dd for <input type="date">
  const todayStr = () => new Date().toISOString().split('T')[0];

  const handleWhatsApp = () => {
    const phone = client?.phone?.replace(/\D/g, '') || '';
    if (!phone) { toast.error('رقم الهاتف غير متوفر'); return; }
    const msg = `السلام عليكم ${client?.name || ''}\nبخصوص طلب الصيانة رقم ${ticket?.ticketId || ''} - فيلا ${ticket?.villaNumber}\n${ticket?.appointmentTime ? `موعد الزيارة: ${ticket.appointmentTime}` : 'سيتم التواصل معكم لتحديد موعد الزيارة'}\nشكراً لكم.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Re-fetch matching supervisors whenever types change inside the edit dialog
  useEffect(() => {
    if (!editOpen || !ticket?.projectId || editTypes.length === 0) return;
    const requiredSpecialties = [...new Set(editTypes.map(t => TYPE_TO_SPECIALTY[t]))] as any[];
    findMatchingSupervisors(ticket.projectId, requiredSpecialties).then(setAvailableSupervisors);
  }, [editTypes, editOpen, ticket?.projectId]);

  const handleCloseTicket = async () => {
    if (!ticket) return;
    setLoading(true);
    try {
      const db = getFirestoreDb();
      await updateDoc(doc(db, 'tickets', ticket.id), {
        status: 'closed',
        closedAt: new Date().toISOString()
      });
      toast.success('تم إغلاق التذكرة بنجاح');
    } catch (error) {
      console.error('Error closing ticket:', error);
      toast.error('فشل إغلاق التذكرة');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
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
              className="text-slate-400 hover:text-white rounded-2xl bg-white/5 order-last sm:order-first"
              onClick={() => navigate('/tickets')}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="text-right flex-1">
              <div className="flex items-center gap-2 mb-1 justify-end">
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
            <Button variant="outline" className="border-border bg-white/5 text-slate-400 rounded-xl px-4 sm:px-6 font-bold h-10 sm:h-11 flex-1 sm:flex-none order-2 sm:order-1"
              onClick={openEdit}
            >
              <Pencil className="w-4 h-4 ml-2" />
              تعديل
            </Button>
            {ticket.status !== 'closed' && (
              <Button 
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 rounded-xl px-4 sm:px-6 shadow-lg shadow-emerald-500/20 font-bold h-10 sm:h-11 flex-1 sm:flex-none order-1 sm:order-2"
                onClick={handleCloseTicket}
              >
                <CheckCircle2 className="w-4 h-4" />
                إغلاق التذكرة
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8 space-y-6">
            <Card className="bg-card border-border rounded-3xl shadow-xl shadow-black/20 overflow-hidden">
              <CardHeader className="border-b border-white/5 p-6 bg-white/5">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-widest text-right">وصف المشكلة</CardTitle>
              </CardHeader>
              <CardContent className="p-8">
                <p className="text-slate-300 leading-relaxed text-right text-lg">
                  {ticket.description}
                </p>
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
                    <div className="flex items-center gap-2 shrink-0">
                      {client?.phone && (() => {
                        const raw = String(client.phone).replace(/\D/g, '');
                        const intl = raw.startsWith('966') ? raw : raw.startsWith('0') ? '966' + raw.slice(1) : '966' + raw;
                        return (
                          <>
                            <a
                              href={`tel:+${intl}`}
                              onClick={e => e.stopPropagation()}
                              className="flex items-center justify-center w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                              title="اتصال"
                            >
                              <PhoneCall className="w-3.5 h-3.5" />
                            </a>
                            <a
                              href={`https://wa.me/${intl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex items-center justify-center w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                              title="واتساب"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </a>
                          </>
                        );
                      })()}
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-slate-500 text-xs mb-0.5">رقم الهاتف</span>
                      {client?.phone
                        ? <a href={`tel:${client.phone}`} onClick={e => e.stopPropagation()} className="text-blue-400 font-mono text-sm hover:text-blue-300 transition-colors">{client.phone}</a>
                        : <span className="text-slate-500 font-mono">---</span>
                      }
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
                    <span className="text-amber-500 font-bold">{ticket.appointmentTime || 'لم يحدد بعد'}</span>
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
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Tag className="w-3.5 h-3.5" />
                      النوع
                    </div>
                    <span className="text-xs text-slate-300 font-bold">{typeTranslations[ticket.type]}</span>
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

                  {/* Assignee */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <User className="w-3.5 h-3.5" />
                      المشرف المسؤول
                    </div>
                    <span className="text-xs text-slate-300 font-bold">{ticket.assigneeName || '---'}</span>
                  </div>

                  {/* All assigned supervisors */}
                  {ticket.assignedSupervisors && ticket.assignedSupervisors.length > 0 && (
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
                <Button variant="outline" className="w-full justify-end border-border bg-white/5 text-slate-400 hover:text-white text-xs h-12 rounded-2xl font-bold"
                  onClick={() => { setApptDate(ticket.appointmentTime?.split(' ')[0] || todayStr()); setApptTime(ticket.appointmentTime?.split(' ')[1] || ''); setApptNotes(ticket.appointmentNotes || ''); setApptOpen(true); }}
                >
                  <CalendarDays className="w-4 h-4 mr-2" />
                  تحديد موعد زيارة
                </Button>
                <Button variant="outline" className="w-full justify-end border-border bg-white/5 text-emerald-400 hover:bg-emerald-500/10 text-xs h-12 rounded-2xl font-bold"
                  onClick={handleWhatsApp}
                >
                  <Phone className="w-4 h-4 mr-2" />
                  إرسال تحديث للعميل
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Edit Dialog ───────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[440px] rounded-3xl shadow-2xl shadow-black/40">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white text-right">تعديل التذكرة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">الحالة</Label>
              <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                className="w-full bg-white/5 border border-border rounded-xl h-11 px-3 text-right text-slate-200 text-sm">
                <option value="open">مفتوحة</option>
                <option value="in-progress">قيد التنفيذ</option>
                <option value="pending">معلقة</option>
                <option value="completed">مكتملة</option>
                <option value="closed">مغلقة</option>
                <option value="out-of-scope">خارج اختصاص</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">الأولوية</Label>
              <select value={editPriority} onChange={e => setEditPriority(e.target.value)}
                className="w-full bg-white/5 border border-border rounded-xl h-11 px-3 text-right text-slate-200 text-sm">
                <option value="9">9 - عاجل جداً</option>
                <option value="7">7 - مرتفع</option>
                <option value="6">6 - متوسط</option>
                <option value="4">4 - عادي</option>
                <option value="3">3 - منخفض</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">
                نوع الصيانة <span className="text-slate-600 normal-case">(يمكن أكثر من نوع)</span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {(['electricity','plumbing','doors','paints','cracks','ceramics','tank_insulation'] as TicketType[]).map(t => {
                  const labels: Record<string, string> = { electricity:'كهرباء', plumbing:'سباكة', doors:'أبواب', paints:'دهانات', cracks:'تشققات', ceramics:'سيراميك', tank_insulation:'عزل خزان' };
                  return (
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
                      {labels[t]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Supervisor picker */}
            <div className="space-y-1.5">
              <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">
                المشرفون {availableSupervisors.length > 0 ? `(${availableSupervisors.length} مقترح)` : ''}
              </Label>
              {availableSupervisors.length > 0 ? (
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {availableSupervisors.map(s => (
                    <div key={s.id}
                      onClick={() => setEditAssignedSupervisorIds(prev =>
                        prev.includes(s.id) ? prev.filter(x => x !== s.id) : [...prev, s.id]
                      )}
                      className={cn('flex items-center justify-between px-3 py-2 rounded-xl border cursor-pointer transition-all',
                        editAssignedSupervisorIds.includes(s.id)
                          ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                          : 'bg-white/5 border-border text-slate-400 hover:border-slate-500'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{s.name}</span>
                        <span className="text-[10px] text-slate-500">{(s.specialties as string[])?.join(' · ')}</span>
                      </div>
                      <div className={cn('w-3.5 h-3.5 rounded border-2 shrink-0',
                        editAssignedSupervisorIds.includes(s.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-600'
                      )} />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-600 text-right">لا يوجد مشرفون مخصصون لهذا المشروع بالتخصص المطلوب</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">المسؤول (يدوي)</Label>
              <Input value={editAssignee} onChange={e => setEditAssignee(e.target.value)}
                placeholder="اسم المشرف المسؤول"
                className="bg-white/5 border-border rounded-xl h-11 text-right text-slate-200" />
            </div>
            <Button onClick={handleSaveEdit} disabled={editSaving}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-12 font-bold mt-2">
              {editSaving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Appointment Dialog ────────────────────────── */}
      <Dialog open={apptOpen} onOpenChange={setApptOpen}>
        <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[400px] rounded-3xl shadow-2xl shadow-black/40">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white text-right">تحديد موعد الزيارة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">التاريخ</Label>
              <Input type="date" value={apptDate} onChange={e => setApptDate(e.target.value)}
                className="bg-white/5 border-border rounded-xl h-11 text-slate-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">الوقت</Label>
              <Input type="time" value={apptTime} onChange={e => setApptTime(e.target.value)}
                className="bg-white/5 border-border rounded-xl h-11 text-slate-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-500 text-[10px] uppercase font-bold tracking-widest block text-right">ملاحظات</Label>
              <textarea value={apptNotes} onChange={e => setApptNotes(e.target.value)}
                placeholder="أي تعليمات للفني أو العميل..."
                className="w-full bg-white/5 border border-border rounded-xl p-3 text-right text-slate-200 text-sm resize-none h-20" />
            </div>
            <Button onClick={handleSaveAppointment} disabled={apptSaving || !apptDate}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white rounded-xl h-12 font-bold">
              {apptSaving ? 'جارٍ الحفظ...' : 'تأكيد الموعد'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
