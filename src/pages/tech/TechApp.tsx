import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTechAuth } from '@/hooks/useTechAuth';
import { TechLang, t } from '@/i18n/tech';
import { techApi } from '@/lib/api';
import {
  Clock, Home, Ticket, List, LogOut, Coffee, MapPin, Search,
  Calendar, CheckCircle2, Phone, MessageCircle, ChevronDown, ChevronUp,
  AlertCircle, Play, Check, ShieldCheck, RefreshCw, User
} from 'lucide-react';
import { toast } from 'sonner';
import './tech.css';

type Tab = 'home' | 'appointments' | 'profile';

export default function TechApp() {
  const { token, techProfile, logout } = useTechAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [shift, setShift] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedApptId, setExpandedApptId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const lang = (techProfile?.lang || 'ar') as TechLang;
  const isRtl = lang === 'ar' || lang === 'ur';

  const fetchData = async () => {
    try {
      const [shiftData, apptsData] = await Promise.all([
        techApi.getTodayShift().catch(() => null),
        techApi.getAppointments().catch(() => [])
      ]);
      setShift(shiftData);
      setAppointments(apptsData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      navigate('/tech/login');
      return;
    }
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [token, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/tech/login');
  };

  const handleClockIn = async () => {
    setActionLoading(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      let accuracy: number | undefined;

      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          accuracy = pos.coords.accuracy;
        } catch {
          // location optional / fallback
        }
      }

      await techApi.clockIn({ lat, lng, accuracy, projectId: techProfile?.projectId });
      toast.success(t(lang, 'shiftActive'));
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || 'فشل تسجيل الحضور');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!window.confirm('هل أنت متأكد من تسجيل الانصراف؟')) return;
    setActionLoading(true);
    try {
      await techApi.clockOut();
      toast.success('تم تسجيل الانصراف بنجاح');
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || 'فشل تسجيل الانصراف');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleBreak = async () => {
    setActionLoading(true);
    try {
      if (shift?.status === 'ON_BREAK') {
        await techApi.endBreak();
        toast.success('تم إنهاء الاستراحة');
      } else {
        await techApi.startBreak('MEAL');
        toast.success('تم بدء الاستراحة');
      }
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || 'فشل تغيير حالة الاستراحة');
    } finally {
      setActionLoading(false);
    }
  };

  // Filter appointments by selected date
  const filteredAppointments = appointments.filter(a => !selectedDate || a.date === selectedDate);

  return (
    <div className="tech-app" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="tech-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-black text-sm border border-primary/20 shadow-xs">
            {techProfile?.name?.charAt(0) || '👷'}
          </div>
          <div>
            <div className="font-bold text-sm text-foreground">{techProfile?.name}</div>
            <div className="text-[11px] text-[var(--tech-text-muted)] flex items-center gap-1.5">
              <span>{techProfile?.specialty || 'فني صيانة'}</span>
              {techProfile?.supervisor?.name && (
                <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 py-0.2 rounded font-medium">
                  بإشراف: {techProfile.supervisor.name}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="p-2 text-muted-foreground hover:text-foreground bg-muted/50 rounded-xl border border-border/50 transition-colors"
            title="تحديث"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={handleLogout} className="p-2 text-rose-500 bg-rose-500/10 rounded-xl border border-rose-500/20" title="خروج">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="tech-container pb-24">
        {loading && appointments.length === 0 ? (
          <div className="flex justify-center p-12"><Clock className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-4">
            
            {/* Shift Status Card */}
            <div className="tech-card relative overflow-hidden border-border shadow-sm">
              {shift?.status === 'ACTIVE' || shift?.status === 'ON_BREAK' ? (
                <>
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${shift.status === 'ON_BREAK' ? 'bg-amber-500' : 'bg-emerald-500 pulse-anim'}`} />
                      <span className={`font-black text-sm ${shift.status === 'ON_BREAK' ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {shift.status === 'ON_BREAK' ? 'في استراحة' : t(lang, 'shiftActive')}
                      </span>
                    </div>
                    <div className="text-xs font-mono font-bold bg-muted px-2.5 py-1 rounded-lg border border-border">
                      منذ: {new Date(shift.clockInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={handleToggleBreak}
                      disabled={actionLoading}
                      className={`tech-btn flex-1 gap-1.5 text-xs py-2 ${shift.status === 'ON_BREAK' ? 'tech-btn-success' : 'tech-btn-warning'}`}
                    >
                      <Coffee className="w-4 h-4" />
                      {shift.status === 'ON_BREAK' ? 'إنهاء الاستراحة' : t(lang, 'startBreak')}
                    </button>
                    <button
                      onClick={handleClockOut}
                      disabled={actionLoading}
                      className="tech-btn tech-btn-outline flex-1 gap-1.5 text-xs py-2 border-rose-500/30 text-rose-500 hover:bg-rose-500/10"
                    >
                      <LogOut className="w-4 h-4" />
                      {t(lang, 'clockOut')}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-3">
                  <p className="text-xs text-[var(--tech-text-muted)] mb-3">{t(lang, 'noShift')}</p>
                  <button
                    onClick={handleClockIn}
                    disabled={actionLoading}
                    className="tech-btn tech-btn-success gap-2 text-sm w-full py-2.5 shadow-md"
                  >
                    <Clock className="w-4 h-4" />
                    {t(lang, 'clockIn')}
                  </button>
                </div>
              )}
            </div>

            {/* Date filter selector */}
            <div className="flex items-center justify-between gap-2 p-2 bg-muted/40 rounded-xl border border-border">
              <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                <Calendar className="w-4 h-4 text-primary" />
                <span>مواعيد:</span>
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-card text-foreground font-bold text-xs px-2.5 py-1 rounded-lg border border-border outline-none focus:border-primary"
              />
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate('')}
                  className="text-[10px] text-muted-foreground hover:text-foreground font-bold underline"
                >
                  الكل
                </button>
              )}
            </div>

            {/* Appointments List */}
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <h2 className="font-black text-sm text-foreground flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span>المواعيد المتاحة</span>
                  <span className="text-xs text-muted-foreground font-normal">({filteredAppointments.length})</span>
                </h2>
              </div>

              {filteredAppointments.length === 0 ? (
                <div className="text-center p-8 bg-card/60 rounded-2xl border border-dashed border-border text-muted-foreground text-xs">
                  لا توجد مواعيد مخصصة لك أو لمشرفك في هذا التاريخ
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAppointments.map((appt) => {
                    const isExpanded = expandedApptId === appt.id;
                    const tickets = appt.tickets || [];
                    const isCompleted = appt.status === 'completed';

                    return (
                      <div
                        key={appt.id}
                        className={`tech-card p-3.5 border transition-all ${
                          isCompleted ? 'opacity-70 bg-muted/30 border-emerald-500/30' : 'border-border bg-card'
                        }`}
                      >
                        {/* Header: Villa, Time, Date */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center font-black text-xs shrink-0">
                              <Home className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-black text-sm text-foreground flex items-center gap-1.5">
                                <span>فيلا {appt.villaNumber}</span>
                                {appt.projectName && (
                                  <span className="text-[10px] text-muted-foreground font-medium">({appt.projectName})</span>
                                )}
                              </div>
                              {appt.clientName && (
                                <div className="text-[11px] text-muted-foreground font-medium truncate max-w-[150px]">
                                  {appt.clientName}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <Clock className="w-3 h-3" />
                              {appt.time || '---'}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono mt-0.5">{appt.date}</span>
                          </div>
                        </div>

                        {/* Types / Specialties */}
                        {appt.types && appt.types.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {appt.types.map((type: string) => (
                              <span key={type} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-muted text-foreground border border-border">
                                {type}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Notes */}
                        {appt.notes && (
                          <div className="text-xs bg-muted/40 p-2 rounded-xl border border-border/60 text-muted-foreground mb-2 leading-relaxed">
                            <span className="font-bold text-foreground/80">ملاحظات: </span>
                            {appt.notes}
                          </div>
                        )}

                        {/* Action buttons: WhatsApp / Call */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
                          <div className="flex items-center gap-1.5">
                            {appt.clientPhone && (
                              <>
                                <a
                                  href={`https://wa.me/${appt.clientPhone.replace(/\D/g, '')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="h-7 px-2.5 rounded-lg text-xs font-bold bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/30 flex items-center gap-1"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  <span>واتساب</span>
                                </a>
                                <a
                                  href={`tel:${appt.clientPhone}`}
                                  className="h-7 px-2 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 flex items-center justify-center"
                                >
                                  <Phone className="w-3 h-3" />
                                </a>
                              </>
                            )}
                          </div>

                          {tickets.length > 0 && (
                            <button
                              onClick={() => setExpandedApptId(isExpanded ? null : appt.id)}
                              className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"
                            >
                              <span>تذاكر الفيلا ({tickets.length})</span>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>

                        {/* Expandable Tickets List */}
                        {isExpanded && tickets.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                            <div className="text-xs font-black text-muted-foreground">تفاصيل تذاكر الفيلا:</div>
                            {tickets.map((tItem: any) => (
                              <div
                                key={tItem.id}
                                className="p-2.5 rounded-xl bg-muted/50 border border-border flex flex-col gap-1 text-xs cursor-pointer hover:border-primary/40 transition-colors"
                                onClick={() => navigate(`/tech/ticket/${tItem.id}`)}
                              >
                                <div className="flex items-center justify-between font-bold">
                                  <span className="text-foreground">{tItem.itemCode || tItem.id?.slice(0, 8)}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                    {tItem.status}
                                  </span>
                                </div>
                                <div className="text-muted-foreground text-[11px] line-clamp-2">
                                  {tItem.description || 'لا يوجد وصف'}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="tech-bottom-nav">
        <button
          className={`tech-nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <Home className="w-5 h-5 mb-1" />
          <span>الرئيسية</span>
        </button>
        <button
          className={`tech-nav-item ${activeTab === 'appointments' ? 'active' : ''}`}
          onClick={() => setActiveTab('appointments')}
        >
          <Calendar className="w-5 h-5 mb-1" />
          <span>المواعيد</span>
        </button>
      </div>
    </div>
  );
}
