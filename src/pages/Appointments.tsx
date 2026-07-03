import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock, RefreshCw,
  Plus, Users, Ticket as TicketIcon, CalendarPlus, Printer, Pencil, Search, FileImage,
  Phone, MessageCircle
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { appointmentsApi, projectsApi, usersApi, ticketsApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTicketTypes } from '@/contexts/TicketTypesContext';
import { QuickAddSpecialtyDialog } from '@/components/tickets/QuickAddSpecialtyDialog';
import { DirectAppointmentDialog } from '@/components/tickets/DirectAppointmentDialog';
import { ClientTicketsModal } from '@/components/tickets/ClientTicketsModal';
import { EditAppointmentDialog } from '@/components/tickets/EditAppointmentDialog';
import { TranslatedText } from '@/components/ui/TranslatedText';
import { Languages } from 'lucide-react';

function dateStr(d: Date): string {
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
}

const TRANSLATIONS = {
  ar: {
    title: 'جدول المواعيد',
    subtitle: 'متابعة مواعيد الزيارات للعملاء وتخصصات الصيانة المطلوبة',
    allSups: 'كل المشرفين',
    allProj: 'كل المشاريع',
    add: 'إضافة',
    print: 'طباعة',
    printWithImages: 'طباعة بالصور',
    calendar: 'تقويم',
    search: 'بحث...',
    villa: 'فيلا',
    today: 'اليوم',
    appointments: 'موعد',
    addSpecialty: 'إضافة تخصص',
    noteLabel: 'ملاحظة:',
    notesLabel: 'الملاحظات:',
    technicianNotesLabel: 'ملاحظات الفني (يدوي):',
    supsLabel: 'المشرفين:',
    attachLabel: 'مرفقات:',
    noAppts: 'لا توجد مواعيد',
    allAvailable: 'جميع الفنيين متاحين في هذا اليوم',
    noPhone: 'بدون رقم',
    noAdditionalNotes: 'لا توجد ملاحظات إضافية',
  },
  ur: {
    title: 'اپوائنٹمنٹ شیڈول',
    subtitle: 'کسٹمر کے دورے کے تقرریوں اور بحالی کی خصوصیات کی پیروی کریں',
    allSups: 'تمام سپروائزر',
    allProj: 'تمام پروجیکٹس',
    add: 'شامل کریں',
    print: 'پرنٹ کریں',
    printWithImages: 'تصاویر کے ساتھ پرنٹ کریں',
    calendar: 'کیلنڈر',
    search: 'تلاش...',
    villa: 'ولا',
    today: 'آج',
    appointments: 'اپوائنٹمنٹ',
    addSpecialty: 'خصوصیت شامل کریں',
    noteLabel: 'نوٹ:',
    notesLabel: 'نوٹس:',
    technicianNotesLabel: 'ٹیکنیشن کے نوٹس (دستی):',
    supsLabel: 'سپروائزر:',
    attachLabel: 'منسلکات:',
    noAppts: 'کوئی اپوائنٹمنٹ نہیں',
    allAvailable: 'تمام ٹیکنیشن آج دستیاب ہیں',
    noPhone: 'کوئی نمبر نہیں',
    noAdditionalNotes: 'کوئی اضافی نوٹس نہیں',
  },
  hi: {
    title: 'अपॉइंटमेंट शेड्यूल',
    subtitle: 'ग्राहक यात्रा नियुक्तियों और आवश्यक रखरखाव विशिष्टताओं का पालन करें',
    allSups: 'सभी पर्यवेक्षक',
    allProj: 'सभी प्रोजेक्ट्स',
    add: 'जोड़ें',
    print: 'प्रिंट करें',
    printWithImages: 'चित्रों के साथ प्रिंट करें',
    calendar: 'कैलेंडर',
    search: 'खोज...',
    villa: 'विला',
    today: 'आज',
    appointments: 'अपॉइंटमेंट',
    addSpecialty: 'विशेषता जोड़ें',
    noteLabel: 'नोट:',
    notesLabel: 'नोट्स:',
    technicianNotesLabel: 'तकनीशियन नोट्स (मैनुअल):',
    supsLabel: 'पर्यवेक्षक:',
    attachLabel: 'अनुलग्नक:',
    noAppts: 'कोई अपॉइंटमेंट नहीं',
    allAvailable: 'सभी तकनीशियन आज उपलब्ध हैं',
    noPhone: 'कोई नंबर नहीं',
    noAdditionalNotes: 'कोई अतिरिक्त नोट्स नहीं',
  }
};

export default function Appointments() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { typeTranslations } = useTicketTypes();
  const mergedTypes: Record<string, string> = {
    electricity: 'كهرباء', electrical: 'كهرباء', plumbing: 'سباكة', doors: 'أبواب', paints: 'دهانات', painting: 'دهانات',
    ceramics: 'سيراميك', drainage: 'صرف صحي', ac_ventilation: 'تكييف وتهوية', hvac: 'تكييف', ac: 'تكييف',
    waterproofing: 'عزل', pest_control: 'مكافحة حشرات', general: 'عام', carpentry: 'نجارة', civil: 'مدني', mechanics: 'ميكانيكا',
    doors_windows: 'أبواب ونوافذ', cracks: 'كراك', grading: 'ترويبه', gypsum: 'جبس', lighting: 'إضاءة', aluminum: 'ألمنيوم',
    smart_home: 'نظام ذكي', swimming_pool: 'مسبح', landscaping: 'زراعة وحدائق',
    ...typeTranslations
  };

  const [directApptDate, setDirectApptDate] = useState<string | null>(null);
  const [clientTicketsModal, setClientTicketsModal] = useState<{ villa: string, project: string, notes: string } | null>(null);
  const [editApptGroup, setEditApptGroup] = useState<any>(null);
  const [refDate, setRefDate] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const displayedDays = useMemo(() => {
    const prev = new Date(refDate); prev.setDate(prev.getDate() - 1);
    const next = new Date(refDate); next.setDate(next.getDate() + 1);
    return [prev, refDate, next];
  }, [refDate]);

  const from = dateStr(displayedDays[0]);
  const to = dateStr(displayedDays[2]);

  const [appointments, setAppointments] = useState<any[]>([]);
  const [openTicketsMap, setOpenTicketsMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [filterSup, setFilterSup] = useState<string>('');
  const [filterProject, setFilterProject] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [lang, setLang] = useState<'ar' | 'ur' | 'hi'>('ar');
  const t = TRANSLATIONS[lang];

  const [addSpecOpen, setAddSpecOpen] = useState(false);
  const [addSpecData, setAddSpecData] = useState<any>(null);
  const [printWithImages, setPrintWithImages] = useState(false);
  const [preloadImages, setPreloadImages] = useState(false);

  const loadAppointments = async () => {
    setLoading(true);
    try {
      const engineerProjectIds =
        user?.role === 'engineer' && !filterProject && user.projectIds?.length
          ? user.projectIds
          : undefined;

      const data = await appointmentsApi.getCalendar({
        from,
        to,
        projectId: filterProject || undefined,
        projectIds: engineerProjectIds,
      });
      setAppointments(data);
    } catch {
      toast.error('فشل جلب المواعيد');
    } finally {
      setLoading(false);
    }
  };

  const loadOpenTicketsCount = async () => {
    if (!user || window.innerWidth < 768) return;
    try {
      const params: any = { limit: 500 };
      if (user.role === 'supervisor') params.supervisorId = user.uid;
      else if (user.role !== 'admin' && user.projectIds?.length) params.projectIds = user.projectIds;

      const allTickets = await ticketsApi.getAll(params);
      const map: Record<string, number> = {};

      allTickets.forEach((t: any) => {
        if (t.status !== 'closed' && t.status !== 'out-of-scope') {
          const key = t.villaNumber + '_' + (t.projectId || '');
          map[key] = (map[key] || 0) + 1;
        }
      });
      setOpenTicketsMap(map);
    } catch {
      // Silently fail
    }
  };

  useEffect(() => {
    if (!user) return;
    projectsApi.getAll().then((p: any[]) => {
      const filtered = user.role === 'admin' ? p : p.filter(proj => user.projectIds?.includes(proj.id));
      setProjects(filtered);
    }).catch(() => { });

    if (user.role === 'admin' || user.role === 'supervisor' || user.role === 'engineer') {
      usersApi.getAll().then((u: any[]) => setSupervisors(u.filter((x: any) => x.role === 'supervisor'))).catch(() => { });
    }
    loadOpenTicketsCount();
  }, [user]);

  useEffect(() => { loadAppointments(); }, [from, to, filterProject, user]);

  const groupedByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const day of displayedDays) {
      map[dateStr(day)] = [];
    }

    const allByDate: Record<string, any[]> = {};
    for (const appt of appointments) {
      const d = (appt.appointmentTime || '').split(' ')[0];
      if (!allByDate[d]) allByDate[d] = [];
      allByDate[d].push(appt);
    }

    for (const d of Object.keys(map)) {
      const dayAppts = allByDate[d] || [];
      const clientMap: Record<string, any> = {};

      for (const appt of dayAppts) {
        const key = appt.villaNumber + '_' + (appt.projectId || '');
        if (!clientMap[key]) {
          clientMap[key] = {
            clientId: appt.clientId,
            clientName: appt.clientName,
            clientPhone: appt.client?.phone || null,
            villaNumber: appt.villaNumber,
            projectId: appt.projectId,
            appointmentTime: appt.appointmentTime,
            types: new Set<string>(),
            sups: new Set<string>(),
            tickets: [],
          };
        }
        if (appt.type) clientMap[key].types.add(appt.type);
        if (appt.detectedTypes) appt.detectedTypes.forEach((t: string) => clientMap[key].types.add(t));
        if (appt.assignedSupervisorIds) appt.assignedSupervisorIds.forEach((s: string) => clientMap[key].sups.add(s));
        clientMap[key].tickets.push(appt);
      }

      let groups = Object.values(clientMap);

      if (filterSup) {
        groups = groups.filter(g => g.sups.has(filterSup));
      } else if (user?.role === 'supervisor') {
        groups = groups.filter(g => g.sups.has(user.uid));
      }

      if (searchQuery) {
        const sq = searchQuery.toLowerCase();
        groups = groups.filter(g =>
          (g.villaNumber && String(g.villaNumber).toLowerCase().includes(sq)) ||
          (g.clientName && String(g.clientName).toLowerCase().includes(sq)) ||
          (g.tickets.some((t: any) => t.ticketId && String(t.ticketId).toLowerCase().includes(sq)))
        );
      }

      groups.sort((a, b) => {
        const timeA = (a.appointmentTime || '').split(' ')[1] || '99:99';
        const timeB = (b.appointmentTime || '').split(' ')[1] || '99:99';
        return timeA.localeCompare(timeB);
      });

      map[d] = groups;
    }
    return map;
  }, [appointments, displayedDays, filterSup, user, searchQuery]);

  const prevDay = () => {
    const d = new Date(refDate);
    d.setDate(d.getDate() - 1);
    setRefDate(d);
  };

  const nextDay = () => {
    const d = new Date(refDate);
    d.setDate(d.getDate() + 1);
    setRefDate(d);
  };

  const goToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setRefDate(d);
  };

  const handleOpenAddSpecialty = (group: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setAddSpecData(group);
    setAddSpecOpen(true);
  };

  // ── Download all appointments as a single .ics file ──────────────────────
  const downloadAllToCalendar = (e: React.MouseEvent) => {
    e.stopPropagation();
    const ds = dateStr(refDate);
    const groups = groupedByDay[ds] || [];
    if (groups.length === 0) { toast.error('لا توجد مواعيد لهذا اليوم'); return; }

    const events = groups.map(group => {
      const apptTime           = group.appointmentTime || '';
      const dateOnly           = apptTime.split(' ')[0] || ds;
      const time               = apptTime.split(' ')[1] || '08:00';
      const [year, month, day] = dateOnly.split('-');
      const [hour, minute]     = time.split(':');
      const endHour            = String(parseInt(hour) + 1).padStart(2, '0');

      const dtStart = `${year}${month}${day}T${hour}${minute}00`;
      const dtEnd   = `${year}${month}${day}T${endHour}${minute}00`;
      const types   = Array.from(group.types).map((t: any) => mergedTypes[t] || t).join(' - ');
      const note    = group.tickets.find((t: any) => t.appointmentNotes)?.appointmentNotes || '';
      const phone   = group.clientPhone ? `هاتف: ${group.clientPhone}` : '';
      const desc    = [note ? `ملاحظات: ${note}` : '', phone].filter(Boolean).join('\n');

      return [
        'BEGIN:VEVENT',
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:فيلا ${group.villaNumber}${types ? ' - ' + types : ''}`,
        desc ? `DESCRIPTION:${desc}` : '',
        `LOCATION:فيلا ${group.villaNumber}`,
        `UID:villa-${group.villaNumber}-${dateOnly}@maintenance`,
        'END:VEVENT',
      ].filter(Boolean).join('\r\n');
    });

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Maintenance Schedule//AR',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      ...events,
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `appointments-${ds}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`تم تحميل ${groups.length} موعد — افتح الملف لإضافتهم للتقويم`);
  };

  return (
    <Layout>
      <div className="print:hidden">
        <div className="space-y-2 sm:space-y-6 page-in" dir="rtl">

          {/* ── Header ── */}
          <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <CalendarDays className="w-5 h-5 sm:w-7 sm:h-7 text-blue-500 shrink-0" />
              <div>
                <h1 className="text-lg sm:text-3xl font-extrabold text-foreground tracking-tight leading-tight">
                  جدول المواعيد
                </h1>
                <p className="text-muted-foreground text-xs sm:text-sm hidden sm:block">
                  متابعة مواعيد الزيارات للعملاء وتخصصات الصيانة المطلوبة
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {(user?.role === 'admin' || user?.role === 'engineer') && supervisors.length > 0 && (
                <div className="relative">
                  <Users className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />
                  <select
                    value={filterSup}
                    onChange={e => setFilterSup(e.target.value)}
                    className="bg-card border border-border rounded-xl pl-2 pr-7 sm:pl-3 sm:pr-9 h-8 sm:h-10 text-xs sm:text-sm text-foreground font-bold appearance-none hover:border-slate-500 transition-colors max-w-[120px] sm:max-w-none"
                  >
                    <option value="">كل المشرفين</option>
                    {supervisors.map((s: any) => (
                      <option key={s.uid} value={s.uid}>{s.displayName}</option>
                    ))}
                  </select>
                </div>
              )}

              {projects.length > 0 && (
                <select
                  value={filterProject}
                  onChange={e => setFilterProject(e.target.value)}
                  className="bg-card border border-border rounded-xl px-2 sm:px-3 h-8 sm:h-10 text-xs sm:text-sm text-foreground font-bold hover:border-slate-500 transition-colors max-w-[110px] sm:max-w-none"
                >
                  <option value="">كل المشاريع</option>
                  {projects.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.abbreviation || p.name}</option>
                  ))}
                </select>
              )}

              <Button
                onClick={loadAppointments}
                variant="outline"
                size="icon"
                className="h-8 w-8 sm:h-10 sm:w-10 rounded-xl border-border bg-card hover:bg-white/5"
              >
                <RefreshCw className={cn('w-3.5 h-3.5 sm:w-4 sm:h-4', loading && 'animate-spin')} />
              </Button>
              <div className="relative">
                <Languages className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />
                <select
                  value={lang}
                  onChange={e => setLang(e.target.value as any)}
                  className="bg-card border border-border rounded-xl pl-2 pr-7 sm:pl-3 sm:pr-9 h-8 sm:h-10 text-xs sm:text-sm text-foreground font-bold appearance-none hover:border-slate-500 transition-colors"
                >
                  <option value="ar">العربية</option>
                  <option value="hi">हिन्दी</option>
                  <option value="ur">اردو</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Carousel Hero UI ── */}
          <div className="relative w-full h-[calc(100dvh-220px)] min-h-[340px] max-h-[950px] flex justify-center items-center overflow-hidden py-2">
            {displayedDays.map((day, idx) => {
              const ds = dateStr(day);
              const groups = groupedByDay[ds] || [];
              const isToday = ds === dateStr(new Date());

              const isRight  = idx === 0;
              const isCenter = idx === 1;
              const isLeft   = idx === 2;

              const cardClass = "absolute inset-x-0 top-2 bottom-2 sm:top-4 sm:bottom-4 mx-auto transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)] flex flex-col rounded-[2rem] overflow-hidden border w-full max-w-[94%] sm:max-w-[90%] md:max-w-[750px] lg:max-w-[850px]";

              let posClass = "";
              let interactiveClass = "";

              if (isCenter) {
                posClass = cn(
                  "z-20 scale-100 opacity-100 translate-y-0 translate-x-0 border-2 bg-popover",
                  "shadow-[0_8px_40px_-8px_rgba(0,0,0,0.6)] dark:shadow-[0_8px_40px_-4px_rgba(59,130,246,0.15)]",
                  isToday
                    ? "border-blue-500/60 ring-4 ring-blue-500/15 dark:ring-blue-500/20"
                    : "border-border dark:border-slate-600/60"
                );
              } else if (isRight) {
                posClass = "z-10 scale-[0.85] opacity-[0.4] translate-y-4 translate-x-[15%] sm:translate-x-[25%] md:translate-x-[35%] lg:translate-x-[45%] blur-[1px] border-border/50 bg-card shadow-none";
                interactiveClass = "hover:blur-none hover:opacity-100 hover:scale-[0.90] cursor-pointer";
              } else if (isLeft) {
                posClass = "z-10 scale-[0.85] opacity-[0.4] translate-y-4 -translate-x-[15%] sm:-translate-x-[25%] md:-translate-x-[35%] lg:-translate-x-[45%] blur-[1px] border-border/50 bg-card shadow-none";
                interactiveClass = "hover:blur-none hover:opacity-100 hover:scale-[0.90] cursor-pointer";
              }

              const mobileClass = isCenter ? "flex" : "hidden sm:flex";

              return (
                <div
                  key={ds}
                  className={cn(cardClass, posClass, mobileClass, interactiveClass)}
                  onClick={() => {
                    if (isRight) prevDay();
                    if (isLeft) nextDay();
                  }}
                >
                  <div className={cn(
                    "p-2.5 sm:p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2 sticky top-0 z-10 backdrop-blur-xl",
                    isToday ? "bg-blue-500/10 border-blue-500/20" : "bg-card/90 border-border"
                  )}>
                    {/* Row 1: Day name + nav arrows */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div>
                          <h3 className={cn("font-black text-lg sm:text-2xl leading-tight", isToday ? "text-blue-600 dark:text-blue-400" : "text-foreground")}>
                            {day.toLocaleDateString(lang === 'hi' ? 'hi-IN' : lang === 'ur' ? 'ur-PK' : 'ar-EG', { weekday: 'long' })}
                          </h3>
                          <p className="text-[10px] sm:text-xs text-muted-foreground font-medium mt-0.5">
                            {day.toLocaleDateString(lang === 'hi' ? 'hi-IN' : lang === 'ur' ? 'ur-PK' : 'ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
                          </p>
                        </div>

                        {isCenter && (
                          <div className="flex items-center gap-1 bg-background border border-border rounded-xl p-0.5 shadow-sm">
                            <Button onClick={(e) => { e.stopPropagation(); prevDay(); }} variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg hover:bg-muted">
                              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                            <Button onClick={(e) => { e.stopPropagation(); goToday(); }} variant="ghost" className="h-7 sm:h-8 px-2 sm:px-3 rounded-lg font-bold text-[11px] sm:text-xs hover:bg-muted">
                              اليوم
                            </Button>
                            <Button onClick={(e) => { e.stopPropagation(); nextDay(); }} variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg hover:bg-muted">
                              <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                          </div>
                        )}
                      </div>

                      <Badge variant="outline" className={cn(
                        "px-2.5 py-1 text-xs sm:text-sm font-black border rounded-xl w-fit shrink-0",
                        isToday ? "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30" : "bg-muted text-muted-foreground border-border"
                      )}>
                        {groups.length} موعد
                      </Badge>
                    </div>

                    {/* Row 2: search + action buttons (center only) */}
                    {isCenter && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="relative">
                          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="بحث..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-background border border-input rounded-xl pl-2 pr-8 h-8 text-xs text-foreground focus:outline-none focus:border-blue-500 transition-colors w-[90px] sm:w-[140px]"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setDirectApptDate(ds); }}
                          className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold h-8 px-2.5 shadow-lg flex items-center gap-1 text-xs"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" /> إضافة
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setPrintWithImages(false); setPreloadImages(false); setTimeout(() => window.print(), 100); }}
                          className="bg-muted hover:bg-muted/80 text-foreground border border-input rounded-xl font-bold h-8 px-2 sm:px-2.5 shadow-lg flex items-center gap-1 text-xs"
                          title="طباعة"
                        >
                          <Printer className="w-3.5 h-3.5" /> <span className="hidden sm:inline">طباعة</span>
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setPrintWithImages(true); setPreloadImages(true); setTimeout(() => window.print(), 1500); }}
                          className="bg-muted hover:bg-muted/80 text-foreground border border-input rounded-xl font-bold h-8 px-2 sm:px-2.5 shadow-lg flex items-center gap-1 text-xs"
                          title="طباعة بالصور"
                        >
                          <FileImage className="w-3.5 h-3.5" /> <span className="hidden sm:inline">طباعة بالصور</span>
                        </Button>
                        {/* ── Export to Calendar button ── */}
                        <Button
                          size="sm"
                          onClick={downloadAllToCalendar}
                          className="bg-muted hover:bg-muted/80 text-foreground border border-input rounded-xl font-bold h-8 px-2 sm:px-2.5 shadow-lg flex items-center gap-1 text-xs"
                          title="تصدير كل المواعيد للتقويم"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">تقويم</span>
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Clients List */}
                  <div className="overflow-y-auto flex-1 p-2 sm:p-3 no-scrollbar">
                    {loading && appointments.length === 0 && isCenter ? (
                      <div className="flex justify-center py-20"><RefreshCw className="w-8 h-8 animate-spin text-slate-500" /></div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 h-max pb-2">
                        {[...groups].sort((a, b) => {
                          const ta = (a.appointmentTime || '').split(' ')[1] || '00:00';
                          const tb = (b.appointmentTime || '').split(' ')[1] || '00:00';
                          return ta.localeCompare(tb);
                        }).map((group, idx) => {
                          const note = group.tickets.find((t: any) => t.appointmentNotes)?.appointmentNotes || '';
                          const time = (group.appointmentTime || '').split(' ')[1] || '---';
                          const clientKey = group.villaNumber + '_' + (group.projectId || '');
                          const totalOpen = openTicketsMap[clientKey] || 0;

                          return (
                            <div
                              key={idx}
                              className={cn(
                                "bg-card/80 border rounded-2xl p-2.5 sm:p-3 flex flex-col gap-2 relative transition-all duration-300 shadow-sm cursor-pointer hover:bg-muted",
                                isCenter ? "hover:border-slate-500 hover:shadow-lg hover:-translate-y-1" : "border-border/50"
                              )}
                              onClick={e => { if (isCenter) { e.stopPropagation(); setClientTicketsModal({ villa: group.villaNumber, project: group.projectId, notes: note }); } }}
                            >

                              {/* Top Row: Villa & Time */}
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex-1 min-w-0 pr-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-black text-foreground text-base truncate">
                                      {t.villa} {group.villaNumber} {totalOpen > 0 && <span className="text-amber-600 dark:text-amber-500 font-bold text-xs">({totalOpen})</span>}
                                    </h4>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  {isCenter && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEditApptGroup(group); }}
                                      className="flex items-center justify-center bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-xl h-8 px-2 transition-colors"
                                      title="تعديل وتأجيل الموعد"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {isCenter && group.clientPhone && (
                                    <>
                                      <a
                                        href={`tel:${group.clientPhone}`}
                                        onClick={e => e.stopPropagation()}
                                        className="flex items-center justify-center bg-emerald-500/10 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-500 rounded-xl h-8 px-2 transition-colors"
                                        title="اتصال"
                                      >
                                        <Phone className="w-3.5 h-3.5" />
                                      </a>
                                      <a
                                        href={`https://wa.me/${group.clientPhone.replace(/\D/g, '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        className="flex items-center justify-center bg-[#25D366]/10 hover:bg-[#25D366]/25 border border-[#25D366]/30 text-[#25D366] rounded-xl h-8 px-2 transition-colors"
                                        title="واتساب"
                                      >
                                        <MessageCircle className="w-3.5 h-3.5" />
                                      </a>
                                    </>
                                  )}
                                  <div className="flex flex-col items-center justify-center bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-2.5 py-1 min-w-[65px] shrink-0 shadow-inner">
                                    <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mb-0.5" />
                                    <span className="text-emerald-700 dark:text-emerald-300 font-black tabular-nums text-sm">{time}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Specialties Tags */}
                              <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-border/50">
                                {Array.from(group.types).map(t => (
                                  <span key={t as string} className="text-[11px] font-bold px-2 py-1 rounded-lg border bg-muted text-foreground border-border shadow-sm">
                                    <TranslatedText text={mergedTypes[t as string] || t as string} lang={lang} />
                                  </span>
                                ))}
                                <button
                                  onClick={(e) => handleOpenAddSpecialty(group, e)}
                                  className="text-[11px] font-bold px-2 py-1 rounded-lg border border-dashed border-input text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted transition-all flex items-center gap-1"
                                >
                                  <Plus className="w-3 h-3" />
                                  {t.addSpecialty}
                                </button>
                              </div>

                              {/* Notes */}
                              {note && (<div className="text-[11px] text-muted-foreground bg-muted/50 p-1.5 rounded-lg mt-0.5 border border-input flex gap-1.5"><span className="font-bold shrink-0 text-foreground/70">{t.noteLabel}</span><span className="line-clamp-2 leading-snug"><TranslatedText text={note} lang={lang} /></span></div>)}

                              {/* Supervisors */}
                              {group.sups && group.sups.size > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-border/50">
                                  <span className="text-[10px] font-bold text-muted-foreground">{t.supsLabel}</span>
                                  {Array.from(group.sups).map(sId => {
                                    const sup = supervisors.find(s => s.uid === sId || s.id === sId);
                                    return (
                                      <span key={sId as string} className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                                        {sup ? (sup.displayName || sup.name) : 'غير معروف'}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}

                              {/* Attachments */}
                              {(() => {
                                const urls = group.tickets.flatMap((t: any) => (t.description || '').match(/(https?:\/\/[^\s]+)/g) || []);
                                if (urls.length === 0) return null;
                                return (
                                  <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-border/50">
                                    <span className="text-[10px] font-bold text-muted-foreground shrink-0"><FileImage className="w-3 h-3 inline mr-1"/>{t.attachLabel}</span>
                                    {urls.map((url: string, idx: number) => (
                                      <img
                                        key={idx}
                                        src={url}
                                        alt="مرفق"
                                        className="w-14 h-14 rounded-lg object-cover border border-border cursor-pointer hover:opacity-80 transition-opacity shadow-sm"
                                        onClick={(e) => { e.stopPropagation(); window.open(url, '_blank'); }}
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                      />
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {groups.length === 0 && !loading && isCenter && (
                      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground opacity-60">
                        <CalendarDays className="w-16 h-16 mb-4 opacity-50" />
                        <p className="text-lg font-bold">{t.noAppts}</p>
                        <p className="text-sm mt-2 opacity-80">{t.allAvailable}</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* --- Print Layout --- */}
      <div className="hidden print:block print:w-full print:bg-white print:text-black print:p-0" dir="rtl">
        <h2 className="text-lg font-black text-center mb-2 border-b border-black pb-1">
          جدول المواعيد - {new Date(dateStr(refDate)).toLocaleDateString(lang === 'hi' ? 'hi-IN' : lang === 'ur' ? 'ur-PK' : 'ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </h2>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {(() => {
            const ds = dateStr(refDate);
            const rawGroups = groupedByDay[ds] || [];
            const sorted = [...rawGroups].sort((a, b) => {
              const tA = (a.appointmentTime || '').split(' ')[1] || '00:00';
              const tB = (b.appointmentTime || '').split(' ')[1] || '00:00';
              return tA.localeCompare(tB);
            });
            return sorted.map((g, i) => {
              const tA = (g.appointmentTime || '').split(' ')[1] || '---';
              const note = g.tickets.find((t: any) => t.appointmentNotes)?.appointmentNotes || t.noAdditionalNotes;
              const imageUrls: string[] = printWithImages
                ? g.tickets.flatMap((t: any) => (t.description || '').match(/(https?:\/\/[^\s]+)/g) || [])
                : [];
              const hasImages = imageUrls.length > 0;
              return (
                <div
                  key={i}
                  className={`border border-black rounded-lg p-2 flex flex-col gap-1.5 break-inside-avoid overflow-hidden ${hasImages ? 'col-span-2' : 'col-span-1 min-h-[80px] justify-center'}`}
                >
                  <div className="flex justify-between items-center border-b border-black/30 pb-1">
                    <h3 className="font-bold text-sm leading-tight">{t.villa} {g.villaNumber} <span className="font-normal text-xs text-gray-700">({g.clientPhone || t.noPhone})</span></h3>
                    <span className="font-black text-sm leading-tight tabular-nums">{tA}</span>
                  </div>

                  {hasImages ? (
                    <div className="flex gap-3 items-start">
                      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                        <div className="flex flex-wrap gap-1">
                          {Array.from(g.types).map(tp => (
                            <span key={tp as string} className="text-[10px] font-bold border border-gray-400 rounded px-1.5 py-[2px] leading-none">
                              <TranslatedText text={mergedTypes[tp as string] || tp as string} lang={lang} />
                            </span>
                          ))}
                        </div>
                        <div className="text-[10px] text-gray-800 bg-gray-50 p-1.5 rounded border border-dashed border-gray-300 leading-tight">
                          <span className="font-bold">{t.notesLabel} </span> <TranslatedText text={note} lang={lang} />
                        </div>
                        <div className="text-[10px] text-gray-800 bg-white p-1.5 rounded border border-dashed border-gray-300 leading-tight min-h-[40px] mt-1">
                          <span className="font-bold">{t.technicianNotesLabel} </span> 
                        </div>
                      </div>
                      <div className="flex flex-row flex-wrap gap-1.5 justify-end" style={{ maxWidth: '70%' }}>
                        {imageUrls.map((url: string, idx: number) => (
                          <img
                            key={idx}
                            src={url}
                            alt="مرفق"
                            style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 6, border: '1px solid #ccc', flexShrink: 0 }}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {Array.from(g.types).map(tp => (
                          <span key={tp as string} className="text-[10px] font-bold border border-gray-400 rounded px-1.5 py-[2px] leading-none">
                            <TranslatedText text={mergedTypes[tp as string] || tp as string} lang={lang} />
                          </span>
                        ))}
                      </div>
                      <div className="text-[10px] text-gray-800 bg-gray-50 p-1.5 rounded border border-dashed border-gray-300 leading-tight line-clamp-2 mt-auto">
                        <span className="font-bold">{t.notesLabel} </span> <TranslatedText text={note} lang={lang} />
                      </div>
                      <div className="text-[10px] text-gray-800 bg-white p-1.5 rounded border border-dashed border-gray-300 leading-tight min-h-[40px] mt-1">
                        <span className="font-bold">{t.technicianNotesLabel} </span> 
                      </div>
                    </>
                  )}
                </div>
              )
            })
          })()}
        </div>
      </div>

      {/* Dialogs */}
      {addSpecOpen && addSpecData && (
        <QuickAddSpecialtyDialog
          open={addSpecOpen}
          onOpenChange={setAddSpecOpen}
          villaNumber={addSpecData.villaNumber}
          ticketId={addSpecData.tickets[0]?.id}
          existingDetectedTypes={addSpecData.tickets[0]?.detectedTypes}
          existingSupervisorIds={addSpecData.tickets[0]?.assignedSupervisorIds}
          existingSupervisors={addSpecData.tickets[0]?.assignedSupervisors}
          supervisors={supervisors}
          onSuccess={loadAppointments}
        />
      )}
      {directApptDate && (
        <DirectAppointmentDialog
          open={!!directApptDate}
          onOpenChange={(v) => !v && setDirectApptDate(null)}
          dateStr={directApptDate}
          onSuccess={() => {
            loadAppointments();
            loadOpenTicketsCount();
          }}
        />
      )}
      {clientTicketsModal && (
        <ClientTicketsModal
          open={!!clientTicketsModal}
          onOpenChange={(open) => !open && setClientTicketsModal(null)}
          villaNumber={clientTicketsModal.villa}
          projectId={clientTicketsModal.project}
          initialNotes={clientTicketsModal.notes}
          onSuccess={loadAppointments}
        />
      )}
      {editApptGroup && (
        <EditAppointmentDialog
          open={!!editApptGroup}
          onOpenChange={(op) => !op && setEditApptGroup(null)}
          group={editApptGroup}
          supervisors={supervisors}
          onSuccess={loadAppointments}
        />
      )}
      {preloadImages && (
        <div className="fixed top-0 left-[-9999px] opacity-0 pointer-events-none print:hidden">
          {appointments.flatMap((t: any) => (t.description || '').match(/(https?:\/\/[^\s]+)/g) || []).map((url: string, idx: number) => (
            <img key={idx} src={url} alt="preload" />
          ))}
        </div>
      )}
    </Layout>
  );
}