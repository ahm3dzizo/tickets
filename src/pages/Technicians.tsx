import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { techniciansApi } from '@/lib/api';
import { 
  HardHat, Phone, Search, MoreHorizontal, Clock, 
  Activity, CheckCircle2, Coffee, AlertTriangle, 
  Navigation, Wrench, RefreshCw, MessageSquare,
  FileSpreadsheet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TechnicianForm } from '@/components/technicians/TechnicianForm';
import { AttendanceReportView } from '@/components/attendance/AttendanceReportView';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const specialtyLabels: Record<string, string> = { 
  mechanics: 'ميكانيكا / سباكة', 
  electricity: 'كهرباء', 
  HVAC: 'تكييف',
  carpentry: 'نجارة',
  general: 'عام' 
};

const specialtyColors: Record<string, string> = {
  mechanics:   'bg-amber-500/10 text-amber-500 border-amber-500/20',
  electricity: 'bg-primary/10 text-primary border-primary/20',
  HVAC:        'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  carpentry:   'bg-orange-500/10 text-orange-400 border-orange-500/20',
  general:     'bg-muted text-muted-foreground border-border',
};

import { useSearchParams } from 'react-router-dom';

export default function Technicians() {
  const { user } = useAuth();
  const isAdminOrSupervisor = user?.role === 'admin' || user?.role === 'supervisor';
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab = tabParam === 'reports' ? 'reports' : (tabParam === 'live' ? 'live' : 'directory');
  const [activeTab, setActiveTab] = useState<'directory' | 'live' | 'reports'>(initialTab);
  
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [liveAttendance, setLiveAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveLoading, setLiveLoading] = useState(false);
  const [search, setSearch] = useState('');

  const loadTechs = () => {
    setLoading(true);
    techniciansApi.getAll()
      .then((list: any[]) => setTechnicians(list.sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => toast.error('فشل تحميل الفنيين'))
      .finally(() => setLoading(false));
  };

  const loadLiveAttendance = async () => {
    setLiveLoading(true);
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/api/attendance/live', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLiveAttendance(data);
      }
    } catch {
      toast.error('فشل تحميل بيانات الحضور المباشر');
    } finally {
      setLiveLoading(false);
    }
  };

  useEffect(() => { 
    loadTechs(); 
    loadLiveAttendance();
  }, []);

  const filtered = technicians.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.specialty?.toLowerCase().includes(search.toLowerCase())
  );

  const handleWhatsApp = (phone: string, name: string) => {
    if (!phone) return;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(`مرحباً ${name}، كيف تسير أعمال الصيانة اليوم؟`)}`;
    window.open(url, '_blank');
  };

  // KPIs
  const activeCount = liveAttendance.filter(s => s.shiftStatus === 'ACTIVE').length;
  const onBreakCount = liveAttendance.filter(s => s.shiftStatus === 'ON_BREAK').length;
  const onTicketCount = liveAttendance.filter(s => s.currentSession && ['IN_PROGRESS', 'EN_ROUTE'].includes(s.currentSession.status)).length;

  return (
    <Layout>
      <div className="space-y-6 page-in" dir="rtl">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-right">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">إدارة الفنيين والحضور</h1>
            <p className="text-muted-foreground mt-1 text-sm">متابعة دوام الفنيين، البصمة الحية، والتكليفات الميدانية</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdminOrSupervisor && <TechnicianForm onSaved={loadTechs} />}
          </div>
        </div>

        {/* Tabs & Live KPIs */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center p-1 bg-muted/60 backdrop-blur rounded-2xl border border-border shrink-0 w-fit">
            <button
              onClick={() => {
                setActiveTab('directory');
                setSearchParams({ tab: 'directory' });
              }}
              className={cn(
                "px-5 py-2 rounded-xl text-xs font-bold transition-all duration-200",
                activeTab === 'directory' 
                  ? "bg-card text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              طاقم الفنيين ({technicians.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('live');
                setSearchParams({ tab: 'live' });
                loadLiveAttendance();
              }}
              className={cn(
                "px-5 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2",
                activeTab === 'live' 
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              الحضور المباشر اليوم ({activeCount})
            </button>
            <button
              onClick={() => {
                setActiveTab('reports');
                setSearchParams({ tab: 'reports' });
              }}
              className={cn(
                "px-5 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2",
                activeTab === 'reports' 
                  ? "bg-primary/10 text-primary border border-primary/20 shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>تقارير وسجلات الحضور</span>
            </button>
          </div>

          {/* Quick KPIs when on live tab */}
          {activeTab === 'live' && (
            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              <div className="bg-card border border-emerald-500/20 rounded-2xl px-4 py-2 flex items-center gap-2 shrink-0">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-muted-foreground">على رأس العمل:</span>
                <span className="text-xs font-bold text-emerald-400">{activeCount}</span>
              </div>
              <div className="bg-card border border-amber-500/20 rounded-2xl px-4 py-2 flex items-center gap-2 shrink-0">
                <Coffee className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-muted-foreground">في استراحة:</span>
                <span className="text-xs font-bold text-amber-400">{onBreakCount}</span>
              </div>
              <div className="bg-card border border-blue-500/20 rounded-2xl px-4 py-2 flex items-center gap-2 shrink-0">
                <Wrench className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-muted-foreground">على تذاكر حالياً:</span>
                <span className="text-xs font-bold text-blue-400">{onTicketCount}</span>
              </div>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={loadLiveAttendance} 
                className="rounded-xl border-border h-9 w-9 text-muted-foreground hover:text-foreground shrink-0"
              >
                <RefreshCw className={cn("w-4 h-4", liveLoading && "animate-spin")} />
              </Button>
            </div>
          )}
        </div>

        {/* ================= VIEW 1: DIRECTORY ================= */}
        {activeTab === 'directory' && (
          <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
            {/* Search */}
            <div className="p-4 border-b border-border flex items-center justify-between gap-3">
              <span className="text-muted-foreground text-xs font-bold uppercase tracking-widest shrink-0">{filtered.length} فني</span>
              <div className="relative w-full sm:w-80">
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="البحث عن فني أو تخصص..."
                  className="bg-muted/50 border-transparent focus:border-primary/30 pr-10 text-right rounded-xl h-10 text-sm"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Grid of technician cards */}
            <div className="p-4">
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="border border-border rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-3 justify-start">
                        <div className="space-y-1 text-right"><div className="h-4 shimmer rounded w-20" /><div className="h-3 shimmer rounded w-14" /></div>
                        <div className="w-10 h-10 shimmer rounded-full shrink-0" />
                      </div>
                      <div className="h-5 shimmer rounded-full w-16 ml-auto" />
                      <div className="h-4 shimmer rounded w-24 ml-auto" />
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                    <HardHat className="w-7 h-7" />
                  </div>
                  <p className="font-semibold">لا يوجد فنيين{search ? ' مطابقين' : ''}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filtered.map(t => (
                    <div
                      key={t.id}
                      className="border border-border rounded-2xl p-4 hover:border-primary/30 hover:shadow-md transition-all duration-300 group flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg shrink-0 -mt-1 -ml-1 transition-colors">
                              <MoreHorizontal className="w-4 h-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="bg-card border-border w-44 rounded-2xl">
                              <div onClick={e => e.stopPropagation()}>
                                <TechnicianForm
                                  technician={t}
                                  onSaved={loadTechs}
                                  trigger={
                                    <DropdownMenuItem className="hover:bg-muted cursor-pointer text-start justify-start rounded-xl mx-1 my-0.5" onSelect={e => e.preventDefault()}>
                                      تعديل البيانات
                                    </DropdownMenuItem>
                                  }
                                />
                              </div>
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <div className="flex items-center gap-3 flex-1 justify-start">
                            <div className="text-right min-w-0">
                              <div className="font-semibold text-foreground text-sm truncate">{t.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {t.employeeId ? `كود: ${t.employeeId}` : `#${t.id.slice(0, 6)}`}
                              </div>
                            </div>
                            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20 shrink-0 group-hover:bg-amber-500 group-hover:text-white transition-all duration-300">
                              <HardHat className="w-5 h-5" />
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          <span className={cn('inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold border', specialtyColors[t.specialty] ?? specialtyColors.general)}>
                            {specialtyLabels[t.specialty] ?? t.specialty ?? 'عام'}
                          </span>
                          {(t.phoneNumber || t.phone) && (
                            <div className="flex items-center gap-1.5 justify-start text-xs text-muted-foreground font-mono">
                              <span>{t.phoneNumber || t.phone}</span>
                              <Phone className="w-3 h-3 shrink-0" />
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Footer: WhatsApp contact */}
                      {(t.phoneNumber || t.phone) && (
                        <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                          <button
                            onClick={() => handleWhatsApp(t.phoneNumber || t.phone, t.name)}
                            className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>مراسلة واتساب</span>
                          </button>
                          <span className={cn(
                            "text-[9px] font-bold px-2 py-0.5 rounded-md",
                            t.profileCompleted 
                              ? "bg-emerald-500/10 text-emerald-400" 
                              : "bg-amber-500/10 text-amber-400"
                          )}>
                            {t.profileCompleted ? 'مكتمل' : 'غير مكتمل'}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= VIEW 2: LIVE ATTENDANCE ================= */}
        {activeTab === 'live' && (
          <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-bold text-foreground text-sm">البصمة وسجل النشاط الميداني الحي</h3>
                <p className="text-xs text-muted-foreground mt-0.5">تحديث فوري بحالة دوام وتواجد الفنيين بالمشاريع والتذاكر</p>
              </div>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                {liveAttendance.length} فني حاضر اليوم
              </span>
            </div>

            <div className="p-4">
              {liveLoading ? (
                <div className="py-12 text-center text-muted-foreground">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                  <p className="text-sm font-semibold">جارٍ تحديث بيانات الحضور المباشر...</p>
                </div>
              ) : liveAttendance.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                    <Clock className="w-7 h-7" />
                  </div>
                  <p className="font-semibold text-foreground">لم يقم أي فني بتسجيل حضور حتى الآن اليوم</p>
                  <p className="text-xs text-muted-foreground mt-1">تأكد من فتح تطبيق الفنيين من خلال الرابط /tech لتسجيل البصمة</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {liveAttendance.map((tech, idx) => {
                    const session = tech.currentSession;
                    return (
                      <div 
                        key={idx} 
                        className="bg-card/50 border border-border rounded-2xl p-4 flex flex-col justify-between hover:border-emerald-500/30 transition-all space-y-3"
                      >
                        {/* Top: Name & Shift Status */}
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                              <HardHat className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="font-bold text-foreground text-sm">{tech.name || 'فني'}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {specialtyLabels[tech.specialty] || tech.specialty || 'فني صيانة'}
                              </div>
                            </div>
                          </div>

                          <span className={cn(
                            "text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1",
                            tech.shiftStatus === 'ACTIVE' 
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          )}>
                            <span className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              tech.shiftStatus === 'ACTIVE' ? "bg-emerald-400" : "bg-amber-400"
                            )} />
                            {tech.shiftStatus === 'ACTIVE' ? 'دوام نشط' : 'استراحة'}
                          </span>
                        </div>

                        {/* Middle: Active Task / Session */}
                        <div className="p-3 bg-muted/40 rounded-xl border border-border space-y-1.5">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            النشاط الميداني الحالي
                          </div>
                          {session ? (
                            <div className="flex items-center gap-2">
                              {session.status === 'EN_ROUTE' && <Navigation className="w-4 h-4 text-blue-400 animate-bounce shrink-0" />}
                              {session.status === 'IN_PROGRESS' && <Wrench className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />}
                              {session.status === 'PAUSED' && <Clock className="w-4 h-4 text-amber-400 shrink-0" />}
                              <div className="text-xs font-semibold text-foreground truncate">
                                {session.status === 'EN_ROUTE' && `في الطريق للتذكرة #${session.ticketId?.slice(-4)}`}
                                {session.status === 'IN_PROGRESS' && `يعمل على التذكرة #${session.ticketId?.slice(-4)}`}
                                {session.status === 'PAUSED' && `متوقف مؤقتاً (${session.pauseReason || 'استراحة'})`}
                                {session.status === 'CLAIMED' && `مستلم للتذكرة #${session.ticketId?.slice(-4)}`}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
                              <span>متاح بمكتب المشروع (جاهز لتكليف جديد)</span>
                            </div>
                          )}
                        </div>

                        {/* Bottom: Hours & Action */}
                        <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                          <div className="text-muted-foreground">
                            إجمالي العمل: <span className="font-bold text-foreground font-mono">{Math.floor((tech.totalWorkMinutes || 0) / 60)} س {(tech.totalWorkMinutes || 0) % 60} د</span>
                          </div>
                          <button
                            onClick={() => handleWhatsApp(tech.phoneNumber, tech.name)}
                            className="text-emerald-400 hover:text-emerald-300 font-bold text-[11px] flex items-center gap-1"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>تواصل</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= VIEW 3: ATTENDANCE REPORTS & EXPORT ================= */}
        {activeTab === 'reports' && (
          <AttendanceReportView />
        )}

      </div>
    </Layout>
  );
}
