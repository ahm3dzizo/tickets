import { useCallback, useEffect, useMemo, useState } from 'react';
import { Briefcase, Loader2, MapPin, Navigation, Pause, Play, Timer } from 'lucide-react';
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

export default function TechAppWithRecovery() {
  const navigate = useNavigate();
  const [activeSession, setActiveSession] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
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
  const isRtl = lang === 'ar' || lang === 'ur';

  const unitNumber = useMemo(() => (
    appointment?.unit?.unitNumber
      || appointment?.tickets?.find((ticket: any) => ticket?.unit?.unitNumber)?.unit?.unitNumber
      || '---'
  ), [appointment]);

  const firstActionableTicketId = useMemo(() => {
    const tickets = appointment?.tickets || [];
    const unresolved = tickets.find((ticket: any) =>
      ['open', 'pending', 'in_progress', 'note'].includes(String(ticket?.status || '').toLowerCase())
    );
    return unresolved?.id || tickets[0]?.id || null;
  }, [appointment]);

  const openActiveWork = () => {
    if (firstActionableTicketId) {
      navigate(`/tech/ticket/${firstActionableTicketId}`);
      return;
    }
    navigate('/tech/appointments');
  };

  const runPrimaryAction = async () => {
    if (!activeSession?.appointmentId || actionLoading) return;

    if (phase === 'in_progress') {
      openActiveWork();
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
      default: return t(lang, 'appointmentInProgress');
    }
  })();

  const primaryLabel = (() => {
    switch (phase) {
      case 'claimed': return visitT(lang, 'startTravel');
      case 'en_route': return visitT(lang, 'markArrived');
      case 'arrived': return visitT(lang, 'startWork');
      case 'paused': return t(lang, 'resume');
      default: return visitT(lang, 'continueWork');
    }
  })();

  const phaseIcon = (() => {
    switch (phase) {
      case 'claimed': return <Play size={19} />;
      case 'en_route': return <Navigation size={19} />;
      case 'arrived': return <MapPin size={19} />;
      case 'in_progress': return <Timer size={19} />;
      case 'paused': return <Pause size={19} />;
      default: return <Briefcase size={19} />;
    }
  })();

  const buttonIcon = (() => {
    if (actionLoading) return <Loader2 size={16} className="animate-spin" />;
    switch (phase) {
      case 'claimed': return <Navigation size={16} />;
      case 'en_route': return <MapPin size={16} />;
      case 'arrived': return <Briefcase size={16} />;
      case 'paused': return <Play size={16} />;
      default: return <Play size={16} />;
    }
  })();

  return (
    <>
      <TechApp />
      {activeSession && appointment && (
        <div
          dir={isRtl ? 'rtl' : 'ltr'}
          style={{
            position: 'fixed',
            left: 12,
            right: 12,
            bottom: 88,
            zIndex: 90,
            borderRadius: 18,
            padding: 14,
            background: 'rgba(9, 25, 45, 0.98)',
            border: isPaused
              ? '1px solid rgba(245,158,11,0.5)'
              : '1px solid rgba(59,130,246,0.45)',
            boxShadow: '0 14px 40px rgba(0,0,0,0.35)',
            color: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isPaused ? 'rgba(245,158,11,0.16)' : 'rgba(59,130,246,0.16)',
              color: isPaused ? '#fbbf24' : '#60a5fa',
              flex: '0 0 auto',
            }}>
              {phaseIcon}
            </div>

            <button
              type="button"
              onClick={() => navigate('/tech/appointments')}
              style={{
                minWidth: 0,
                flex: 1,
                border: 0,
                background: 'transparent',
                color: 'inherit',
                textAlign: 'start',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <div style={{ fontSize: 12, color: isPaused ? '#fcd34d' : '#93c5fd', fontWeight: 800 }}>
                {phaseTitle}
              </div>
              <div style={{ fontWeight: 900, marginTop: 2 }}>
                {t(lang, 'villa')} {unitNumber} · {appointment.time || '--:--'}
              </div>
              <div style={{ fontSize: 11, opacity: 0.72, marginTop: 2 }}>
                {appointment.date}
              </div>
            </button>

            <button
              onClick={runPrimaryAction}
              disabled={actionLoading}
              className={isPaused ? 'tech-btn tech-btn-success' : 'tech-btn'}
              style={{
                minHeight: 42,
                padding: '0 13px',
                flex: '0 0 auto',
                background: isPaused ? undefined : '#2563eb',
                color: '#fff',
              }}
            >
              {buttonIcon}
              {primaryLabel}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
