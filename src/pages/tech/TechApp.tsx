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
  CheckCircle2,  Play,
  Pause,
  Timer,
  MoreVertical,
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
  const [dynamicTranslations, setDynamicTranslations] = useState<Record<string, string>>({});
  const requestedTranslationsRef = useRef(new Set<string>());
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

  const dynamicTexts = useMemo(() => {
    const values = new Set<string>();
    const add = (value?: string | null) => {
      const clean = value?.trim();
      if (clean) values.add(clean);
    };
    for (const appointment of appointments) {
      add(appointment.notes);
      for (const type of appointment.types || []) add(TYPE_LABELS_STATIC[type] ?? type);
      for (const ticket of appointment.tickets || []) {
        add(ticket.description);
        add(TYPE_LABELS_STATIC[ticket.type] ?? ticket.type);
        for (const type of ticket.detectedTypes || []) add(TYPE_LABELS_STATIC[type] ?? type);
      }
    }
    return [...values];
  }, [appointments]);

  useEffect(() => {
    if (lang === 'ar' || dynamicTexts.length === 0) return;
    const missing = dynamicTexts.filter(text => {
      const key = `${lang}\u0000${text}`;
      return !dynamicTranslations[key] && !requestedTranslationsRef.current.has(key);
    });
    if (missing.length === 0) return;
    for (const text of missing) requestedTranslationsRef.current.add(`${lang}\u0000${text}`);
    techApi.translateTexts(missing, lang)
      .then(result => {
        setDynamicTranslations(current => {
          const next = { ...current };
          for (const [source, translated] of Object.entries(result)) {
            next[`${lang}\u0000${source}`] = translated;
          }
          return next;
        });
      })
      .catch(error => console.warn('Dynamic translation failed:', error));
  }, [dynamicTexts, dynamicTranslations, lang]);

  const translateText = useCallback((value?: string | null) => {
    if (!value) return '';
    if (lang === 'ar') return value;
    return dynamicTranslations[`${lang}\u0000${value}`] || value;
  }, [dynamicTranslations, lang]);

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
                translateText={translateText}
                onRefresh={fetchData}
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
                translateText={translateText}
                onRefresh={fetchData}
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
  translateText,
  onRefresh,
}: {
  appt: any;
  lang: TechLang;
  expanded: boolean;
  onToggle: () => void;
  navigate: ReturnType<typeof useNavigate>;
  translateText: (value?: string | null) => string;
  onRefresh?: () => void;
}) {
  const tickets = appt.tickets || [];
  const isCompleted = appt.status === 'completed';
  const claimBlocked = appt.claimBlocked === true;
  const completedTickets = appt.completedTickets ?? tickets.filter((ticket: any) =>
    ['completed', 'closed', 'out_of_scope', 'absent'].includes(String(ticket.status).toLowerCase())
  ).length;

  const isClaimedByMe = appt.isClaimedByMe === true;
  const isClaimedByOther = appt.isClaimedByOther === true;
  const isPausedByMe = appt.isPausedByMe === true;
  const session = appt.workSession || null;
  const isRunning = isClaimedByMe && !isPausedByMe;

  const [claiming, setClaiming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [showPostpone, setShowPostpone] = useState(false);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isRunning || !session?.claimedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isRunning, session?.claimedAt]);

  // Effective elapsed time:
  //   in_progress → wall clock (now - claimedAt) - totalPausedMins*60
  //   paused      → up to pausedAt, minus prior pauses
  const elapsedSecs = (() => {
    if (!session?.claimedAt) return 0;
    const start = new Date(session.claimedAt).getTime();
    const end = isPausedByMe && session.pausedAt
      ? new Date(session.pausedAt).getTime()
      : now;
    const pauseSecs = (session.totalPausedMins || 0) * 60;
    return Math.max(0, Math.floor((end - start) / 1000) - pauseSecs);
  })();
  const elapsedLabel = (() => {
    const h = Math.floor(elapsedSecs / 3600);
    const m = Math.floor((elapsedSecs % 3600) / 60);
    const s = elapsedSecs % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  })();

  const firstWorkTicket =
    tickets.find((ticket: any) => String(ticket.status).toLowerCase() === 'in_progress') ||
    tickets.find((ticket: any) =>
      ['pending', 'open', 'waiting', 'contractor'].includes(String(ticket.status).toLowerCase())
    );

  const handleClaimAppointment = async () => {
    if (claiming || isCompleted) return;
    if (claimBlocked) {
      toast.error(t(lang, 'finishActiveAppointmentFirst'));
      return;
    }
    if (isClaimedByMe) {
      if (firstWorkTicket?.id) navigate(`/tech/ticket/${firstWorkTicket.id}`);
      else onToggle();
      return;
    }
    setClaiming(true);
    try {
      let lat: number | undefined, lng: number | undefined, accuracy: number | undefined;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, enableHighAccuracy: true });
          });
          lat = pos.coords.latitude; lng = pos.coords.longitude; accuracy = pos.coords.accuracy;
        } catch {}
      }
      await techApi.claimAppointment(appt.id, { lat, lng, accuracy });
      toast.success(t(lang, 'appointmentClaimed'));
      onRefresh?.();
      if (firstWorkTicket?.id) navigate(`/tech/ticket/${firstWorkTicket.id}`);
      else onToggle();
    } catch (err: any) {
      toast.error(err?.code === 'ACTIVE_APPOINTMENT_EXISTS'
        ? t(lang, 'finishActiveAppointmentFirst')
        : (err?.message || t(lang, 'claimTicket')));
    } finally {
      setClaiming(false);
    }
  };

  const handleFinishAppointment = async () => {
    if (finishing) return;
    if (!window.confirm('إنهاء الموعد وإغلاق كل التذاكر النشطة؟')) return;
    setFinishing(true);
    try {
      let lat: number | undefined, lng: number | undefined;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, enableHighAccuracy: true });
          });
          lat = pos.coords.latitude; lng = pos.coords.longitude;
        } catch {}
      }
      await techApi.finishAppointment(appt.id, { lat, lng });
      toast.success('تم إنهاء الموعد');
      onRefresh?.();
    } catch (err: any) {
      toast.error(err?.message || 'فشل إنهاء الموعد');
    } finally {
      setFinishing(false);
    }
  };

  const handlePauseAppointment = async () => {
    if (pausing) return;
    const reason = window.prompt('سبب التوقف المؤقت (اختياري):', '');
    if (reason === null) return; // cancelled
    setPausing(true);
    try {
      await techApi.pauseAppointment(appt.id, reason.trim() || undefined);
      toast.success('تم تعليق الموعد — تقدر تستلم موعد آخر');
      onRefresh?.();
    } catch (err: any) {
      toast.error(err?.message || 'فشل تعليق الموعد');
    } finally {
      setPausing(false);
    }
  };

  const handleResumeAppointment = async () => {
    if (resuming) return;
    setResuming(true);
    try {
      await techApi.resumeAppointment(appt.id);
      toast.success('تم استئناف الموعد');
      onRefresh?.();
    } catch (err: any) {
      toast.error(err?.code === 'ACTIVE_APPOINTMENT_EXISTS'
        ? 'أنه أو علّق الموعد الآخر أولاً'
        : (err?.message || 'فشل استئناف الموعد'));
    } finally {
      setResuming(false);
    }
  };

  const statusLabel = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'open': return t(lang, 'status_OPEN');
      case 'pending': return t(lang, 'status_PENDING');
      case 'in_progress': return t(lang, 'status_IN_PROGRESS');
      case 'completed': return t(lang, 'status_COMPLETED');
      case 'closed': return t(lang, 'status_CLOSED');
      case 'paused': return t(lang, 'status_PAUSED');
      default: return status || t(lang, 'status_UNKNOWN');
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
            <span key={type}>{translateText(TYPE_LABELS_STATIC[type] ?? type)}</span>
          ))}
        </div>
      )}

      {appt.notes && <div className="tech-note">{translateText(appt.notes)}</div>}

      <ApptCardActions
        appt={appt}
        lang={lang}
        expanded={expanded}
        onToggle={onToggle}
        tickets={tickets}
        completedTickets={completedTickets}
        isCompleted={isCompleted}
        isClaimedByMe={isClaimedByMe}
        isClaimedByOther={isClaimedByOther}
        isPausedByMe={isPausedByMe}
        claimBlocked={claimBlocked}
        elapsedLabel={elapsedLabel}
        claiming={claiming}
        finishing={finishing}
        pausing={pausing}
        resuming={resuming}
        onClaim={handleClaimAppointment}
        onFinish={handleFinishAppointment}
        onPause={handlePauseAppointment}
        onResume={handleResumeAppointment}
        onPostpone={() => setShowPostpone(true)}
      />

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
                <span>{translateText(ticket.description) || t(lang, 'noDescription')}</span>
              </div>
              <span className="tech-ticket-status">{statusLabel(ticket.status)}</span>
            </button>
          ))}
        </div>
      )}

      {showPostpone && (
        <PostponeDialog
          appointmentId={appt.id}
          currentDate={appt.date}
          currentTime={appt.time}
          onClose={() => setShowPostpone(false)}
          onDone={() => { setShowPostpone(false); onRefresh?.(); }}
        />
      )}
    </article>
  );
}

function ApptCardActions({
  appt, lang, expanded, onToggle, tickets, completedTickets,
  isCompleted, isClaimedByMe, isClaimedByOther, isPausedByMe, claimBlocked,
  elapsedLabel, claiming, finishing, pausing, resuming,
  onClaim, onFinish, onPause, onResume, onPostpone,
}: {
  appt: any; lang: TechLang; expanded: boolean; onToggle: () => void;
  tickets: any[]; completedTickets: number;
  isCompleted: boolean; isClaimedByMe: boolean; isClaimedByOther: boolean;
  isPausedByMe: boolean; claimBlocked: boolean; elapsedLabel: string;
  claiming: boolean; finishing: boolean; pausing: boolean; resuming: boolean;
  onClaim: () => void; onFinish: () => void; onPause: () => void;
  onResume: () => void; onPostpone: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  // Row 1: contact icons + status
  const statusPill = (() => {
    if (isCompleted) {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 9px', borderRadius: 999, fontSize: 11, fontWeight: 800,
          background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)',
        }}>
          <CheckCircle2 size={12} /> مكتمل
        </span>
      );
    }
    if (isClaimedByOther) {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
          background: 'rgba(148,163,184,0.15)', color: '#94a3b8',
        }}>
          <User size={12} /> فني آخر يعمل عليه
        </span>
      );
    }
    if (isClaimedByMe) {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          background: isPausedByMe ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.14)',
          color: isPausedByMe ? '#f59e0b' : '#3b82f6',
          border: isPausedByMe ? '1px solid rgba(245,158,11,0.35)' : '1px solid rgba(59,130,246,0.3)',
        }}>
          {isPausedByMe ? <Pause size={12} /> : <Timer size={12} />}
          {elapsedLabel}
          {isPausedByMe && <span style={{ fontSize: 10 }}>متوقف</span>}
        </span>
      );
    }
    return null;
  })();

  // Primary action button
  const primaryAction = (() => {
    if (isCompleted) return null;
    if (isClaimedByOther) return null;
    if (isPausedByMe) {
      return (
        <button
          onClick={onResume} disabled={resuming}
          className="tech-btn tech-btn-success"
          style={{ flex: 1, height: 40, fontSize: 13, fontWeight: 800 }}
        >
          {resuming ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          استئناف الموعد
        </button>
      );
    }
    if (isClaimedByMe) {
      return (
        <button
          onClick={onFinish} disabled={finishing}
          className="tech-btn"
          style={{
            flex: 1, height: 40, fontSize: 13, fontWeight: 800,
            background: 'linear-gradient(180deg,#ef4444,#dc2626)', color: '#fff', border: 'none',
          }}
        >
          {finishing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          إنهاء الموعد
        </button>
      );
    }
    return (
      <button
        onClick={onClaim} disabled={claiming || claimBlocked}
        className="tech-btn"
        style={{
          flex: 1, height: 40, fontSize: 13, fontWeight: 800,
          background: claimBlocked
            ? 'rgba(100,116,139,0.15)'
            : 'linear-gradient(180deg,#22c55e,#16a34a)',
          color: claimBlocked ? '#94a3b8' : '#fff',
          border: 'none',
          cursor: claimBlocked ? 'not-allowed' : 'pointer',
        }}
      >
        {claiming ? (
          <Loader2 size={16} className="animate-spin" />
        ) : claimBlocked ? (
          <Clock size={16} />
        ) : (
          <CheckCircle2 size={16} />
        )}
        {claiming ? 'جارٍ الاستلام...' : claimBlocked ? 'أنهِ الموعد الآخر أولاً' : 'استلام الموعد'}
      </button>
    );
  })();

  // Overflow menu items (only when I'm actively on this appointment)
  const hasMenu = isClaimedByMe && !isCompleted;

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, marginTop: 8, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {statusPill}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {appt.clientPhone && (
            <>
              <a
                href={`https://wa.me/${appt.clientPhone.replace(/\D/g, '')}`}
                target="_blank" rel="noopener noreferrer"
                aria-label="واتساب"
                style={{
                  width: 32, height: 32, borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(34,197,94,0.12)', color: '#16a34a',
                  border: '1px solid rgba(34,197,94,0.25)',
                }}
              >
                <MessageCircle size={14} />
              </a>
              <a
                href={`tel:${appt.clientPhone}`}
                aria-label="اتصال"
                style={{
                  width: 32, height: 32, borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(59,130,246,0.12)', color: '#3b82f6',
                  border: '1px solid rgba(59,130,246,0.25)',
                }}
              >
                <Phone size={14} />
              </a>
            </>
          )}
        </div>
      </div>

      {primaryAction && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'stretch' }}>
          {primaryAction}
          {hasMenu && (
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen(m => !m)}
                aria-label="خيارات"
                style={{
                  width: 40, height: 40, borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(100,116,139,0.12)', color: 'inherit',
                  border: '1px solid var(--tech-border, rgba(100,116,139,0.25))',
                }}
              >
                <MoreVertical size={18} />
              </button>
              {menuOpen && (
                <div style={{
                  position: 'absolute', top: '100%', insetInlineEnd: 0, marginTop: 6,
                  minWidth: 180, borderRadius: 12, overflow: 'hidden',
                  background: 'var(--tech-card, #fff)',
                  border: '1px solid var(--tech-border, #e2e8f0)',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.15)', zIndex: 20,
                }}>
                  {!isPausedByMe && (
                    <button
                      onClick={() => { setMenuOpen(false); onPause(); }}
                      disabled={pausing}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 12px', background: 'transparent', border: 0,
                        color: '#f59e0b', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        textAlign: 'start',
                      }}
                    >
                      <Pause size={14} /> توقف مؤقت
                    </button>
                  )}
                  <button
                    onClick={() => { setMenuOpen(false); onPostpone(); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 12px', background: 'transparent', border: 0,
                      borderTop: '1px solid var(--tech-border, #e2e8f0)',
                      color: '#8b5cf6', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                      textAlign: 'start',
                    }}
                  >
                    <Calendar size={14} /> تأجيل الموعد
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tickets.length > 0 && (
        <button
          onClick={onToggle}
          className="tech-ticket-toggle"
          style={{ marginTop: 8, width: '100%', justifyContent: 'space-between' }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Ticket size={14} />
            {completedTickets}/{tickets.length} {t(lang, 'ticketsCount')}
          </span>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      )}
    </>
  );
}

function PostponeDialog({
  appointmentId, currentDate, currentTime, onClose, onDone,
}: {
  appointmentId: string;
  currentDate?: string;
  currentTime?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [newDate, setNewDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [newTime, setNewTime] = useState<string>(currentTime || '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (submitting) return;
    if (!newDate) { toast.error('اختر تاريخ جديد'); return; }
    setSubmitting(true);
    try {
      await techApi.postponeAppointment(appointmentId, {
        newDate, newTime: newTime || null, reason: reason.trim() || undefined,
      });
      toast.success('تم تأجيل الموعد');
      onDone();
    } catch (err: any) {
      toast.error(err?.message || 'فشل التأجيل');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--tech-card, #fff)', color: 'var(--tech-text, #000)',
          borderRadius: 20, padding: 20, width: '100%', maxWidth: 400,
          border: '1px solid var(--tech-border, #e2e8f0)',
        }}
        dir="rtl"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(139,92,246,0.15)', color: '#8b5cf6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Calendar size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15 }}>تأجيل الموعد</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>حالياً: {currentDate} {currentTime || ''}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, display: 'block', marginBottom: 4 }}>التاريخ الجديد</label>
            <input
              type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--tech-border, #cbd5e1)', background: 'transparent', color: 'inherit', fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, display: 'block', marginBottom: 4 }}>الوقت (اختياري)</label>
            <input
              type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--tech-border, #cbd5e1)', background: 'transparent', color: 'inherit', fontSize: 13 }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, opacity: 0.7, display: 'block', marginBottom: 4 }}>سبب التأجيل</label>
            <textarea
              value={reason} onChange={e => setReason(e.target.value)} rows={2}
              placeholder="اختياري..."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--tech-border, #cbd5e1)', background: 'transparent', color: 'inherit', fontSize: 13, resize: 'none' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button
            onClick={onClose}
            className="tech-btn"
            style={{ flex: 1, background: 'rgba(100,116,139,0.15)', color: 'inherit' }}
          >إلغاء</button>
          <button
            onClick={submit} disabled={submitting}
            className="tech-btn"
            style={{ flex: 1, background: '#8b5cf6', color: '#fff' }}
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
            تأكيد
          </button>
        </div>
      </div>
    </div>
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
