import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock, RefreshCw,
  Plus, Users, CalendarPlus, Printer, Pencil, Search, FileImage,
  Phone, MessageCircle, CheckCircle2, RotateCcw, Wrench, Home
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { appointmentsApi, projectsApi, usersApi, ticketsApi, techniciansApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useTicketTypes } from '@/contexts/TicketTypesContext';
import { QuickAddSpecialtyDialog } from '@/components/tickets/QuickAddSpecialtyDialog';
import { UnifiedAppointmentDialog } from '@/components/tickets/UnifiedAppointmentDialog';
import { ClientTicketsModal } from '@/components/tickets/ClientTicketsModal';
import { TranslatedText } from '@/components/ui/TranslatedText';
import { Languages } from 'lucide-react';
import { jsPDF } from 'jspdf';
import * as htmlToImage from 'html-to-image';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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
  const { typeTranslations, subTypeTranslations } = useTicketTypes();
  const mergedTypes: Record<string, string> = {
    electricity: 'كهرباء', electrical: 'كهرباء', plumbing: 'سباكة', doors: 'أبواب', paints: 'دهانات', painting: 'دهانات',
    ceramics: 'سيراميك', drainage: 'صرف صحي', ac_ventilation: 'تكييف وتهوية', hvac: 'تكييف', ac: 'تكييف',
    waterproofing: 'عزل', pest_control: 'مكافحة حشرات', general: 'عام', carpentry: 'نجارة', civil: 'مدني', mechanics: 'ميكانيكا',
    doors_windows: 'أبواب ونوافذ', cracks: 'كراك', grading: 'ترويبه', gypsum: 'جبس', lighting: 'إضاءة', aluminum: 'ألمنيوم',
    smart_home: 'نظام ذكي', swimming_pool: 'مسبح', landscaping: 'زراعة وحدائق',
    ...typeTranslations,
    ...subTypeTranslations,  // UUID sub-type IDs → nameAr
  };

  const [directApptDate, setDirectApptDate] = useState<string | null>(null);
  const [clientTicketsModal, setClientTicketsModal] = useState<{ villa: string, project: string } | null>(null);
  const [editApptGroup, setEditApptGroup] = useState<any>(null);
  const [refDate, setRefDate] = useState(() => {
    const stored = sessionStorage.getItem('appointments_refDate');
    if (stored) {
      const d = new Date(stored);
      if (!isNaN(d.getTime())) return d;
    }
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
  const [filterSup, setFilterSup] = useState<string>(() => sessionStorage.getItem('appointments_filterSup') || '');
  const [filterProject, setFilterProject] = useState<string>(() => sessionStorage.getItem('appointments_filterProject') || '');
  const [searchQuery, setSearchQuery] = useState<string>(() => sessionStorage.getItem('appointments_searchQuery') || '');
  const [lang, setLang] = useState<'ar' | 'ur' | 'hi'>('ar');
  const t = TRANSLATIONS[lang];

  const [technicians, setTechnicians] = useState<any[]>([]);
  const [assignTechModal, setAssignTechModal] = useState<{
    isOpen: boolean;
    appointmentId: string;
    currentTechId: string | null;
    projectId?: string;
    villaNumber?: string;
  } | null>(null);

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportWithImagesMode, setExportWithImagesMode] = useState(false);
  const [exportLangs, setExportLangs] = useState<Record<string, boolean>>({ ar: true, ur: true, hi: true });
  const [isExporting, setIsExporting] = useState(false);

  const [addSpecOpen, setAddSpecOpen] = useState(false);
  const [addSpecData, setAddSpecData] = useState<any>(null);

  const handleAssignTechnician = async (appointmentId: string, technicianId: string | null) => {
    try {
      const techObj = technicians.find(t => t.id === technicianId);
      await appointmentsApi.assignTechnician(appointmentId, {
        technicianId: technicianId || null,
        technicianIds: technicianId ? [technicianId] : [],
        technicians: techObj ? [techObj] : []
      });
      toast.success(technicianId ? 'تم إسناد الفني للموعد بنجاح' : 'تم إلغاء إسناد الفني');
      setAssignTechModal(null);
      loadAppointments();
    } catch (err: any) {
      toast.error(err.message || 'فشل إسناد الفني');
    }
  };

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
          const key = t.unitId + '_' + (t.projectId || '');
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

    techniciansApi.getAll().then((t: any[]) => {
      setTechnicians(t || []);
    }).catch(() => { });

    loadOpenTicketsCount();
  }, [user]);

  useEffect(() => { loadAppointments(); }, [from, to, filterProject, user]);

  // ── الحفاظ على الفلاتر/البحث/التاريخ المعروض عند مغادرة الصفحة والرجوع ليها ──
  useEffect(() => { sessionStorage.setItem('appointments_refDate', refDate.toISOString()); }, [refDate]);
  useEffect(() => { sessionStorage.setItem('appointments_filterSup', filterSup); }, [filterSup]);
  useEffect(() => { sessionStorage.setItem('appointments_filterProject', filterProject); }, [filterProject]);
  useEffect(() => { sessionStorage.setItem('appointments_searchQuery', searchQuery); }, [searchQuery]);

  // استرجاع مكان السكرول لو كنا فاكرينه من قبل، وحفظه لما نسيب الصفحة
  useEffect(() => {
    const savedY = sessionStorage.getItem('appointmentsScrollY');
    if (savedY) {
      setTimeout(() => { window.scrollTo({ top: parseInt(savedY, 10), behavior: 'auto' }); sessionStorage.removeItem('appointmentsScrollY'); }, 100);
    }
    return () => { sessionStorage.setItem('appointmentsScrollY', String(window.scrollY)); };
  }, []);

  const projectsMap = useMemo(() => {
    const map = new Map<string, any>();
    projects.forEach((p: any) => map.set(p.id, p));
    return map;
  }, [projects]);

  const groupedByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const day of displayedDays) {
      map[dateStr(day)] = [];
    }

    // appointments is now an array of Appointment objects from the API
    for (const appt of appointments) {
      const d = appt.date;
      if (!map[d]) continue;

      // Collect types from appointment + tickets
      const types = new Set<string>(appt.types || []);
      for (const t of (appt.tickets || [])) {
        if (t.type) types.add(t.type);
        if (t.detectedTypes) t.detectedTypes.forEach((dt: string) => types.add(dt));
      }

      const sups = new Set<string>(appt.supervisorIds || []);
      const clientPhone = appt.clientPhone ||
        (appt.tickets?.[0]?.client?.phone) || null;

      map[d].push({
        appointmentId: appt.id,
        status: appt.status || 'scheduled',
        clientId: appt.clientId,
        clientName: appt.clientName,
        clientPhone,
        villaNumber: appt.villaNumber,
        projectId: appt.projectId,
        appointmentTime: `${appt.date} ${appt.time || ''}`.trim(),
        notes: appt.notes,
        types,
        sups,
        supervisors: appt.supervisors,
        technicianId: appt.technicianId,
        technicianIds: appt.technicianIds || (appt.technicianId ? [appt.technicianId] : []),
        technician: appt.technician,
        technicians: appt.technicians,
        tickets: appt.tickets || [],
      });
    }

    for (const d of Object.keys(map)) {
      let groups = map[d];

      if (filterSup) {
        groups = groups.filter(g => g.sups.has(filterSup));
      } else if (user?.role === 'supervisor') {
        groups = groups.filter(g => g.sups.has(user.uid));
      }

      if (searchQuery) {
        const sq = searchQuery.toLowerCase();
        groups = groups.filter(g => {
          const pName = projectsMap.get(g.projectId)?.name || '';
          const pCode = projectsMap.get(g.projectId)?.code || '';
          return (
            (g.villaNumber && String(g.villaNumber).toLowerCase().includes(sq)) ||
            (g.clientName && String(g.clientName).toLowerCase().includes(sq)) ||
            (pName && pName.toLowerCase().includes(sq)) ||
            (pCode && pCode.toLowerCase().includes(sq)) ||
            (g.tickets.some((t: any) => t.ticketId && String(t.ticketId).toLowerCase().includes(sq)))
          );
        });
      }

      groups.sort((a, b) => {
        const timeA = (a.appointmentTime || '').split(' ')[1] || '99:99';
        const timeB = (b.appointmentTime || '').split(' ')[1] || '99:99';
        return timeA.localeCompare(timeB);
      });

      map[d] = groups;
    }
    return map;
  }, [appointments, displayedDays, filterSup, user, searchQuery, projectsMap]);

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
      const note    = group.notes || '';
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

  const handleOpenExport = (e: React.MouseEvent, withImages: boolean) => {
    e.stopPropagation();
    setExportWithImagesMode(withImages);
    setExportModalOpen(true);
  };

  const executeExport = async () => {
    setIsExporting(true);
    toast.info('جاري تحضير ملفات PDF، يرجى الانتظار...');
    await new Promise(r => setTimeout(r, 4000));

    const langs = ['ar', 'ur', 'hi'].filter(l => exportLangs[l]);
    for (const l of langs) {
      const el = document.getElementById(`export-layout-${l}`);
      if (!el) continue;

      try {
        const pdf = new jsPDF('p', 'pt', 'a4');
        const margin = 24;
        const pdfPageW = pdf.internal.pageSize.getWidth();
        const pdfPageH = pdf.internal.pageSize.getHeight();
        const contentW = pdfPageW - margin * 2;
        const contentH = pdfPageH - margin * 2;

        // Page height in element pixels
        const pageHeightPx = (contentH * el.offsetWidth) / contentW;

        // Find natural cut points between card rows (never mid-card)
        const elRect = el.getBoundingClientRect();
        const cardEls = Array.from(el.querySelectorAll('[data-export-card]'));

        const pageCuts: number[] = [0];
        let nextCutBottom = pageHeightPx;

        for (const card of cardEls) {
          const r = card.getBoundingClientRect();
          const cardBottom = r.bottom - elRect.top;
          const cardTop    = r.top    - elRect.top;
          if (cardBottom > nextCutBottom) {
            // Cut just before this card (or its row twin in the grid)
            const cut = Math.max(0, cardTop - 4);
            pageCuts.push(cut);
            nextCutBottom = cut + pageHeightPx;
          }
        }

        // Capture full image once
        const imgData = await htmlToImage.toJpeg(el, {
          quality: 0.95,
          pixelRatio: 2,
          imagePlaceholder: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
        });

        // Load image for slicing
        const img = await new Promise<HTMLImageElement>(resolve => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.src = imgData;
        });
        const imgScaleY = img.height / el.offsetHeight;

        for (let pi = 0; pi < pageCuts.length; pi++) {
          const sliceTop    = pageCuts[pi];
          const sliceBottom = pi + 1 < pageCuts.length ? pageCuts[pi + 1] : el.offsetHeight;
          const sliceH      = sliceBottom - sliceTop;

          const canvas = document.createElement('canvas');
          canvas.width  = img.width;
          canvas.height = Math.ceil(sliceH * imgScaleY);
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(
            img,
            0, sliceTop * imgScaleY, img.width, sliceH * imgScaleY,
            0, 0, canvas.width, canvas.height
          );

          const sliceData    = canvas.toDataURL('image/jpeg', 0.95);
          const slicePdfH    = (sliceH / el.offsetWidth) * contentW;

          if (pi > 0) pdf.addPage();
          pdf.addImage(sliceData, 'JPEG', margin, margin, contentW, slicePdfH);
        }

        const langName = l === 'ar' ? 'Arabic' : l === 'ur' ? 'Urdu' : 'Hindi';
        pdf.save(`Appointments-${langName}-${dateStr(refDate)}.pdf`);
      } catch (err: any) {
        console.error('Export error', err);
        toast.error(`فشل تصدير ${l}: ${err?.message || 'Unknown error'}`);
      }
    }
    setIsExporting(false);
    setExportModalOpen(false);
    toast.success('تم التصدير بنجاح');
  };

  const renderPrintLayout = (renderLang: 'ar'|'ur'|'hi', withImages: boolean, idPrefix = "") => {
    const tr = TRANSLATIONS[renderLang];
    const ds = dateStr(refDate);
    const rawGroups = groupedByDay[ds] || [];
    const sorted = [...rawGroups].sort((a, b) => {
      const tA = (a.appointmentTime || '').split(' ')[1] || '00:00';
      const tB = (b.appointmentTime || '').split(' ')[1] || '00:00';
      return tA.localeCompare(tB);
    });

    return (
      <div id={idPrefix ? `${idPrefix}-${renderLang}` : undefined} className="w-full bg-white text-black p-2" dir="rtl">
        <h2 className="text-lg font-black text-center mb-4 border-b border-black pb-2">
          {tr.title} - {new Date(dateStr(refDate)).toLocaleDateString(renderLang === 'hi' ? 'hi-IN' : renderLang === 'ur' ? 'ur-PK' : 'ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </h2>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {sorted.map((g, i) => {
            const tA = (g.appointmentTime || '').split(' ')[1] || '---';
            const note = g.notes || tr.noAdditionalNotes;
            const imageUrls: string[] = withImages
              ? g.tickets.flatMap((t: any) => (t.description || '').match(/(https?:\/\/[^\s]+)/g) || [])
              : [];
            const hasImages = imageUrls.length > 0;
            return (
              <div
                key={i}
                data-export-card
                className={`border border-black rounded-lg p-2 flex flex-col gap-1.5 break-inside-avoid overflow-hidden ${hasImages ? 'col-span-2' : 'col-span-1 min-h-[80px] justify-center'}`}
              >
                <div className="flex justify-between items-center border-b border-black/30 pb-1">
                  <h3 className="font-bold text-sm leading-tight">
                    {tr.villa} {g.villaNumber} {projectsMap.get(g.projectId)?.name ? `• ${projectsMap.get(g.projectId).name}` : ''} <span className="font-normal text-xs text-gray-700">({g.clientPhone || tr.noPhone})</span>
                  </h3>
                  <span className="font-black text-sm leading-tight tabular-nums">{tA}</span>
                </div>
                {hasImages ? (
                  <div className="flex gap-3 items-start">
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {Array.from(g.types).map(tp => (
                          <span key={tp as string} className="text-[10px] font-bold border border-gray-400 rounded px-1.5 py-[2px] leading-none">
                            <TranslatedText text={mergedTypes[tp as string] || tp as string} lang={renderLang} />
                          </span>
                        ))}
                      </div>
                      <div className="text-[10px] text-gray-800 bg-gray-50 p-1.5 rounded border border-dashed border-gray-300 leading-tight line-clamp-2 mt-auto">
                        <span className="font-bold">{tr.notesLabel} </span> <TranslatedText text={note} lang={renderLang} />
                      </div>
                      <div className="text-[10px] text-gray-800 bg-white p-1.5 rounded border border-dashed border-gray-300 leading-tight min-h-[40px] mt-1">
                        <span className="font-bold">{tr.technicianNotesLabel} </span> 
                      </div>
                    </div>
                    <div className="flex flex-row flex-wrap gap-1.5 justify-end" style={{ maxWidth: '70%' }}>
                      {imageUrls.map((url: string, idx: number) => (
                        <img
                          key={idx}
                          src={url}
                          alt="مرفق"
                          style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 6, border: '1px solid #ccc', flexShrink: 0 }}
                          crossOrigin="anonymous"
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
                          <TranslatedText text={mergedTypes[tp as string] || tp as string} lang={renderLang} />
                        </span>
                      ))}
                    </div>
                    <div className="text-[10px] text-gray-800 bg-gray-50 p-1.5 rounded border border-dashed border-gray-300 leading-tight line-clamp-2 mt-auto">
                      <span className="font-bold">{tr.notesLabel} </span> <TranslatedText text={note} lang={renderLang} />
                    </div>
                    <div className="text-[10px] text-gray-800 bg-white p-1.5 rounded border border-dashed border-gray-300 leading-tight min-h-[40px] mt-1">
                      <span className="font-bold">{tr.technicianNotesLabel} </span> 
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    );
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
          <div className="relative w-full h-[calc(100dvh-160px)] min-h-[420px] max-h-[950px] flex justify-center items-center overflow-hidden py-4">
            {displayedDays.map((day, idx) => {
              const ds = dateStr(day);
              const groups = groupedByDay[ds] || [];
              const isToday = ds === dateStr(new Date());

              const isRight  = idx === 0;
              const isCenter = idx === 1;
              const isLeft   = idx === 2;

              const cardClass = "absolute inset-x-0 top-8 bottom-8 sm:top-10 sm:bottom-10 mx-auto transition-all duration-500 ease-[cubic-bezier(0.25,0.8,0.25,1)] flex flex-col rounded-[2rem] overflow-hidden border w-full max-w-[94%] sm:max-w-[90%] md:max-w-[750px] lg:max-w-[850px]";

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
                          onClick={(e) => handleOpenExport(e, false)}
                          className="bg-muted hover:bg-muted/80 text-foreground border border-input rounded-xl font-bold h-8 px-2 sm:px-2.5 shadow-lg flex items-center gap-1 text-xs"
                          title="تصدير"
                        >
                          <Printer className="w-3.5 h-3.5" /> <span className="hidden sm:inline">تصدير</span>
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) => handleOpenExport(e, true)}
                          className="bg-muted hover:bg-muted/80 text-foreground border border-input rounded-xl font-bold h-8 px-2 sm:px-2.5 shadow-lg flex items-center gap-1 text-xs"
                          title="تصدير بالصور"
                        >
                          <FileImage className="w-3.5 h-3.5" /> <span className="hidden sm:inline">تصدير بالصور</span>
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
                  <div className="overflow-y-auto flex-1 p-2 sm:p-3 no-scrollbar space-y-4">
                    {loading && appointments.length === 0 && isCenter ? (
                      <div className="flex justify-center py-20"><RefreshCw className="w-8 h-8 animate-spin text-slate-500" /></div>
                    ) : (
                      <>
                        {(() => {
                          const activeGroups = groups.filter(g => g.status !== 'completed');
                          const completedGroups = groups.filter(g => g.status === 'completed');

                          const sortedActive = [...activeGroups].sort((a, b) => {
                            const ta = (a.appointmentTime || '').split(' ')[1] || '00:00';
                            const tb = (b.appointmentTime || '').split(' ')[1] || '00:00';
                            return ta.localeCompare(tb);
                          });

                          const sortedCompleted = [...completedGroups].sort((a, b) => {
                            const ta = (a.appointmentTime || '').split(' ')[1] || '00:00';
                            const tb = (b.appointmentTime || '').split(' ')[1] || '00:00';
                            return ta.localeCompare(tb);
                          });

                          const renderCard = (group: any, key: any) => {
                            const note = group.notes || '';
                            const time = (group.appointmentTime || '').split(' ')[1] || '---';
                            const clientKey = group.unitId + '_' + (group.projectId || '');
                            const totalOpen = openTicketsMap[clientKey] || 0;
                            const isCompleted = group.status === 'completed';
                            const apptId = group.appointmentId || group.tickets?.find((t: any) => t.appointmentId)?.appointmentId;

                            return (
                              <div
                                key={key}
                                className={cn(
                                  "group relative overflow-hidden rounded-2xl border bg-card/90 backdrop-blur-sm transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer flex flex-col",
                                  isCenter ? "hover:border-primary/40 hover:-translate-y-0.5" : "border-border/60",
                                  isCompleted ? "opacity-75 bg-muted/40 border-dashed border-emerald-500/30" : "border-border"
                                )}
                                onClick={e => {
                                  if (isCenter) {
                                    e.stopPropagation();
                                    setClientTicketsModal({ unitId: group.unitId, project: group.projectId });
                                  }
                                }}
                              >
                                {/* Top Header: Villa, Project, Time */}
                                <div className="p-3 pb-2.5 flex items-start justify-between gap-2 border-b border-border/40 bg-muted/20">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className={cn(
                                      "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm font-black text-sm",
                                      isCompleted
                                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                                        : "bg-primary/10 text-primary border border-primary/20"
                                    )}>
                                      <Home className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-black text-base text-foreground tracking-tight">
                                          {t.villa} {group.villaNumber}
                                        </span>
                                        {totalOpen > 0 && (
                                          <span className="text-[10px] font-black bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded-md">
                                            {totalOpen} مفتوحة
                                          </span>
                                        )}
                                        {isCompleted && (
                                          <span className="text-[10px] font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" /> تم الانتهاء
                                          </span>
                                        )}
                                      </div>
                                      {group.clientName && (
                                        <div className="text-xs font-semibold text-muted-foreground truncate mt-0.5">
                                          {group.clientName}
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Time Badge & Project Name */}
                                  <div className="flex flex-col items-end shrink-0">
                                    <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl font-mono font-black text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 shadow-inner">
                                      <Clock className="w-3.5 h-3.5" />
                                      <span>{time}</span>
                                    </div>
                                    {(() => {
                                      const pObj = projectsMap.get(group.projectId);
                                      const pName = pObj?.name || pObj?.code;
                                      if (!pName) return null;
                                      return (
                                        <span className="text-[10px] font-bold text-muted-foreground/80 truncate max-w-[110px] mt-1 text-left" dir="ltr">
                                          {pName}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </div>

                                {/* Body: Specialties, Notes, Supervisors & Technician */}
                                <div className="p-3 py-2.5 flex flex-col gap-2 text-xs">
                                  {/* Specialties */}
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {Array.from(group.types).map(tName => (
                                      <span key={tName as string} className="text-[11px] font-bold px-2 py-0.5 rounded-lg border bg-muted/60 text-foreground border-border/80 shadow-xs">
                                        <TranslatedText text={mergedTypes[tName as string] || tName as string} lang={lang} />
                                      </span>
                                    ))}
                                    <button
                                      onClick={(e) => handleOpenAddSpecialty(group, e)}
                                      className="text-[10px] font-bold px-2 py-0.5 rounded-lg border border-dashed border-input text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted transition-all flex items-center gap-1"
                                    >
                                      <Plus className="w-2.5 h-2.5" />
                                      {t.addSpecialty}
                                    </button>
                                  </div>

                                  {/* Notes */}
                                  {note && (
                                    <div className="text-[11px] text-muted-foreground bg-muted/40 p-2 rounded-xl border border-input/60 flex items-start gap-1.5 leading-relaxed">
                                      <span className="font-bold shrink-0 text-foreground/80">{t.noteLabel}</span>
                                      <span className="line-clamp-2"><TranslatedText text={note} lang={lang} /></span>
                                    </div>
                                  )}

                                  {/* Supervisor & Technician Badges */}
                                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 text-[11px]">
                                    {/* Supervisor */}
                                    <div className="flex items-center gap-1 min-w-0">
                                      <span className="text-[10px] font-bold text-muted-foreground shrink-0">المشرف:</span>
                                      {group.sups && group.sups.size > 0 ? (
                                        Array.from(group.sups).map(sId => {
                                          const sup = supervisors.find(s => s.uid === sId || s.id === sId);
                                          return (
                                            <span key={sId as string} className="font-bold px-1.5 py-0.5 rounded-md border bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 truncate max-w-[110px]">
                                              {sup ? (sup.displayName || sup.name) : 'مشرف'}
                                            </span>
                                          );
                                        })
                                      ) : (
                                        <span className="text-muted-foreground text-[10px]">غير محدد</span>
                                      )}
                                    </div>

                                    {/* Technician Badge */}
                                    <div className="flex items-center gap-1 shrink-0">
                                      <span className="text-[10px] font-bold text-muted-foreground shrink-0">الفني:</span>
                                      {(() => {
                                        const techId = group.technicianId || (group.technicianIds && group.technicianIds[0]);
                                        const tech = group.technician || technicians.find(t => t.id === techId);
                                        if (tech) {
                                          return (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setAssignTechModal({
                                                  isOpen: true,
                                                  appointmentId: apptId,
                                                  currentTechId: tech.id,
                                                  projectId: group.projectId,
                                                  villaNumber: group.villaNumber
                                                });
                                              }}
                                              className="font-bold px-2 py-0.5 rounded-md border bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/25 flex items-center gap-1 transition-colors"
                                              title="تغيير الفني"
                                            >
                                              <Wrench className="w-2.5 h-2.5" />
                                              <span className="truncate max-w-[100px]">{tech.name}</span>
                                            </button>
                                          );
                                        }
                                        return (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setAssignTechModal({
                                                isOpen: true,
                                                appointmentId: apptId,
                                                currentTechId: null,
                                                projectId: group.projectId,
                                                villaNumber: group.villaNumber
                                              });
                                            }}
                                            className="text-[10px] font-bold px-2 py-0.5 rounded-md border border-dashed border-indigo-500/30 text-indigo-500 hover:bg-indigo-500/10 transition-colors flex items-center gap-1"
                                          >
                                            <Plus className="w-2.5 h-2.5" />
                                            تعيين فني
                                          </button>
                                        );
                                      })()}
                                    </div>
                                  </div>

                                  {/* Attachments */}
                                  {(() => {
                                    const urls = group.tickets.flatMap((t: any) => (t.description || '').match(/(https?:\/\/[^\s]+)/g) || []);
                                    if (urls.length === 0) return null;
                                    return (
                                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
                                        <span className="text-[10px] font-bold text-muted-foreground shrink-0"><FileImage className="w-3 h-3 inline mr-1"/>{t.attachLabel}</span>
                                        {urls.map((url: string, idx: number) => (
                                          <img
                                            key={idx}
                                            src={url}
                                            alt="مرفق"
                                            className="w-12 h-12 rounded-lg object-cover border border-border cursor-pointer hover:opacity-80 transition-opacity shadow-xs"
                                            onClick={(e) => { e.stopPropagation(); window.open(url, '_blank'); }}
                                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                          />
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>

                                {/* Footer / Actions Toolbar */}
                                {isCenter && (
                                  <div className="p-2 pt-2 border-t border-border/40 bg-muted/15 flex items-center justify-between gap-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
                                    {/* Communication Buttons */}
                                    <div className="flex items-center gap-1.5">
                                      {group.clientPhone && (
                                        <>
                                          <a
                                            href={`https://wa.me/${group.clientPhone.replace(/\D/g, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="h-8 px-2.5 rounded-xl font-bold text-xs bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] flex items-center gap-1 transition-all"
                                            title="واتساب"
                                          >
                                            <MessageCircle className="w-3.5 h-3.5" />
                                            <span className="hidden xs:inline text-[11px]">واتساب</span>
                                          </a>
                                          <a
                                            href={`tel:${group.clientPhone}`}
                                            className="h-8 px-2 rounded-xl font-bold text-xs bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-500 flex items-center justify-center transition-all"
                                            title="اتصال"
                                          >
                                            <Phone className="w-3.5 h-3.5" />
                                          </a>
                                        </>
                                      )}

                                      <button
                                        onClick={() => {
                                          setAssignTechModal({
                                            isOpen: true,
                                            appointmentId: apptId,
                                            currentTechId: group.technicianId || (group.technicianIds && group.technicianIds[0]) || null,
                                            projectId: group.projectId,
                                            villaNumber: group.villaNumber
                                          });
                                        }}
                                        className="h-8 px-2.5 rounded-xl font-bold text-xs bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 text-indigo-600 dark:text-indigo-400 flex items-center gap-1 transition-all"
                                        title="تعيين أو تغيير الفني"
                                      >
                                        <Wrench className="w-3.5 h-3.5" />
                                        <span className="text-[11px]">الفني</span>
                                      </button>
                                    </div>

                                    {/* Control Buttons */}
                                    <div className="flex items-center gap-1.5 mr-auto">
                                      <button
                                        onClick={() => setEditApptGroup(group)}
                                        className="h-8 px-2.5 rounded-xl font-bold text-xs bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-600 dark:text-amber-400 flex items-center gap-1 transition-all"
                                        title="تعديل وتأجيل الموعد"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                        <span className="text-[11px]">تعديل</span>
                                      </button>

                                      {!isCompleted ? (
                                        <button
                                          onClick={async () => {
                                            if (!apptId) {
                                              toast.error('معرف الموعد غير متوفر');
                                              return;
                                            }
                                            if (!window.confirm('هل أنت متأكد من إنهاء الموعد؟')) return;
                                            try {
                                              const [dPart, tPart] = (group.appointmentTime || '').split(' ');
                                              await appointmentsApi.update(apptId, {
                                                date: dPart,
                                                time: tPart || '',
                                                notes: group.notes,
                                                supervisorIds: Array.from(group.sups),
                                                supervisors: group.supervisors,
                                                technicianId: group.technicianId || null,
                                                technicianIds: group.technicianIds || [],
                                                types: Array.from(group.types),
                                                clientPhone: group.clientPhone,
                                                status: 'completed'
                                              });
                                              toast.success('تم إنهاء الموعد بنجاح');
                                              loadAppointments();
                                            } catch {
                                              toast.error('حدث خطأ أثناء إنهاء الموعد');
                                            }
                                          }}
                                          className="h-8 px-2.5 rounded-xl font-bold text-xs bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/25 text-blue-600 dark:text-blue-400 flex items-center gap-1 transition-all"
                                          title="إنهاء الموعد"
                                        >
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          <span className="text-[11px]">إنهاء</span>
                                        </button>
                                      ) : (
                                        <button
                                          onClick={async () => {
                                            if (!apptId) {
                                              toast.error('معرف الموعد غير متوفر');
                                              return;
                                            }
                                            if (!window.confirm('هل تريد إعادة تنشيط الموعد؟')) return;
                                            try {
                                              const [dPart, tPart] = (group.appointmentTime || '').split(' ');
                                              await appointmentsApi.update(apptId, {
                                                date: dPart,
                                                time: tPart || '',
                                                notes: group.notes,
                                                supervisorIds: Array.from(group.sups),
                                                supervisors: group.supervisors,
                                                technicianId: group.technicianId || null,
                                                technicianIds: group.technicianIds || [],
                                                types: Array.from(group.types),
                                                clientPhone: group.clientPhone,
                                                status: 'scheduled'
                                              });
                                              toast.success('تمت إعادة تنشيط الموعد');
                                              loadAppointments();
                                            } catch {
                                              toast.error('حدث خطأ أثناء إعادة تنشيط الموعد');
                                            }
                                          }}
                                          className="h-8 px-2.5 rounded-xl font-bold text-xs bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 flex items-center gap-1 transition-all"
                                          title="إعادة تنشيط الموعد"
                                        >
                                          <RotateCcw className="w-3.5 h-3.5" />
                                          <span className="text-[11px]">تنشيط</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          };

                          return (
                            <>
                              {sortedActive.length > 0 && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 h-max pb-2">
                                  {sortedActive.map((group, idx) => renderCard(group, `active-${idx}`))}
                                </div>
                              )}

                              {sortedCompleted.length > 0 && (
                                <div className="pt-3 border-t border-border/80">
                                  <div className="flex items-center gap-2 mb-2.5 px-1">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    <span className="text-xs font-black text-muted-foreground">
                                      المواعيد المنتهية ({sortedCompleted.length})
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 h-max pb-2">
                                    {sortedCompleted.map((group, idx) => renderCard(group, `completed-${idx}`))}
                                  </div>
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </>
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
      <div className="hidden print:block print:w-full print:bg-white print:text-black print:p-0">
        {renderPrintLayout(lang, false)}
      </div>

      {/* --- Export Layouts (Hidden) --- */}
      {isExporting && (
        <>
          {['ar', 'ur', 'hi'].filter(l => exportLangs[l]).map((exportLang: any) => (
            <div key={exportLang} className="fixed top-0 left-[-20000px] w-[800px] pointer-events-none opacity-0 z-[-1]">
              {renderPrintLayout(exportLang, exportWithImagesMode, 'export-layout')}
            </div>
          ))}
        </>
      )}

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
        <UnifiedAppointmentDialog
          open={!!directApptDate}
          onOpenChange={(v) => !v && setDirectApptDate(null)}
          dateStr={directApptDate}
          initialProjectId={filterProject || undefined}
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
          onSuccess={loadAppointments}
        />
      )}
      {editApptGroup && (
        <UnifiedAppointmentDialog
          open={!!editApptGroup}
          onOpenChange={(op) => !op && setEditApptGroup(null)}
          editGroup={editApptGroup}
          editSupervisors={supervisors}
          onSuccess={() => { setEditApptGroup(null); loadAppointments(); }}
        />
      )}

      {/* Assign Technician Modal */}
      {assignTechModal && (
        <Dialog open={assignTechModal.isOpen} onOpenChange={(open) => !open && setAssignTechModal(null)}>
          <DialogContent className="max-w-md w-[95vw] rounded-2xl p-5" dir="rtl">
            <DialogHeader className="pb-3 border-b border-border">
              <DialogTitle className="flex items-center gap-2 text-base font-black">
                <Wrench className="w-5 h-5 text-indigo-500" />
                تعيين فني للفيلا {assignTechModal.villaNumber || ''}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-3">
              <p className="text-xs text-muted-foreground">
                اختر الفني المسؤول عن تنفيذ موعد هذه الفيلا. سيتمكن الفني من رؤية تفاصيل الموعد وبدء العمل من تطبيقه:
              </p>

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => handleAssignTechnician(assignTechModal.appointmentId, null)}
                  className={cn(
                    "w-full text-right p-3 rounded-xl border transition-all text-xs flex items-center justify-between",
                    !assignTechModal.currentTechId
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs"
                      : "border-border hover:bg-muted/60 text-muted-foreground"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full border border-current" />
                    بدون فني محدد (عام للمشرف)
                  </span>
                  {!assignTechModal.currentTechId && <CheckCircle2 className="w-4 h-4 text-primary" />}
                </button>

                {technicians
                  .filter(tech => !assignTechModal.projectId || !tech.projectId || tech.projectId === assignTechModal.projectId)
                  .map((tech) => {
                    const isSelected = assignTechModal.currentTechId === tech.id;
                    return (
                      <button
                        key={tech.id}
                        type="button"
                        onClick={() => handleAssignTechnician(assignTechModal.appointmentId, tech.id)}
                        className={cn(
                          "w-full text-right p-3 rounded-xl border transition-all text-xs flex items-center justify-between",
                          isSelected
                            ? "border-indigo-500 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-bold shadow-xs"
                            : "border-border hover:bg-muted/60 text-foreground"
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0",
                            isSelected ? "bg-indigo-500 text-white" : "bg-muted text-muted-foreground"
                          )}>
                            {tech.name.slice(0, 1)}
                          </div>
                          <div>
                            <div className="font-bold text-sm text-foreground">{tech.name}</div>
                            <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                              {tech.specialty && <span>{tech.specialty}</span>}
                              {tech.phoneNumber && <span dir="ltr">{tech.phoneNumber}</span>}
                            </div>
                          </div>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                      </button>
                    );
                  })}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button variant="outline" size="sm" onClick={() => setAssignTechModal(null)}>
                  إغلاق
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Export Dialog */}
      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تصدير المواعيد كـ PDF</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <p className="text-sm text-muted-foreground">اختر اللغات التي تريد تصدير ملفات PDF منفصلة لها:</p>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={exportLangs.ar}
                  onChange={(e) => setExportLangs(prev => ({ ...prev, ar: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                العربية
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={exportLangs.ur}
                  onChange={(e) => setExportLangs(prev => ({ ...prev, ur: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                الأوردو
              </label>
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={exportLangs.hi}
                  onChange={(e) => setExportLangs(prev => ({ ...prev, hi: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                الهندية
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setExportModalOpen(false)}>إلغاء</Button>
              <Button 
                onClick={executeExport} 
                disabled={isExporting || (!exportLangs.ar && !exportLangs.ur && !exportLangs.hi)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isExporting ? <RefreshCw className="w-4 h-4 animate-spin ml-2" /> : null}
                تصدير الملفات
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}