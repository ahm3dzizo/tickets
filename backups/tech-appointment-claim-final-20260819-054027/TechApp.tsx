import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTechAuth } from '@/hooks/useTechAuth';
import { TechLang, t } from '@/i18n/tech';
import { techApi } from '@/lib/api';
import {
  Home,
  Calendar,
  LogOut,
  Coffee,
  Clock,
  RefreshCw,
  MapPin,
  Phone,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Ticket,
  User,
  CheckCircle2,
  Play,
  Navigation,
  Timer,
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

  const fetchData = async () => {
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
          const pos = await new Promise<GeolocationPosition>(
            (resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                timeout: 10000,
                enableHighAccuracy: true,
              });
            }
          );

          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          accuracy = pos.coords.accuracy;
        } catch {
          // Location is optional.
        }
      }

      await techApi.clockIn({
        lat,
        lng,
        accuracy,
        projectId: techProfile?.projectId,
      });

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

  const filteredAppointments = useMemo(
    () =>
      appointments.filter(
        (appointment) =>
          !selectedDate || appointment.date === selectedDate
      ),
    [appointments, selectedDate]
  );

  const todayCount = filteredAppointments.length;

  const ticketCount = filteredAppointments.reduce(
    (total, appointment) =>
      total + (appointment.tickets?.length || 0),
    0
  );

  const completedCount = filteredAppointments.filter(
    (appointment) => appointment.status === 'completed'
  ).length;

  const activeShift =
    shift?.status === 'ACTIVE' || shift?.status === 'ON_BREAK';

  const getGreeting = () => {
    const hour = new Date().getHours();

    if (hour < 12) return 'صباح الخير';
    if (hour < 17) return 'مساء الخير';
    return 'مساء الخير';
  };

  const formatTime = (value?: string) => {
    if (!value) return '--:--';

    return new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderHome = () => (
    <>
      {/* Hero */}
      <section className="tech-hero slide-up">
        <div className="tech-hero-top">
          <div>
            <div className="tech-eyebrow">
              {getGreeting()} 👋
            </div>

            <h1 className="tech-hero-title">
              {techProfile?.name || 'الفني'}
            </h1>

            <div className="tech-hero-subtitle">
              <span>{techProfile?.specialty || 'فني صيانة'}</span>

              {techProfile?.supervisor?.name && (
                <>
                  <span className="tech-dot">•</span>
                  <span>بإشراف {techProfile.supervisor.name}</span>
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
                  ? shift?.status === 'ON_BREAK'
                    ? 'break'
                    : 'active'
                  : 'offline'
              }`}
            />

            <span>
              {shift?.status === 'ON_BREAK'
                ? 'في الاستراحة'
                : activeShift
                ? 'الدوام نشط'
                : 'لم يبدأ الدوام'}
            </span>
          </div>

          {activeShift && shift?.clockInAt && (
            <div className="tech-shift-time">
              <Clock size={14} />
              منذ {formatTime(shift.clockInAt)}
            </div>
          )}
        </div>
      </section>

      {/* Shift Actions */}
      <section className="tech-shift-card slide-up">
        <div className="tech-section-label">
          <Timer size={15} />
          حالة الدوام
        </div>

        {activeShift ? (
          <>
            <div className="tech-shift-main">
              <div>
                <div className="tech-shift-title">
                  {shift?.status === 'ON_BREAK'
                    ? 'أنت في الاستراحة'
                    : 'أنت على رأس العمل'}
                </div>

                <div className="tech-shift-description">
                  {shift?.status === 'ON_BREAK'
                    ? 'يمكنك إنهاء الاستراحة والعودة للعمل'
                    : 'الدوام مسجل وحالتك الحالية نشطة'}
                </div>
              </div>

              <div
                className={`tech-shift-icon ${
                  shift?.status === 'ON_BREAK' ? 'break' : ''
                }`}
              >
                {shift?.status === 'ON_BREAK' ? (
                  <Coffee size={23} />
                ) : (
                  <CheckCircle2 size={23} />
                )}
              </div>
            </div>

            <div className="tech-action-row">
              <button
                onClick={handleToggleBreak}
                disabled={actionLoading}
                className={`tech-btn ${
                  shift?.status === 'ON_BREAK'
                    ? 'tech-btn-success'
                    : 'tech-btn-warning'
                }`}
              >
                <Coffee size={17} />
                {shift?.status === 'ON_BREAK'
                  ? 'إنهاء الاستراحة'
                  : 'بدء الاستراحة'}
              </button>

              <button
                onClick={handleClockOut}
                disabled={actionLoading}
                className="tech-btn tech-btn-danger-outline"
              >
                <LogOut size={17} />
                انصراف
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="tech-shift-main">
              <div>
                <div className="tech-shift-title">
                  لم يتم تسجيل الحضور
                </div>

                <div className="tech-shift-description">
                  سجّل حضورك لبدء يوم العمل
                </div>
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
              {actionLoading ? 'جاري التسجيل...' : 'تسجيل الحضور'}
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
            <span>مواعيد</span>
          </div>
        </div>

        <div className="tech-stat-card">
          <div className="tech-stat-icon amber">
            <Ticket size={18} />
          </div>

          <div>
            <strong>{ticketCount}</strong>
            <span>تذاكر</span>
          </div>
        </div>

        <div className="tech-stat-card">
          <div className="tech-stat-icon emerald">
            <CheckCircle2 size={18} />
          </div>

          <div>
            <strong>{completedCount}</strong>
            <span>مكتملة</span>
          </div>
        </div>
      </section>

      {/* Today */}
      <section className="tech-section slide-up">
        <div className="tech-section-heading">
          <div>
            <div className="tech-section-title">
              <Calendar size={17} />
              مواعيد اليوم
            </div>

            <div className="tech-section-subtitle">
              {todayCount
                ? `${todayCount} موعد مخصص لك`
                : 'لا توجد مواعيد حالياً'}
            </div>
          </div>

          <button
            className="tech-link-btn"
            onClick={() => setActiveTab('appointments')}
          >
            عرض الكل
          </button>
        </div>

        {filteredAppointments.length === 0 ? (
          <div className="tech-empty">
            <div className="tech-empty-icon">
              <Calendar size={24} />
            </div>

            <strong>لا توجد مواعيد</strong>

            <span>
              لا توجد مواعيد مخصصة لك في هذا التاريخ
            </span>
          </div>
        ) : (
          <div className="tech-mini-list">
            {filteredAppointments.slice(0, 3).map((appt) => (
              <AppointmentCard
                key={appt.id}
                appt={appt}
                expanded={expandedApptId === appt.id}
                onToggle={() =>
                  setExpandedApptId(
                    expandedApptId === appt.id ? null : appt.id
                  )
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
          <h1>المواعيد</h1>
          <p>المواعيد والتذاكر المخصصة لك</p>
        </div>

        <button
          onClick={() => {
            setLoading(true);
            fetchData();
          }}
          className="tech-icon-btn"
        >
          <RefreshCw
            size={18}
            className={loading ? 'animate-spin' : ''}
          />
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
          <button onClick={() => setSelectedDate('')}>
            الكل
          </button>
        )}
      </div>

      <div className="tech-section">
        <div className="tech-list-count">
          <span>المواعيد</span>
          <strong>{filteredAppointments.length}</strong>
        </div>

        {filteredAppointments.length === 0 ? (
          <div className="tech-empty">
            <div className="tech-empty-icon">
              <Calendar size={24} />
            </div>
            <strong>لا توجد مواعيد</strong>
            <span>لا توجد مواعيد لهذا التاريخ</span>
          </div>
        ) : (
          <div className="tech-mini-list">
            {filteredAppointments.map((appt) => (
              <AppointmentCard
                key={appt.id}
                appt={appt}
                expanded={expandedApptId === appt.id}
                onToggle={() =>
                  setExpandedApptId(
                    expandedApptId === appt.id ? null : appt.id
                  )
                }
                navigate={navigate}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );

  const renderProfile = () => (
    <>
      <div className="tech-page-title">
        <div>
          <h1>حسابي</h1>
          <p>بيانات الفني والحساب</p>
        </div>
      </div>

      <section className="tech-profile-card">
        <div className="tech-profile-avatar">
          {techProfile?.name?.charAt(0) || '👷'}
        </div>

        <h2>{techProfile?.name || 'الفني'}</h2>

        <span>
          {techProfile?.specialty || 'فني صيانة'}
        </span>
      </section>

      <section className="tech-info-card">
        <InfoRow
          icon={<User size={17} />}
          label="الاسم"
          value={techProfile?.name}
        />

        <InfoRow
          icon={<Phone size={17} />}
          label="رقم الهاتف"
          value={techProfile?.phone}
        />

        <InfoRow
          icon={<Ticket size={17} />}
          label="التخصص"
          value={techProfile?.specialty || 'فني صيانة'}
        />

        {techProfile?.supervisor?.name && (
          <InfoRow
            icon={<User size={17} />}
            label="المشرف"
            value={techProfile.supervisor.name}
          />
        )}
      </section>

      <button
        onClick={handleLogout}
        className="tech-logout-btn"
      >
        <LogOut size={18} />
        تسجيل الخروج
      </button>
    </>
  );

  return (
    <div className="tech-app" dir={isRtl ? 'rtl' : 'ltr'}>
      <header className="tech-header">
        <div className="tech-brand">
          <div className="tech-brand-mark">
            R
          </div>

          <div>
            <strong>RETAL</strong>
            <span>Technician</span>
          </div>
        </div>

        <div className="tech-header-actions">
          <button
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
            className="tech-icon-btn"
            aria-label="تحديث"
          >
            <RefreshCw
              size={18}
              className={loading ? 'animate-spin' : ''}
            />
          </button>

          <button
            onClick={handleLogout}
            className="tech-icon-btn danger"
            aria-label="خروج"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="tech-container">
        {loading && appointments.length === 0 ? (
          <div className="tech-loading">
            <div className="tech-loading-spinner">
              <RefreshCw size={25} />
            </div>
            <span>جاري تحميل البيانات...</span>
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
          className={`tech-nav-item ${
            activeTab === 'home' ? 'active' : ''
          }`}
          onClick={() => setActiveTab('home')}
        >
          <Home size={21} />
          <span>الرئيسية</span>
        </button>

        <button
          className={`tech-nav-item ${
            activeTab === 'appointments' ? 'active' : ''
          }`}
          onClick={() => setActiveTab('appointments')}
        >
          <Calendar size={21} />
          <span>المواعيد</span>

          {todayCount > 0 && (
            <b className="tech-nav-badge">{todayCount}</b>
          )}
        </button>

        <button
          className={`tech-nav-item ${
            activeTab === 'profile' ? 'active' : ''
          }`}
          onClick={() => setActiveTab('profile')}
        >
          <User size={21} />
          <span>حسابي</span>
        </button>
      </nav>
    </div>
  );
}

function AppointmentCard({
  appt,
  expanded,
  onToggle,
  navigate,
}: {
  appt: any;
  expanded: boolean;
  onToggle: () => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const tickets = appt.tickets || [];
  const isCompleted = appt.status === 'completed';

  return (
    <article
      className={`tech-appointment ${
        isCompleted ? 'completed' : ''
      }`}
    >
      <div className="tech-appointment-top">
        <div className="tech-villa-icon">
          <Home size={18} />
        </div>

        <div className="tech-appointment-info">
          <strong>
            فيلا {appt.villaNumber || '---'}
          </strong>

          {appt.projectName && (
            <span>{appt.projectName}</span>
          )}

          {appt.clientName && (
            <small>{appt.clientName}</small>
          )}
        </div>

        <div className="tech-appointment-time">
          <strong>{appt.time || '--:--'}</strong>
          <span>{appt.date}</span>
        </div>
      </div>

      {appt.types?.length > 0 && (
        <div className="tech-tags">
          {appt.types.map((type: string) => (
            <span key={type}>{type}</span>
          ))}
        </div>
      )}

      {appt.notes && (
        <div className="tech-note">
          {appt.notes}
        </div>
      )}

      <div className="tech-appointment-actions">
        <div className="tech-contact-actions">
          {appt.clientPhone && (
            <>
              <a
                href={`https://wa.me/${appt.clientPhone.replace(
                  /\D/g,
                  ''
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="tech-contact whatsapp"
              >
                <MessageCircle size={14} />
                واتساب
              </a>

              <a
                href={`tel:${appt.clientPhone}`}
                className="tech-contact call"
              >
                <Phone size={14} />
              </a>
            </>
          )}
        </div>

        {tickets.length > 0 && (
          <button
            onClick={onToggle}
            className="tech-ticket-toggle"
          >
            <Ticket size={14} />
            {tickets.length} تذاكر
            {expanded ? (
              <ChevronUp size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </button>
        )}
      </div>

      {expanded && tickets.length > 0 && (
        <div className="tech-ticket-list">
          {tickets.map((ticket: any) => (
            <button
              key={ticket.id}
              onClick={() =>
                navigate(`/tech/ticket/${ticket.id}`)
              }
              className="tech-ticket-item"
            >
              <div>
                <strong>
                  {ticket.itemCode ||
                    ticket.id?.slice(0, 8)}
                </strong>

                <span>
                  {ticket.description || 'لا يوجد وصف'}
                </span>
              </div>

              <span className="tech-ticket-status">
                {ticket.status}
              </span>
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
        <strong>{value || 'غير متوفر'}</strong>
      </div>
    </div>
  );
}
