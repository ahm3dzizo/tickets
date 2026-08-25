import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTechAuth } from '@/hooks/useTechAuth';
import { TechLang, t } from '@/i18n/tech';
import { techApi } from '@/lib/api';
import {
  Loader2,
  Home,
  Calendar,
  LogOut,
  Coffee,
  Clock,
  RefreshCw,
  Phone,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Ticket,
  User,
  CheckCircle2,
  Play,
  Timer,
  Sun,
  Moon,
  Monitor,
  Globe,
  Settings,
  Briefcase,
  Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import './tech.css';
import { registerPush, unregisterPush, isPushSupported, getPushPermission } from '@/lib/pushNotifications';
import { TYPE_LABELS_STATIC } from '@/components/tickets/TypesSelector';
import { Bell, BellRing, BellOff } from 'lucide-react';

// Push notification button for the TechApp header
function TechPushButton({ token }: { token: string | null }) {
  const [perm, setPerm] = React.useState<NotificationPermission>('default');
  React.useEffect(() => { if (isPushSupported()) setPerm(getPushPermission()); }, []);
  if (!isPushSupported() || !token) return null;
  const toggle = async () => {
    if (perm === 'granted') {
      await unregisterPush();
      setPerm('default');
      toast.info('تم إيقاف الإشعارات');
    } else {
      const ok = await registerPush(`Bearer ${token}`, true);
      const p = getPushPermission();
      setPerm(p);
      if (ok) toast.success('✅ تم تفعيل الإشعارات');
      else if (p === 'denied') toast.error('تم رفض الإشعارات من المتصفح');
    }
  };
  return (
    <button onClick={toggle} className="tech-icon-btn" title={perm === 'granted' ? 'إيقاف الإشعارات' : 'تفعيل الإشعارات'}>
      {perm === 'granted' ? <BellRing size={18} style={{ color: '#22c55e' }} /> : perm === 'denied' ? <BellOff size={18} style={{ opacity: 0.5 }} /> : <Bell size={18} style={{ opacity: 0.5 }} />}
    </button>
  );
}

type Tab = 'home' | 'appointments' | 'profile';
type Theme = 'light' | 'dark' | 'system';

function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem('tech-theme');
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {}
  return 'system';
}

export default function TechApp() {
  const { token, techProfile, logout, setProfile } = useTechAuth() as any;
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [shift, setShift] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [expandedApptId, setExpandedApptId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
  });

  const lang = (techProfile?.language || 'ar') as TechLang;
  const isRtl = lang === 'ar' || lang === 'ur';

  // Apply data-theme attribute
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (theme === 'system') {
      el.removeAttribute('data-theme');
    } else {
      el.setAttribute('data-theme', theme);
    }
    try { localStorage.setItem('tech-theme', theme); } catch {}
  }, [theme]);

  const fetchData = useCallback(async () => {
    try {
      const [shiftData, apptsData] = await Promise.all([
        techApi.getTodayShift().catch(() => null),
        techApi.getAppointments().catch(() => []),
      ]);
      setShift(shiftData);
      setAppointments(apptsData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      navigate('/tech/login');
      return;
    }
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [token, navigate, fetchData]);

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
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 10000,
              enableHighAccuracy: true,
            });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          accuracy = pos.coords.accuracy;
        } catch {}
      }
      await techApi.clockIn({ lat, lng, accuracy, projectId: techProfile?.projectId });
      toast.success(t(lang, 'shiftActive'));
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || t(lang, 'clockInFail'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!window.confirm(t(lang, 'clockOutConfirm'))) return;
    setActionLoading(true);
    try {
      await techApi.clockOut();
      toast.success(t(lang, 'clockOutSuccess'));
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || t(lang, 'clockOutFail'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleBreak = async () => {
    setActionLoading(true);
    try {
      if (shift?.status === 'ON_BREAK') {
        await techApi.endBreak();
        toast.success(t(lang, 'endBreakSuccess'));
      } else {
        await techApi.startBreak('MEAL');
        toast.success(t(lang, 'startBreakSuccess'));
      }
      await fetchData();
    } catch (err: any) {
      toast.error(err.message || t(lang, 'breakFail'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleLangChange = async (newLang: TechLang) => {
    if (newLang === lang) return;
    try {
      const res = await fetch('/api/tech/language', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ language: newLang }),
      });
      if (!res.ok) throw new Error('Failed');
      if (setProfile && techProfile) {
        setProfile({ ...techProfile, language: newLang });
      }
    } catch {
      toast.error('Failed to update language');
    }
  };

  const filteredAppointments = useMemo(
    () => appointments.filter((a) => !selectedDate || a.date === selectedDate),
    [appointments, selectedDate]
  );

  const todayCount = filteredAppointments.length;
  const ticketCount = filteredAppointments.reduce(
    (total, a) => total + (a.tickets?.length || 0),
    0
  );
  const completedCount = filteredAppointments.filter(
    (a) => a.status === 'completed'
  ).length;

  const activeShift = shift?.status === 'ACTIVE' || shift?.status === 'ON_BREAK';

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t(lang, 'greeting_morning');
    if (hour < 17) return t(lang, 'greeting_afternoon');
    return t(lang, 'greeting_evening');
  };

  const formatTime = (value?: string) => {
    if (!value) return '--:--';
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderHome = () => (
    <>
      {/* Hero */}
      <section className="tech-hero slide-up">
        <div className="tech-hero-top">
          <div>
            <div className="tech-eyebrow">{getGreeting()} 👋</div>
            <h1 className="tech-hero-title">{techProfile?.name || t(lang, 'maintenanceTech')}</h1>
            <div className="tech-hero-subtitle">
              <span>{techProfile?.specialty || t(lang, 'maintenanceTech')}</span>
              {techProfile?.supervisor?.name && (
                <>
                  <span className="tech-dot">•</span>
                  <span>{t(lang, 'supervisedBy')} {techProfile.supervisor.name}</span>
                </>
              )}
            </div>
          </div>
          <div className="tech-avatar">
            {techProfile?.name?.charAt(0) || '👷'}
          </div>
        </div>

        <div className="tech-hero-status">
          <div className="tech-status-live">
            <span
              className={`tech-live-dot ${
                activeShift
                  ? shift?.status === 'ON_BREAK' ? 'break' : 'active'
                  : 'offline'
              }`}
            />
            <span>
              {shift?.status === 'ON_BREAK'
                ? t(lang, 'shiftLiveBreak')
                : activeShift
                ? t(lang, 'shiftLive')
                : t(lang, 'shiftLiveOff')}
            </span>
          </div>
          {activeShift && shift?.clockInAt && (
            <div className="tech-shift-time">
              <Clock size={14} />
              {t(lang, 'sinceTime')} {formatTime(shift.clockInAt)}
            </div>
          )}
        </div>
      </section>

      {/* Shift Actions */}
      <section className="tech-shift-card slide-up">
        <div className="tech-section-label">
          <Timer size={15} />
          {t(lang, 'shiftStatus')}
        </div>

        {activeShift ? (
          <>
            <div className="tech-shift-main">
              <div>
                <div className="tech-shift-title">
                  {shift?.status === 'ON_BREAK'
                    ? t(lang, 'shiftOnBreakTitle')
                    : t(lang, 'shiftActiveTitle')}
                </div>
                <div className="tech-shift-description">
                  {shift?.status === 'ON_BREAK'
                    ? t(lang, 'shiftOnBreakDesc')
                    : t(lang, 'shiftActiveDesc')}
                </div>
              </div>
              <div className={`tech-shift-icon ${shift?.status === 'ON_BREAK' ? 'break' : ''}`}>
                {shift?.status === 'ON_BREAK' ? <Coffee size={23} /> : <CheckCircle2 size={23} />}
              </div>
            </div>

            <div className="tech-action-row">
              <button
                onClick={handleToggleBreak}
                disabled={actionLoading}
                className={`tech-btn ${
                  shift?.status === 'ON_BREAK' ? 'tech-btn-success' : 'tech-btn-warning'
                }`}
              >
                <Coffee size={17} />
                {shift?.status === 'ON_BREAK' ? t(lang, 'endBreak') : t(lang, 'startBreak')}
              </button>
              <button
                onClick={handleClockOut}
                disabled={actionLoading}
                className="tech-btn tech-btn-danger-outline"
              >
                <LogOut size={17} />
                {t(lang, 'clockOut')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="tech-shift-main">
              <div>
                <div className="tech-shift-title">{t(lang, 'shiftIdleTitle')}</div>
                <div className="tech-shift-description">{t(lang, 'shiftIdleDesc')}</div>
              </div>
              <div className="tech-shift-icon idle">
                <Clock size={23} />
              </div>
            </div>
            <button
              onClick={handleClockIn}
              disabled={actionLoading}
              className="tech-btn tech-btn-success tech-clock-btn"
            >
              <Play size={17} fill="currentColor" />
              {actionLoading ? t(lang, 'registering') : t(lang, 'clockIn')}
            </button>
          </>
        )}
      </section>

      {/* Stats */}
      <section className="tech-stats-grid slide-up">
        <div className="tech-stat-card">
          <div className="tech-stat-icon blue">
            <Calendar size={18} />
          </div>
          <div>
            <strong>{todayCount}</strong>
            <span>{t(lang, 'appointmentsCount')}</span>
          </div>
        </div>
        <div className="tech-stat-card">
          <div className="tech-stat-icon amber">
            <Ticket size={18} />
          </div>
          <div>
            <strong>{ticketCount}</strong>
            <span>{t(lang, 'ticketsCount')}</span>
          </div>
        </div>
        <div className="tech-stat-card">
          <div className="tech-stat-icon emerald">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <strong>{completedCount}</strong>
            <span>{t(lang, 'completedCount')}</span>
          </div>
        </div>
      </section>

      {/* Today Appointments Preview */}
      <section className="tech-section slide-up">
        <div className="tech-section-heading">
          <div>
            <div className="tech-section-title">
              <Calendar size={17} />
              {t(lang, 'todayAppointments')}
            </div>
            <div className="tech-section-subtitle">
              {todayCount
                ? `${todayCount} ${t(lang, 'appointmentsCount')}`
                : t(lang, 'noAppointments')}
            </div>
          </div>
          <button className="tech-link-btn" onClick={() => setActiveTab('appointments')}>
            {t(lang, 'viewAll')}
          </button>
        </div>

        {filteredAppointments.length === 0 ? (
          <div className="tech-empty">
            <div className="tech-empty-icon"><Calendar size={24} /></div>
            <strong>{t(lang, 'noAppointments')}</strong>
            <span>{t(lang, 'noAppointmentsDesc')}</span>
          </div>
        ) : (
          <div className="tech-mini-list">
            {filteredAppointments.slice(0, 3).map((appt) => (
              <AppointmentCard
                key={appt.id}
                appt={appt}
                lang={lang}
                expanded={expandedApptId === appt.id}
                onToggle={() =>
                  setExpandedApptId(expandedApptId === appt.id ? null : appt.id)
                }
                navigate={navigate}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );

  const renderAppointments = () => (
    <>
      <div className="tech-page-title">
        <div>
          <h1>{t(lang, 'appointments')}</h1>
          <p>{t(lang, 'appointmentSubtitle')}</p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="tech-icon-btn"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="tech-date-bar">
        <Calendar size={17} />
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
        {selectedDate && (
          <button onClick={() => setSelectedDate('')}>{t(lang, 'all')}</button>
        )}
      </div>

      <div className="tech-section">
        <div className="tech-list-count">
          <span>{t(lang, 'appointments')}</span>
          <strong>{filteredAppointments.length}</strong>
        </div>

        {filteredAppointments.length === 0 ? (
          <div className="tech-empty">
            <div className="tech-empty-icon"><Calendar size={24} /></div>
            <strong>{t(lang, 'noAppointments')}</strong>
            <span>{t(lang, 'noAppointmentsDesc')}</span>
          </div>
        ) : (
          <div className="tech-mini-list">
            {filteredAppointments.map((appt) => (
              <AppointmentCard
                key={appt.id}
                appt={appt}
                lang={lang}
                expanded={expandedApptId === appt.id}
                onToggle={() =>
                  setExpandedApptId(expandedApptId === appt.id ? null : appt.id)
                }
                navigate={navigate}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );

  const renderProfile = () => {
    const LANGUAGES: { code: TechLang; label: string; native: string }[] = [
      { code: 'ar', label: 'Arabic', native: 'العربية' },
      { code: 'en', label: 'English', native: 'English' },
      { code: 'hi', label: 'Hindi', native: 'हिंदी' },
      { code: 'ur', label: 'Urdu', native: 'اردو' },
    ];

    const THEMES: { value: Theme; labelKey: string; icon: React.ReactNode }[] = [
      { value: 'light', labelKey: 'themeLight', icon: <Sun size={18} /> },
      { value: 'dark', labelKey: 'themeDark', icon: <Moon size={18} /> },
      { value: 'system', labelKey: 'themeSystem', icon: <Monitor size={18} /> },
    ];

    return (
      <>
        {/* Profile Hero */}
        <div className="tech-profile-hero slide-up">
          <div className="tech-profile-avatar-lg">
            {techProfile?.name?.charAt(0)?.toUpperCase() || '👷'}
          </div>
          <div className="tech-profile-info">
            <h2>{techProfile?.name || t(lang, 'maintenanceTech')}</h2>
            <div className="tech-profile-badge">
              <Briefcase size={13} />
              {techProfile?.specialty || t(lang, 'maintenanceTech')}
            </div>
            {techProfile?.supervisor?.name && (
              <div className="tech-profile-badge" style={{ marginTop: '4px', opacity: 0.8 }}>
                <Shield size={13} />
                {t(lang, 'supervisedBy')} {techProfile.supervisor.name}
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        <section className="tech-stats-grid slide-up">
          <div className="tech-stat-card">
            <div className="tech-stat-icon blue"><Calendar size={18} /></div>
            <div>
              <strong>{todayCount}</strong>
              <span>{t(lang, 'appointmentsCount')}</span>
            </div>
          </div>
          <div className="tech-stat-card">
            <div className="tech-stat-icon amber"><Ticket size={18} /></div>
            <div>
              <strong>{ticketCount}</strong>
              <span>{t(lang, 'ticketsCount')}</span>
            </div>
          </div>
          <div className="tech-stat-card">
            <div className="tech-stat-icon emerald"><CheckCircle2 size={18} /></div>
            <div>
              <strong>{completedCount}</strong>
              <span>{t(lang, 'completedCount')}</span>
            </div>
          </div>
        </section>

        {/* Language switcher */}
        <section className="tech-settings-card slide-up">
          <div className="tech-settings-header">
            <Globe size={16} />
            {t(lang, 'langLabel')}
          </div>
          <div className="tech-lang-grid">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                className={`tech-lang-item ${lang === l.code ? 'active' : ''}`}
                onClick={() => handleLangChange(l.code)}
              >
                <span className="tech-lang-native">{l.native}</span>
                <span className="tech-lang-label">{l.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Theme switcher */}
        <section className="tech-settings-card slide-up">
          <div className="tech-settings-header">
            <Sun size={16} />
            {t(lang, 'themeLabel')}
          </div>
          <div className="tech-theme-grid">
            {THEMES.map((th) => (
              <button
                key={th.value}
                className={`tech-theme-item ${theme === th.value ? 'active' : ''}`}
                onClick={() => setTheme(th.value)}
              >
                {th.icon}
                <span>{t(lang, th.labelKey)}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Account Info */}
        <section className="tech-info-card slide-up">
          <div className="tech-settings-header">
            <Settings size={16} />
            {t(lang, 'accountInfo')}
          </div>
          <InfoRow icon={<User size={17} />} label={t(lang, 'name')} value={techProfile?.name} />
          <InfoRow icon={<Phone size={17} />} label={t(lang, 'phone')} value={techProfile?.phoneNumber || techProfile?.username} />
          <InfoRow icon={<Briefcase size={17} />} label={t(lang, 'specialty')} value={techProfile?.specialty || t(lang, 'maintenanceTech')} />
          {techProfile?.employeeId && (
            <InfoRow icon={<Shield size={17} />} label={t(lang, 'employeeId')} value={techProfile.employeeId} />
          )}
          {techProfile?.supervisor?.name && (
            <InfoRow icon={<User size={17} />} label={t(lang, 'supervisor')} value={techProfile.supervisor.name} />
          )}
        </section>

        <button onClick={handleLogout} className="tech-logout-btn">
          <LogOut size={18} />
          {t(lang, 'logout')}
        </button>
      </>
    );
  };

  return (
    <div className="tech-app" dir={isRtl ? 'rtl' : 'ltr'} ref={rootRef}>
      <header className="tech-header">
        <div className="tech-brand">
          <div className="tech-brand-mark">R</div>
          <div>
            <strong>RETAL</strong>
            <span>Technician</span>
          </div>
        </div>

        <div className="tech-header-actions">
          <TechPushButton token={token} />
          <button
            onClick={() => { setLoading(true); fetchData(); }}
            className="tech-icon-btn"
            aria-label={t(lang, 'refresh')}
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`tech-icon-btn ${activeTab === 'profile' ? 'active' : ''}`}
            aria-label={t(lang, 'myAccount')}
          >
            <User size={18} />
          </button>
        </div>
      </header>

      <main className="tech-container">
        {loading && appointments.length === 0 ? (
          <div className="tech-loading">
            <div className="tech-loading-spinner">
              <RefreshCw size={25} />
            </div>
            <span>{t(lang, 'loadingData')}</span>
          </div>
        ) : (
          <>
            {activeTab === 'home' && renderHome()}
            {activeTab === 'appointments' && renderAppointments()}
            {activeTab === 'profile' && renderProfile()}
          </>
        )}
      </main>

      <nav className="tech-bottom-nav">
        <button
          className={`tech-nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <Home size={21} />
          <span>{t(lang, 'home')}</span>
        </button>

        <button
          className={`tech-nav-item ${activeTab === 'appointments' ? 'active' : ''}`}
          onClick={() => setActiveTab('appointments')}
        >
          <Calendar size={21} />
          <span>{t(lang, 'appointments')}</span>
          {todayCount > 0 && <b className="tech-nav-badge">{todayCount}</b>}
        </button>

        <button
          className={`tech-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          <User size={21} />
          <span>{t(lang, 'myAccount')}</span>
        </button>
      </nav>
    </div>
  );
}

function AppointmentCard({
  appt,
  lang,
  expanded,
  onToggle,
  navigate,
}: {
  appt: any;
  lang: TechLang;
  expanded: boolean;
  onToggle: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const tickets = appt.tickets || [];
  const isCompleted = appt.status === 'completed';

  const initialClaimed =
    appt.isClaimed === true ||
    tickets.some(
      (ticket: any) =>
        ticket.status === 'in_progress' ||
        ticket.status === 'IN_PROGRESS' ||
        ticket.techSessions?.some(
          (session: any) =>
            session.status === 'CLAIMED' || session.status === 'IN_PROGRESS'
        )
    );

  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(initialClaimed);

  const handleClaimAppointment = async () => {
    if (claiming || claimed || isCompleted) return;
    setClaiming(true);
    try {
      await techApi.claimAppointment(appt.id);
      setClaimed(true);
      toast.success(t(lang, 'appointmentClaimed'));
    } catch (err: any) {
      toast.error(err?.message || t(lang, 'claimTicket'));
    } finally {
      setClaiming(false);
    }
  };

  const statusLabel = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'open': return t(lang, 'status_CLAIMED').replace('محجوزة', 'مفتوحة') || 'Open';
      case 'pending': return 'Pending';
      case 'in_progress': return t(lang, 'status_IN_PROGRESS');
      case 'completed': return t(lang, 'status_COMPLETED');
      case 'paused': return t(lang, 'status_PAUSED');
      default: return status || '';
    }
  };

  return (
    <article className={`tech-appointment ${isCompleted ? 'completed' : ''}`}>
      <div className="tech-appointment-top">
        <div className="tech-villa-icon">
          <Home size={18} />
        </div>

        <div className="tech-appointment-info">
          <strong>{t(lang, 'villa')} {appt.unitNumber || '---'}</strong>
          {appt.projectName && <span>{appt.projectName}</span>}
          {appt.clientName && <small>{appt.clientName}</small>}
        </div>

        <div className="tech-appointment-time">
          <strong>{appt.time || '--:--'}</strong>
          <span>{appt.date}</span>
        </div>
      </div>

      {appt.types?.length > 0 && (
        <div className="tech-tags">
          {appt.types.map((type: string) => (
            <span key={type}>{TYPE_LABELS_STATIC[type] ?? type}</span>
          ))}
        </div>
      )}

      {appt.notes && <div className="tech-note">{appt.notes}</div>}
      {appt.supervisorNotes && (
        <div className="tech-note" style={{ borderRight: '3px solid #f59e0b', background: 'rgba(245,158,11,0.08)', color: 'var(--tech-text-secondary)' }}>
          <strong style={{ color: '#f59e0b', fontSize: '11px' }}>ملاحظة المشرف: </strong>
          {appt.supervisorNotes}
        </div>
      )}

      <div className="tech-appointment-actions">
        <div className="tech-contact-actions">
          {appt.clientPhone && (
            <>
              <a
                href={`https://wa.me/${appt.clientPhone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tech-contact whatsapp"
              >
                <MessageCircle size={14} />
                {t(lang, 'whatsapp')}
              </a>
              <a href={`tel:${appt.clientPhone}`} className="tech-contact call">
                <Phone size={14} />
              </a>
            </>
          )}
        </div>

        {!isCompleted && (
          <button
            onClick={handleClaimAppointment}
            disabled={claiming || claimed}
            className={`tech-ticket-toggle ${claimed ? 'opacity-70 cursor-default' : ''}`}
            style={{
              minWidth: '120px',
              justifyContent: 'center',
              ...(!claimed && !claiming ? {
                background: 'rgba(34,197,94,0.12)',
                border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: '8px',
                padding: '5px 10px',
                color: '#16a34a',
                fontWeight: 700,
              } : {
                background: 'rgba(100,116,139,0.1)',
                borderRadius: '8px',
                padding: '5px 10px',
              }),
            }}
          >
            {claiming ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {t(lang, 'claimingAppointment')}
              </>
            ) : claimed ? (
              <>
                <CheckCircle2 size={14} />
                {t(lang, 'appointmentClaimed')}
              </>
            ) : (
              <>
                <CheckCircle2 size={14} />
                {t(lang, 'claimAppointment')}
              </>
            )}
          </button>
        )}

        {tickets.length > 0 && (
          <button onClick={onToggle} className="tech-ticket-toggle">
            <Ticket size={14} />
            {tickets.length} {t(lang, 'ticketsCount')}
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {expanded && tickets.length > 0 && (
        <div className="tech-ticket-list">
          {tickets.map((ticket: any) => (
            <button
              key={ticket.id}
              onClick={() => navigate(`/tech/ticket/${ticket.id}`)}
              className="tech-ticket-item"
            >
              <div>
                <strong>{ticket.itemCode || ticket.id?.slice(0, 8)}</strong>
                <span>{ticket.description || t(lang, 'noDescription')}</span>
              </div>
              <span className="tech-ticket-status">{statusLabel(ticket.status)}</span>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
}) {
  return (
    <div className="tech-info-row">
      <div className="tech-info-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value || '—'}</strong>
      </div>
    </div>
  );
}
