import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pause, Play, Timer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { TechLang, t } from '@/i18n/tech';
import { techApi } from '@/lib/api';
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
  const [resuming, setResuming] = useState(false);
  const [lang, setLang] = useState<TechLang>(getStoredTechLanguage);

  const refreshActive = useCallback(async () => {
    try {
      const session = await techApi.getActiveSession();
      setActiveSession(session);
      setLang(getStoredTechLanguage());
    } catch (error: any) {
      // Keep the last known session if the network is temporarily unavailable.
      // The service worker may also provide a scoped stale fallback.
      console.warn('[TechRecovery] active session lookup failed:', error);
    }
  }, []);

  useEffect(() => {
    void refreshActive();

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void refreshActive();
    };
    const onFinished = () => void refreshActive();

    // A two-minute heartbeat is only a safety net. Mutations refresh explicitly,
    // returning to the app refreshes immediately, and hidden PWAs do not poll.
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
  const isPaused = activeSession?.status === 'paused';
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

  const resumeActive = async () => {
    if (!activeSession?.appointmentId || resuming) return;
    setResuming(true);
    try {
      await techApi.resumeAppointment(activeSession.appointmentId);
      toast.success(t(lang, 'resumeSuccess'));
      await refreshActive();
    } catch (error: any) {
      toast.error(lang === 'ar' && error?.message ? error.message : t(lang, 'resumeError'));
      await refreshActive();
    } finally {
      setResuming(false);
    }
  };

  const openActiveWork = () => {
    if (firstActionableTicketId) {
      navigate(`/tech/ticket/${firstActionableTicketId}`);
      return;
    }
    navigate('/tech/appointments');
  };

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
              {isPaused ? <Pause size={19} /> : <Timer size={19} />}
            </div>

            <button
              type="button"
              onClick={openActiveWork}
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
                {isPaused
                  ? t(lang, 'appointmentPaused')
                  : t(lang, 'appointmentInProgress')}
              </div>
              <div style={{ fontWeight: 900, marginTop: 2 }}>
                {t(lang, 'villa')} {unitNumber} · {appointment.time || '--:--'}
              </div>
              <div style={{ fontSize: 11, opacity: 0.72, marginTop: 2 }}>
                {appointment.date}
              </div>
            </button>

            {isPaused ? (
              <button
                onClick={resumeActive}
                disabled={resuming}
                className="tech-btn tech-btn-success"
                style={{ minHeight: 42, padding: '0 13px', flex: '0 0 auto' }}
              >
                {resuming ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                {t(lang, 'resume')}
              </button>
            ) : (
              <button
                onClick={openActiveWork}
                className="tech-btn"
                style={{
                  minHeight: 42,
                  padding: '0 13px',
                  flex: '0 0 auto',
                  background: '#2563eb',
                  color: '#fff',
                }}
              >
                <Play size={16} />
                {t(lang, 'continueWork')}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
