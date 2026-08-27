import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { useTechAuth } from '@/hooks/useTechAuth';
import { TechLang, t } from '@/i18n/tech';
import { techApi } from '@/lib/api';
import TechApp from './TechApp';

export default function TechAppWithRecovery() {
  const { techProfile } = useTechAuth() as any;
  const lang = (techProfile?.language || 'ar') as TechLang;
  const isRtl = lang === 'ar' || lang === 'ur';
  const [activeSession, setActiveSession] = useState<any>(null);
  const [finishing, setFinishing] = useState(false);

  const refreshActive = useCallback(async () => {
    try {
      setActiveSession(await techApi.getActiveSession());
    } catch (error) {
      console.warn('[TechRecovery] active session lookup failed:', error);
    }
  }, []);

  useEffect(() => {
    void refreshActive();
    const timer = window.setInterval(() => void refreshActive(), 15_000);
    return () => window.clearInterval(timer);
  }, [refreshActive]);

  const finishActive = async () => {
    if (!activeSession?.appointmentId || finishing) return;
    if (!window.confirm(t(lang, 'finishAppointmentConfirm'))) return;

    setFinishing(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              timeout: 5_000,
              enableHighAccuracy: true,
            });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {}
      }

      await techApi.finishAppointment(activeSession.appointmentId, { lat, lng });
      toast.success(t(lang, 'finishAppointmentSuccess'));
      setActiveSession(null);
      window.dispatchEvent(new Event('tech-active-appointment-finished'));
    } catch (error: any) {
      toast.error(lang === 'ar' && error?.message ? error.message : t(lang, 'finishAppointmentError'));
      await refreshActive();
    } finally {
      setFinishing(false);
    }
  };

  const appointment = activeSession?.appointment;
  const unitNumber = appointment?.unit?.unitNumber
    || appointment?.tickets?.find((ticket: any) => ticket?.unit?.unitNumber)?.unit?.unitNumber
    || '---';

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
            border: '1px solid rgba(59,130,246,0.45)',
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
              background: 'rgba(59,130,246,0.16)',
              color: '#60a5fa',
              flex: '0 0 auto',
            }}>
              <Timer size={19} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: '#93c5fd', fontWeight: 800 }}>
                {lang === 'ar' ? 'الموعد الجاري الآن' : lang === 'ur' ? 'موجودہ جاری اپائنٹمنٹ' : lang === 'hi' ? 'अभी चल रही अपॉइंटमेंट' : 'Active appointment'}
              </div>
              <div style={{ fontWeight: 900, marginTop: 2 }}>
                {t(lang, 'villa')} {unitNumber} · {appointment.time || '--:--'}
              </div>
              <div style={{ fontSize: 11, opacity: 0.72, marginTop: 2 }}>
                {appointment.date}
              </div>
            </div>
            <button
              onClick={finishActive}
              disabled={finishing}
              style={{
                minHeight: 42,
                padding: '0 13px',
                borderRadius: 12,
                border: 0,
                display: 'inline-flex',
                gap: 7,
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                background: '#dc2626',
                color: '#fff',
                cursor: finishing ? 'wait' : 'pointer',
              }}
            >
              {finishing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {t(lang, 'finishAppointment')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
