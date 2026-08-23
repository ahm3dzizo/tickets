import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { techniciansApi, attendanceApi } from '@/lib/api';
import {
  HardHat, Phone, Search, MoreHorizontal, Clock,
  Activity, CheckCircle2, Coffee, AlertTriangle,
  Navigation, Wrench, RefreshCw, MessageSquare,
  FileSpreadsheet, UserX, Trash2, Plus,
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
import { useSearchParams } from 'react-router-dom';

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
  const [showDisabled, setShowDisabled] = useState(false);

  // Lifted edit dialog state — avoids event conflicts inside dropdowns
  const [editTech, setEditTech] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadTechs = () => {
    setLoading(true);
    techniciansApi.getAll({ includeDisabled: showDisabled })
      .then((list: any[]) => setTechnicians(list.sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => toast.error('فشل تحميل الفنيين'))
      .finally(() => setLoading(false));
  };

  const loadLiveAttendance = async () => {
    setLiveLoading(true);
    try {
      const data = await attendanceApi.getLive();
      setLiveAttendance(data || []);
    } catch {
      toast.error('فشل تحميل بيانات الحضور المباشر');
    } finally {
      setLiveLoading(false);
    }
  };

  useEffect(() => {
    loadTechs();
    loadLiveAttendance();
  }, [showDisabled]);

  const filtered = technicians.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.specialty?.toLowerCase().includes(search.toLowerCase())
  );

  const handleWhatsApp = (phone: string, name: string) => {
    if (!phone) return;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(`مرحباً ${name}، كيف تسير أعمال الصيانة اليوم؟`)}`, '_blank');
  };

  const handleToggleActive = async (t: any) => {
    try {
      if (t.isActive) {
        await techniciansApi.disable(t.id);
        toast.success('تم تعطيل الفني');
      } else {
        await techniciansApi.enable(t.id);
        toast.success('تم تفعيل الفني');
      }
      loadTechs();
    } catch { toast.error('فشل تحديث حالة الفني'); }
  };

  const handleDelete = async (t: any) => {
    if (deleteConfirm !== t.id) { setDeleteConfirm(t.id); return; }
    try {
      await techniciansApi.delete(t.id);
      toast.success('تم حذف الفني');
      setDeleteConfirm(null);
      loadTechs();
    } catch { toast.error('فشل حذف الفني'); }
  };

  const activeCount    = liveAttendance.filter(s => s.shiftStatus === 'ACTIVE').length;
  const onBreakCount   = liveAttendance.filter(s => s.shiftStatus === 'ON_BREAK').length;
  const onTicketCount  = liveAttendance.filter(s => s.currentSession && ['IN_PROGRESS', 'EN_ROUTE'].includes(s.currentSession.status)).length;

  return (
    <Layout>
      <div className="space-y-6 page-in" dir="rtl">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="text-right">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">إدارة الفنيين والحضور</h1>
            <p className="text-muted-foreground mt-1 text-sm">متابعة دوام الفنيين، البصمة الحية، والتكليفات الميدانية</p>
          </div>

          {/* Stats pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-bold px-3 py-1.5 rounded-full">
              <HardHat className="w-3.5 h-3.5" />
              <span>{technicians.filter(t => t.isActive !== false).length} فني نشط</span>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-bold px-3 py-1.5 rounded-full">
              <Activity className="w-3.5 h-3.5" />
              <span>{activeCount} حاضر اليوم</span>
            </div>
            {isAdminOrSupervisor && (
              <div className="hidden sm:flex">
                <TechnicianForm
                  onSaved={loadTechs}
                  trigger={
                    <Button size="sm" className="gap-2 rounded-xl">
                      <Plus className="w-4 h-4" />
                      إضافة فني
                    </Button>
                  }
                />
              </div>
            )}
          </div>
        </div>

        {/* Mobile add button */}
        {isAdminOrSupervisor && (
          <div className="sm:hidden">
            <TechnicianForm onSaved={loadTechs} />
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center p-1 bg-muted/60 backdrop-blur rounded-2xl border border-border shrink-0 overflow-x-auto">
            {[
              { id: 'directory', label: `طاقم الفنيين (${technicians.filter(t => t.isActive !== false).length})`, icon: null },
              { id: 'live', label: `الحضور المباشر (${activeCount})`, icon: <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />, active: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
              { id: 'reports', label: 'تقارير الحضور', icon: <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />, active: 'bg-primary/10 text-primary border border-primary/20' },
            ].map(tab => (
              <button key={tab.id}
                onClick={() => { setActiveTab(tab.id as any); setSearchParams({ tab: tab.id }); if (tab.id === 'live') loadLiveAttendance(); }}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-2 whitespace-nowrap shrink-0",
                  activeTab === tab.id
                    ? (tab.active || "bg-card text-foreground shadow-sm")
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'live' && (
            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              {[
                { icon: <Activity className="w-4 h-4 text-emerald-400" />, label: 'على رأس العمل:', value: activeCount, color: 'text-emerald-400', border: 'border-emerald-500/20' },
                { icon: <Coffee className="w-4 h-4 text-amber-400" />, label: 'في استراحة:', value: onBreakCount, color: 'text-amber-400', border: 'border-amber-500/20' },
                { icon: <Wrench className="w-4 h-4 text-blue-400" />, label: 'على تذاكر:', value: onTicketCount, color: 'text-blue-400', border: 'border-blue-500/20' },
              ].map((k, i) => (
                <div key={i} className={cn('bg-card border rounded-2xl px-4 py-2 flex items-center gap-2 shrink-0', k.border)}>
                  {k.icon}
                  <span className="text-xs text-muted-foreground">{k.label}</span>
                  <span className={cn('text-xs font-bold', k.color)}>{k.value}</span>
                </div>
              ))}
              <Button variant="outline" size="icon" onClick={loadLiveAttendance} className="rounded-xl border-border h-9 w-9 text-muted-foreground hover:text-foreground shrink-0">
                <RefreshCw className={cn("w-4 h-4", liveLoading && "animate-spin")} />
              </Button>
            </div>
          )}
        </div>

        {/* ── DIRECTORY ── */}
        {activeTab === 'directory' && (
          <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
            {/* Search + filters */}
            <div className="p-4 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <span className="text-muted-foreground text-xs font-bold uppercase tracking-widest shrink-0">{filtered.length} فني</span>
                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                  <div
                    onClick={() => setShowDisabled(v => !v)}
                    className={cn('w-9 h-5 rounded-full border transition-colors cursor-pointer flex items-center px-0.5',
                      showDisabled ? 'bg-amber-500/20 border-amber-500/30' : 'bg-muted border-border'
                    )}
                  >
                    <div className={cn('w-4 h-4 rounded-full transition-transform', showDisabled ? 'bg-amber-400 translate-x-4' : 'bg-muted-foreground translate-x-0')} />
                  </div>
                  <span className="text-xs text-muted-foreground">إظهار المعطّلين</span>
                </label>
              </div>
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

            <div className="p-4">
              {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="border border-border rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-3"><div className="space-y-1"><div className="h-4 shimmer rounded w-20" /><div className="h-3 shimmer rounded w-14" /></div><div className="w-10 h-10 shimmer rounded-full shrink-0 mr-auto" /></div>
                      <div className="h-5 shimmer rounded-full w-16" />
                      <div className="h-4 shimmer rounded w-24" />
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                    <HardHat className="w-8 h-8" />
                  </div>
                  <p className="font-bold text-foreground">لا يوجد فنيين{search ? ' مطابقين' : ''}</p>
                  <p className="text-sm mt-1">
                    {!showDisabled && !search ? 'جميع الفنيين معطّلون — شغّل "إظهار المعطّلين" للعرض' : ''}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filtered.map(t => (
                    <div
                      key={t.id}
                      className={cn(
                        "border rounded-2xl p-4 transition-all duration-300 group flex flex-col justify-between",
                        t.isActive === false
                          ? 'border-border/50 opacity-60 bg-muted/20'
                          : 'border-border hover:border-primary/30 hover:shadow-md'
                      )}
                    >
                      <div>
                        {/* Top row: avatar + name + menu */}
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            'w-10 h-10 rounded-2xl flex items-center justify-center border shrink-0',
                            t.isActive === false
                              ? 'bg-muted/50 border-border text-muted-foreground'
                              : 'bg-amber-500/10 border-amber-500/20 text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-all duration-300'
                          )}>
                            <HardHat className="w-5 h-5" />
                          </div>

                          <div className="flex-1 min-w-0 text-right">
                            <div className="font-semibold text-foreground text-sm truncate">{t.name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {t.employeeId ? `كود: ${t.employeeId}` : `#${t.id.slice(0, 6)}`}
                            </div>
                          </div>

                          {/* Actions menu — state is lifted so no dialog-inside-dropdown conflict */}
                          {isAdminOrSupervisor && (
                            <DropdownMenu>
                              <DropdownMenuTrigger render={
                                <button className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg transition-colors shrink-0">
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              } />
                              <DropdownMenuContent align="start" className="bg-card border-border w-44 rounded-2xl">
                                <DropdownMenuItem
                                  className="hover:bg-muted cursor-pointer text-start justify-start rounded-xl mx-1 my-0.5"
                                  onClick={() => setEditTech(t)}
                                >
                                  تعديل البيانات
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className={cn(
                                    'hover:bg-muted cursor-pointer text-start justify-start rounded-xl mx-1 my-0.5',
                                    t.isActive === false ? 'text-emerald-500' : 'text-amber-500'
                                  )}
                                  onClick={() => handleToggleActive(t)}
                                >
                                  {t.isActive === false ? 'تفعيل الفني' : 'تعطيل الفني'}
                                </DropdownMenuItem>
                                {user?.role === 'admin' && (
                                  <DropdownMenuItem
                                    className={cn(
                                      'hover:bg-red-500/10 cursor-pointer text-start justify-start rounded-xl mx-1 my-0.5',
                                      deleteConfirm === t.id ? 'text-red-500 font-bold' : 'text-muted-foreground'
                                    )}
                                    onClick={() => handleDelete(t)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5 ml-2 shrink-0" />
                                    {deleteConfirm === t.id ? 'تأكيد الحذف' : 'حذف الفني'}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>

                        <div className="mt-3 space-y-2">
                          {/* Status badge */}
                          {t.isActive === false && (
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full w-fit">
                              <UserX className="w-3 h-3" />
                              <span>معطّل</span>
                            </div>
                          )}

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

        {/* ── LIVE ATTENDANCE ── */}
        {activeTab === 'live' && (
          <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-bold text-foreground text-sm">البصمة وسجل النشاط الميداني الحي</h3>
                <p className="text-xs text-muted-foreground mt-0.5">تحديث فوري بحالة دوام وتواجد الفنيين</p>
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
                  <p className="text-xs mt-1">تأكد من فتح تطبيق الفنيين من خلال الرابط /tech لتسجيل البصمة</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {liveAttendance.map((tech, idx) => {
                    const session = tech.currentSession;
                    return (
                      <div key={idx} className="bg-card/50 border border-border rounded-2xl p-4 flex flex-col justify-between hover:border-emerald-500/30 transition-all space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                              <HardHat className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="font-bold text-foreground text-sm">{tech.name || 'فني'}</div>
                              <div className="text-[10px] text-muted-foreground">{specialtyLabels[tech.specialty] || tech.specialty || 'فني صيانة'}</div>
                            </div>
                          </div>
                          <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1",
                            tech.shiftStatus === 'ACTIVE'
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          )}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", tech.shiftStatus === 'ACTIVE' ? "bg-emerald-400" : "bg-amber-400")} />
                            {tech.shiftStatus === 'ACTIVE' ? 'دوام نشط' : 'استراحة'}
                          </span>
                        </div>
                        <div className="p-3 bg-muted/40 rounded-xl border border-border space-y-1.5">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">النشاط الحالي</div>
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
                        <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                          <div className="text-muted-foreground">
                            إجمالي العمل: <span className="font-bold text-foreground font-mono">{Math.floor((tech.totalWorkMinutes || 0) / 60)} س {(tech.totalWorkMinutes || 0) % 60} د</span>
                          </div>
                          <button onClick={() => handleWhatsApp(tech.phoneNumber, tech.name)} className="text-emerald-400 hover:text-emerald-300 font-bold text-[11px] flex items-center gap-1">
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

        {/* ── REPORTS ── */}
        {activeTab === 'reports' && <AttendanceReportView />}

      </div>

      {/* Edit dialog lifted outside dropdown — no event conflicts */}
      {editTech && (
        <TechnicianForm
          key={editTech.id}
          technician={editTech}
          open={!!editTech}
          onOpenChange={open => { if (!open) setEditTech(null); }}
          onSaved={() => { setEditTech(null); loadTechs(); }}
        />
      )}
    </Layout>
  );
}
