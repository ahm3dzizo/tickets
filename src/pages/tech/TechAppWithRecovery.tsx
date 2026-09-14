import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Briefcase,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  MapPin,
  Navigation,
  Pause,
  Play,
  Timer,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { TechLang, t } from '@/i18n/tech';
import { visitT } from '@/i18n/techVisit';
import { techApi } from '@/lib/api';
import { collectTechLocation } from '@/lib/techLocation';
import { techVisitApi, type TechVisitPhase } from '@/lib/techVisitApi';
import TechApp from './TechApp';

function getStoredTechLanguage(): TechLang {
  try {
    const storedProfile = localStorage.getItem('tech_profile');
    if (storedProfile) {
      const profile = JSON.parse(storedProfile);
      if (['ar', 'en', 'hi', 'ur'].includes(profile?.language)) return profile.language;
    }
    const storedLanguage = localStorage.getItem('tech_language');
    if (storedLanguage && ['ar', 'en', 'hi', 'ur'].includes(storedLanguage)) {
      return storedLanguage as TechLang;
    }
  } catch {}
  return 'ar';
}

function historyLabel(lang: TechLang): string {
  if (lang === 'en') return 'History';
  if (lang === 'hi') return 'इतिहास';
  if (lang === 'ur') return 'ریکارڈ';
  return 'السجل';
}

function recoveryCopy(
  lang: TechLang,
  key:
    | 'supervisorClosed'
    | 'recordDuration'
    | 'hours'
    | 'minutes'
    | 'saveDuration'
    | 'durationSaved'
    | 'invalidDuration'
    | 'finishVisit'
    | 'remainingTickets',
): string {
  const ar = {
    supervisorClosed: 'الموعد انتهى بواسطة المشرف',
    recordDuration: 'سجّل مدة العمل الفعلية التي قضيتها في هذا الموعد.',
    hours: 'ساعات',
    minutes: 'دقائق',
    saveDuration: 'حفظ مدة العمل',
    durationSaved: 'تم حفظ مدة العمل وإغلاق الجلسة',
    invalidDuration: 'أدخل مدة عمل صحيحة',
    finishVisit: 'إنهاء الموعد',
    remainingTickets: 'متابعة التذاكر',
  };
  const en = {
    supervisorClosed: 'Appointment closed by supervisor',
    recordDuration: 'Record the actual time you worked on this appointment.',
    hours: 'Hours',
    minutes: 'Minutes',
    saveDuration: 'Save work time',
    durationSaved: 'Work time saved and visit closed',
    invalidDuration: 'Enter a valid work duration',
    finishVisit: 'Finish appointment',
    remainingTickets: 'Continue tickets',
  };
  const hi = {
    supervisorClosed: 'सुपरवाइज़र ने अपॉइंटमेंट बंद कर दिया',
    recordDuration: 'इस अपॉइंटमेंट पर वास्तविक काम का समय दर्ज करें।',
    hours: 'घंटे',
    minutes: 'मिनट',
    saveDuration: 'समय सेव करें',
    durationSaved: 'काम का समय सेव हो गया',
    invalidDuration: 'सही कार्य अवधि दर्ज करें',
    finishVisit: 'अपॉइंटमेंट समाप्त करें',
    remainingTickets: 'टिकट जारी रखें',
  };
  const ur = {
    supervisorClosed: 'سپروائزر نے اپائنٹمنٹ بند کر دی',
    recordDuration: 'اس اپائنٹمنٹ پر اصل کام کا وقت درج کریں۔',
    hours: 'گھنٹے',
    minutes: 'منٹ',
    saveDuration: 'کام کا وقت محفوظ کریں',
    durationSaved: 'کام کا وقت محفوظ ہو گیا',
    invalidDuration: 'درست دورانیہ درج کریں',
    finishVisit: 'اپائنٹمنٹ ختم کریں',
    remainingTickets: 'ٹکٹس جاری رکھیں',
  };
  return (lang === 'en' ? en : lang === 'hi' ? hi : lang === 'ur' ? ur : ar)[key];
}

export default function TechAppWithRecovery() {
  const navigate = useNavigate();
  const [activeSession, setActiveSession] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [durationHours, setDurationHours] = useState('0');
  const [durationMinutes, setDurationMinutes] = useState('0');
  const [lang, setLang] = useState<TechLang>(getStoredTechLanguage);

  const refreshActive = useCallback(async () => {
    try {
      const session = await techApi.getActiveSession();
      setActiveSession(session);
      setLang(getStoredTechLanguage());
    } catch (error: any) {
      console.warn('[TechRecovery] active session lookup failed:', error);
    }
  }, []);

  useEffect(() => {
    void refreshActive();

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void refreshActive();
    };
    const onFinished = () => void refreshActive();

    const timer = window.setInterval(refreshIfVisible, 120_000);
    window.addEventListener('tech-active-appointment-finished', onFinished);
    window.addEventListener('online', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('tech-active-appointment-finished', onFinished);
      window.removeEventListener('online', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [refreshActive]);

  const appointment = activeSession?.appointment;
  const phase = (activeSession?.status || null) as TechVisitPhase | null;
  const isPaused = phase === 'paused';
  const isAwaitingDuration = phase === 'awaiting_duration';
  const isRtl = lang === 'ar' || lang === 'ur';

  const unitNumber = useMemo(() => (
    appointment?.unit?.unitNumber
      || appointment?.tickets?.find((ticket: any) => ticket?.unit?.unitNumber)?.unit?.unitNumber
      || '---'
  ), [appointment]);

  const unresolvedTickets = useMemo(() => {
    const tickets = appointment?.tickets || [];
    return tickets.filter((ticket: any) =>
      ['open', 'pending', 'in_progress', 'note'].includes(String(ticket?.status || '').toLowerCase())
    );
  }, [appointment]);

  const firstActionableTicketId = useMemo(() => {
    const tickets = appointment?.tickets || [];
    return unresolvedTickets[0]?.id || tickets[0]?.id || null;
  }, [appointment, unresolvedTickets]);

  const openActiveWork = () => {
    if (firstActionableTicketId) {
      navigate(`/tech/ticket/${firstActionableTicketId}`);
      return;
    }
    navigate('/tech');
  };

  const finishCurrentVisit = async () => {
    if (!activeSession?.appointmentId || actionLoading) return;
    if (unresolvedTickets.length > 0) {
      openActiveWork();
      return;
    }
    if (!window.confirm(t(lang, 'finishAppointmentConfirm'))) return;

    setActionLoading(true);
    try {
      const location = await collectTechLocation(lang);
      await techApi.finishAppointment(activeSession.appointmentId, {
        lat: location.lat,
        lng: location.lng,
        accuracy: location.accuracy,
      } as any);
      toast.success(t(lang, 'finishAppointmentSuccess'));
      setActiveSession(null);
      window.dispatchEvent(new Event('tech-active-appointment-finished'));
      await refreshActive();
    } catch (error: any) {
      toast.error(lang === 'ar' && error?.message ? error.message : t(lang, 'finishAppointmentError'));
      await refreshActive();
    } finally {
      setActionLoading(false);
    }
  };

  const confirmDuration = async () => {
    if (!activeSession?.appointmentId || actionLoading) return;
    const hours = Number.parseInt(durationHours || '0', 10);
    const mins = Number.parseInt(durationMinutes || '0', 10);
    const totalMinutes = hours * 60 + mins;

    if (
      !Number.isFinite(hours)
      || !Number.isFinite(mins)
      || hours < 0
      || hours > 24
      || mins < 0
      || mins > 59
      || totalMinutes < 0
      || totalMinutes > 1440
    ) {
      toast.error(recoveryCopy(lang, 'invalidDuration'));
      return;
    }

    setActionLoading(true);
    try {
      await techVisitApi.confirmDuration(activeSession.appointmentId, totalMinutes);
      toast.success(recoveryCopy(lang, 'durationSaved'));
      setActiveSession(null);
      setDurationHours('0');
      setDurationMinutes('0');
      window.dispatchEvent(new Event('tech-active-appointment-finished'));
      await refreshActive();
    } catch (error: any) {
      toast.error(error?.message || recoveryCopy(lang, 'invalidDuration'));
      await refreshActive();
    } finally {
      setActionLoading(false);
    }
  };

  const runPrimaryAction = async () => {
    if (!activeSession?.appointmentId || actionLoading) return;

    if (phase === 'in_progress') {
      if (unresolvedTickets.length === 0) {
        await finishCurrentVisit();
      } else {
        openActiveWork();
      }
      return;
    }

    setActionLoading(true);
    try {
      if (phase === 'paused') {
        await techApi.resumeAppointment(activeSession.appointmentId);
        toast.success(t(lang, 'resumeSuccess'));
      } else if (phase === 'claimed') {
        await techVisitApi.travel(activeSession.appointmentId);
        toast.success(visitT(lang, 'enRoute'));
      } else if (phase === 'en_route') {
        const location = await collectTechLocation(lang);
        await techVisitApi.arrive(activeSession.appointmentId, location);
        toast.success(visitT(lang, 'arrived'));
      } else if (phase === 'arrived') {
        const location = await collectTechLocation(lang);
        await techVisitApi.startWork(activeSession.appointmentId, location);
        toast.success(visitT(lang, 'workInProgress'));
      }

      await refreshActive();
      if (phase === 'arrived') openActiveWork();
    } catch (error: any) {
      if (phase === 'paused') {
        toast.error(lang === 'ar' && error?.message ? error.message : t(lang, 'resumeError'));
      } else {
        toast.error(lang === 'ar' && error?.message ? error.message : visitT(lang, 'phaseActionFailed'));
      }
      await refreshActive();
    } finally {
      setActionLoading(false);
    }
  };

  const phaseTitle = (() => {
    switch (phase) {
      case 'claimed': return visitT(lang, 'claimed');
      case 'en_route': return visitT(lang, 'enRoute');
      case 'arrived': return visitT(lang, 'arrived');
      case 'in_progress': return visitT(lang, 'workInProgress');
      case 'paused': return t(lang, 'appointmentPaused');
      case 'awaiting_duration': return recoveryCopy(lang, 'supervisorClosed');
      default: return t(lang, 'appointmentInProgress');
    }
  })();

  const primaryLabel = (() => {
    switch (phase) {
      case 'claimed': return visitT(lang, 'startTravel');
      case 'en_route': return visitT(lang, 'markArrived');
      case 'arrived': return visitT(lang, 'startWork');
      case 'paused': return t(lang, 'resume');
      case 'in_progress': return unresolvedTickets.length === 0
        ? recoveryCopy(lang, 'finishVisit')
        : `${recoveryCopy(lang, 'remainingTickets')} (${unresolvedTickets.length})`;
      default: return visitT(lang, 'continueWork');
    }
  })();

  const phaseIcon = (() => {
    switch (phase) {
      case 'claimed': return <Play size={18} />;
      case 'en_route': return <Navigation size={18} />;
      case 'arrived': return <MapPin size={18} />;
      case 'in_progress': return <Timer size={18} />;
      case 'paused': return <Pause size={18} />;
      case 'awaiting_duration': return <Clock3 size={18} />;
      default: return <Briefcase size={18} />;
    }
  })();

  const buttonIcon = (() => {
    if (actionLoading) return <Loader2 size={16} className="animate-spin" />;
    switch (phase) {
      case 'claimed': return <Navigation size={16} />;
      case 'en_route': return <MapPin size={16} />;
      case 'arrived': return <Briefcase size={16} />;
      case 'paused': return <Play size={16} />;
      case 'in_progress': return unresolvedTickets.length === 0
        ? <CheckCircle2 size={16} />
        : <Play size={16} />;
      default: return <Play size={16} />;
    }
  })();

  return (
    <>
      <TechApp />

      {!activeSession && (
        <button
          type="button"
          onClick={() => navigate('/tech/history')}
          aria-label={historyLabel(lang)}
          style={{
            position: 'fixed',
            insetInlineEnd: 14,
            bottom: 'calc(82px + env(safe-area-inset-bottom, 0px))',
            zIndex: 65,
            minHeight: 40,
            borderRadius: 999,
            padding: '0 13px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            border: '1px solid var(--tech-border, rgba(100,116,139,0.25))',
            background: 'var(--tech-card, rgba(255,255,255,0.96))',
            color: 'var(--tech-text, #0f172a)',
            boxShadow: '0 8px 22px rgba(15,23,42,0.15)',
            fontSize: 12,
            fontWeight: 850,
          }}
        >
          <History size={15} />
          {historyLabel(lang)}
        </button>
      )}

      {activeSession && appointment && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          style={{
            position: 'fixed',
            left: 12,
            right: 12,
            bottom: 'calc(78px + env(safe-area-inset-bottom, 0px))',
            zIndex: 90,
            width: 'calc(100% - 24px)',
            maxWidth: 520,
            marginInline: 'auto',
            borderRadius: 20,
            padding: 14,
            background: 'var(--tech-card, #ffffff)',
            border: isAwaitingDuration
              ? '1px solid rgba(245,158,11,0.35)'
              : isPaused
                ? '1px solid rgba(245,158,11,0.3)'
                : '1px solid rgba(37,99,235,0.22)',
            boxShadow: '0 16px 44px rgba(15,23,42,0.22)',
            color: 'var(--tech-text, #0f172a)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isAwaitingDuration
                ? 'rgba(245,158,11,0.12)'
                : isPaused
                  ? 'rgba(245,158,11,0.12)'
                  : 'rgba(37,99,235,0.10)',
              color: isAwaitingDuration || isPaused ? '#d97706' : '#2563eb',
              flex: '0 0 auto',
            }}>
              {phaseIcon}
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: 12,
                fontWeight: 900,
                color: isAwaitingDuration || isPaused ? '#d97706' : '#2563eb',
              }}>
                {phaseTitle}
              </div>
              <div style={{ fontSize: 15, fontWeight: 950, marginTop: 2 }}>
                {t(lang, 'villa')} {unitNumber}
                <span style={{ opacity: 0.45, paddingInline: 6 }}>•</span>
                {appointment.time || '--:--'}
              </div>
              <div style={{ fontSize: 11, opacity: 0.62, marginTop: 2 }}>
                {appointment.date}
              </div>
            </div>
          </div>

          {isAwaitingDuration ? (
            <div style={{ marginTop: 12 }}>
              <div style={{
                fontSize: 12,
                lineHeight: 1.6,
                color: 'var(--tech-muted, #64748b)',
                marginBottom: 9,
              }}>
                {recoveryCopy(lang, 'recordDuration')}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--tech-muted, #64748b)' }}>
                    {recoveryCopy(lang, 'hours')}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={24}
                    value={durationHours}
                    onChange={(event) => setDurationHours(event.target.value)}
                    style={{
                      width: '100%',
                      height: 42,
                      borderRadius: 11,
                      border: '1px solid var(--tech-border, #e2e8f0)',
                      background: 'var(--tech-bg, #f8fafc)',
                      color: 'inherit',
                      paddingInline: 12,
                      fontWeight: 850,
                      outline: 'none',
                    }}
                  />
                </label>
                <label style={{ display: 'grid', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--tech-muted, #64748b)' }}>
                    {recoveryCopy(lang, 'minutes')}
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={59}
                    value={durationMinutes}
                    onChange={(event) => setDurationMinutes(event.target.value)}
                    style={{
                      width: '100%',
                      height: 42,
                      borderRadius: 11,
                      border: '1px solid var(--tech-border, #e2e8f0)',
                      background: 'var(--tech-bg, #f8fafc)',
                      color: 'inherit',
                      paddingInline: 12,
                      fontWeight: 850,
                      outline: 'none',
                    }}
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={confirmDuration}
                disabled={actionLoading}
                className="tech-btn"
                style={{
                  width: '100%',
                  minHeight: 44,
                  marginTop: 10,
                  borderRadius: 12,
                  background: '#d97706',
                  color: '#fff',
                  fontWeight: 900,
                }}
              >
                {actionLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {recoveryCopy(lang, 'saveDuration')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={runPrimaryAction}
              disabled={actionLoading}
              className={isPaused ? 'tech-btn tech-btn-success' : 'tech-btn'}
              style={{
                width: '100%',
                minHeight: 44,
                marginTop: 11,
                borderRadius: 12,
                background: isPaused
                  ? undefined
                  : phase === 'in_progress' && unresolvedTickets.length === 0
                    ? '#16a34a'
                    : '#2563eb',
                color: '#fff',
                fontWeight: 900,
              }}
            >
              {buttonIcon}
              {primaryLabel}
            </button>
          )}
        </div>
      )}
    </>
  );
}
