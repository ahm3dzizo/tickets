import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTechAuth } from '@/hooks/useTechAuth';
import { TechLang, t } from '@/i18n/tech';
import { techApi } from '@/lib/api';
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Phone,
  MessageCircle,
  Navigation,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  AlertCircle,
  Home,
  User,
  FileText,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { TYPE_LABELS_STATIC } from '@/components/tickets/TypesSelector';
import './tech.css';

type TicketStatus =
  | 'CLAIMED'
  | 'ASSIGNED'
  | 'EN_ROUTE'
  | 'TRAVELING'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'CLOSED'
  | string;

interface Ticket {
  id: string;
  ticketId?: string;
  ref?: string;
  itemCode?: string;
  status?: TicketStatus;

  description?: string;
  notes?: string;
  appointmentNotes?: string;

  clientName?: string;
  clientPhone?: string;

  villa?: string;
  unitNumber?: string;
  projectName?: string;
  projectId?: string;

  specialty?: string;
  type?: string;

  latitude?: number;
  longitude?: number;

  createdAt?: string;
  issuedAt?: string;
  updatedAt?: string;

  [key: string]: any;
}

const statusLabel = (lang: TechLang, status?: string) => {
  switch (status?.toLowerCase()) {
    case 'claimed':
    case 'assigned':
    case 'open':
    case 'pending':
      return t(lang, 'status_CLAIMED');
    case 'en_route':
    case 'traveling':
      return t(lang, 'status_EN_ROUTE');
    case 'arrived':
      return t(lang, 'arrived');
    case 'in_progress':
      return t(lang, 'status_IN_PROGRESS');
    case 'paused':
      return t(lang, 'status_PAUSED');
    case 'completed':
      return t(lang, 'status_COMPLETED');
    case 'closed':
      return t(lang, 'status_CLOSED');
    default:
      return status || t(lang, 'status_UNKNOWN');
  }
};

const statusClass = (status?: string) => {
  switch (status?.toLowerCase()) {
    case 'en_route':
    case 'traveling':
      return 'tech-status-info';
    case 'arrived':
    case 'in_progress':
      return 'tech-status-success';
    case 'paused':
      return 'tech-status-warning';
    case 'completed':
    case 'closed':
      return 'tech-status-success';
    default:
      return 'tech-status-info';
  }
};

export default function TechTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, techProfile } = useTechAuth();
  const rootRef = useRef<HTMLDivElement>(null);

  const lang = (techProfile?.language || 'ar') as TechLang;
  const isRtl = lang === 'ar' || lang === 'ur';

  // Sync theme from localStorage (set by TechApp) to this page's root element
  useEffect(() => {
    const stored = (() => { try { return localStorage.getItem('tech-theme') || 'system'; } catch { return 'system'; } })();
    const el = rootRef.current;
    if (!el) return;
    if (stored === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', stored);
  }, []);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [notes, setNotes] = useState('');
  const [dynamicTranslations, setDynamicTranslations] = useState<Record<string, string>>({});

  const fetchTicket = async () => {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const authToken =
        token || localStorage.getItem('tech_token') || '';

      const res = await fetch(`/api/tech/tickets/${id}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({ error: res.statusText }));

        throw new Error(
          body.error || `HTTP ${res.status}`
        );
      }

      const data = await res.json();

      setTicket(data);
    } catch (err: any) {
      console.error('Failed to load ticket:', err);
      setError(err.message || t(lang, 'ticketLoadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTicket();
  }, [id, token]);

  const translationTexts = useMemo(() => {
    if (!ticket) return [];
    const values = new Set<string>();
    const add = (value?: string | null) => {
      const clean = value?.trim();
      if (clean) values.add(clean);
    };
    add(ticket.description);
    add(ticket.appointmentNotes);
    add(TYPE_LABELS_STATIC[ticket.type || ''] ?? ticket.type);
    for (const type of (ticket as any).detectedTypes || []) add(TYPE_LABELS_STATIC[type] ?? type);
    return [...values];
  }, [ticket]);

  useEffect(() => {
    if (lang === 'ar' || translationTexts.length === 0) {
      setDynamicTranslations({});
      return;
    }
    let cancelled = false;
    techApi.translateTexts(translationTexts, lang)
      .then(result => { if (!cancelled) setDynamicTranslations(result); })
      .catch(error => console.warn('Ticket translation failed:', error));
    return () => { cancelled = true; };
  }, [lang, translationTexts]);

  const translateText = (value?: string | null) => {
    if (!value || lang === 'ar') return value || '';
    return dynamicTranslations[value] || value;
  };

  const currentStatus = ticket?.status || '';

  const normalizedStatus = currentStatus.toLowerCase();

  const isCompleted =
    normalizedStatus === 'completed' ||
    normalizedStatus === 'closed';

  const canComplete =
    normalizedStatus === 'in_progress';

  const locationUrl = useMemo(() => {
    if (
      typeof ticket?.latitude !== 'number' ||
      typeof ticket?.longitude !== 'number'
    ) {
      return null;
    }

    return `https://www.google.com/maps?q=${ticket.latitude},${ticket.longitude}`;
  }, [ticket]);

  const getCurrentLocation = async () => {
    if (!navigator.geolocation) {
      throw new Error(t(lang, 'locationError'));
    }

    return new Promise<GeolocationPosition>(
      (resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
          }
        );
      }
    );
  };

  const handleComplete = async () => {
    if (!ticket?.id) return;

    const appointmentId = ticket.appointmentId || ticket.appointment?.id;
    if (!appointmentId) {
      toast.error('التذكرة غير مرتبطة بموعد');
      return;
    }

    setActionLoading(true);

    try {
      const updated = await techApi.updateTicketStatus(
        appointmentId,
        ticket.id,
        'completed',
        notes.trim() || undefined
      );

      setTicket((prev) => ({
        ...(prev || {}),
        ...updated,
        status: updated?.status || 'completed',
      }));

      setShowCompleteModal(false);

      toast.success(t(lang, 'finishTicketSuccess'));

      setTimeout(() => {
        navigate(`/tech/appointment/${appointmentId}`);
      }, 700);
    } catch (err: any) {
      console.error(err);
      toast.error(
        err.message || t(lang, 'finishTicketError')
      );
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div
        className="tech-app flex items-center justify-center min-h-[100dvh]"
        dir={isRtl ? 'rtl' : 'ltr'}
        ref={rootRef}
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm text-[var(--tech-text-muted)]">
            {t(lang, 'ticketLoading')}
          </span>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div
        className="tech-app min-h-[100dvh]"
        dir={isRtl ? 'rtl' : 'ltr'}
        ref={rootRef}
      >
        <div className="tech-header">
          <button
            onClick={() => navigate('/tech')}
            className="p-2 rounded-xl hover:bg-muted"
          >
            {isRtl ? (
              <ArrowRight className="w-5 h-5" />
            ) : (
              <ArrowLeft className="w-5 h-5" />
            )}
          </button>

          <div className="font-black">
            {t(lang, 'ticket')}
          </div>

          <button
            onClick={fetchTicket}
            className="p-2 rounded-xl hover:bg-muted"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        <div className="tech-container">
          <div className="tech-card text-center py-12">
            <AlertCircle className="w-10 h-10 mx-auto mb-4 text-rose-500" />

            <div className="font-black text-base mb-2">
              {t(lang, 'ticketLoadError')}
            </div>

            <div className="text-xs text-[var(--tech-text-muted)] mb-6">
              {error || t(lang, 'ticketNotFound')}
            </div>

            <button
              onClick={fetchTicket}
              className="tech-btn tech-btn-primary"
            >
              <RefreshCw className="w-4 h-4" />
              {t(lang, 'retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const ticketRef =
    ticket.ref ||
    ticket.itemCode ||
    ticket.ticketId ||
    ticket.id.slice(0, 8);

  const villa =
    ticket.villa ||
    ticket.unitNumber ||
    t(lang, 'unknownVilla');

  return (
    <div
      className="tech-app min-h-[100dvh]"
      dir={isRtl ? 'rtl' : 'ltr'}
      ref={rootRef}
    >
      {/* Header */}
      <div className="tech-header">
        <button
          onClick={() => navigate('/tech')}
          className="p-2 rounded-xl hover:bg-muted transition-colors"
          aria-label={t(lang, 'backHome')}
        >
          {isRtl ? (
            <ArrowRight className="w-5 h-5" />
          ) : (
            <ArrowLeft className="w-5 h-5" />
          )}
        </button>

        <div className="flex-1 text-center min-w-0">
          <div className="text-[10px] text-[var(--tech-text-muted)]">
            {t(lang, 'ticket')}
          </div>
          <div className="font-black text-sm truncate">
            {ticketRef}
          </div>
        </div>

        <button
          onClick={fetchTicket}
          disabled={loading}
          className="p-2 rounded-xl hover:bg-muted transition-colors"
          aria-label={t(lang, 'refresh')}
        >
          <RefreshCw
            className={`w-5 h-5 ${
              loading ? 'animate-spin' : ''
            }`}
          />
        </button>
      </div>

      <div className="tech-container pb-28">

        {/* Hero */}
        <div className="tech-card overflow-hidden relative">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>

              <div className="min-w-0">
                <div className="text-[10px] text-[var(--tech-text-muted)]">
                  {t(lang, 'ticketNumber')}
                </div>

                <div className="font-black text-lg truncate">
                  {ticketRef}
                </div>

                {ticket.specialty && (
                  <div className="text-xs text-[var(--tech-text-muted)] mt-0.5">
                    {ticket.specialty}
                  </div>
                )}
              </div>
            </div>

            <span
              className={`tech-status-badge ${statusClass(
                currentStatus
              )}`}
            >
              {statusLabel(lang, currentStatus)}
            </span>
          </div>

          {ticket.createdAt && (
            <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-[var(--tech-border)] text-[10px] text-[var(--tech-text-muted)]">
              <Clock3 className="w-3.5 h-3.5" />
              <span>
                {new Date(
                  ticket.createdAt
                ).toLocaleString(
                  lang === 'ar' ? 'ar-SA' : undefined,
                  {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }
                )}
              </span>
            </div>
          )}
        </div>

        {/* Appointment Session Banner — appears whenever this ticket belongs to a claimed appointment */}
        {['in_progress', 'paused'].includes(ticket.appointmentSession?.status) && (
          <AppointmentSessionBanner
            session={ticket.appointmentSession}
            appointmentId={ticket.appointment?.id || ticket.appointmentId}
            navigate={navigate}
          />
        )}

        {/* Location / Villa */}
        <div className="tech-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Home className="w-5 h-5" />
            </div>

            <div>
              <div className="text-[10px] text-[var(--tech-text-muted)]">
                {t(lang, 'location')}
              </div>
              <div className="font-black text-base">
                {t(lang, 'villa')} {villa}
              </div>
            </div>
          </div>

          {ticket.projectName && (
            <div className="p-3 rounded-xl bg-muted/50 border border-border text-sm">
              <div className="text-[10px] text-[var(--tech-text-muted)] mb-1">
                {t(lang, 'project')}
              </div>

              <div className="font-bold">
                {ticket.projectName}
              </div>
            </div>
          )}

          {locationUrl && (
            <a
              href={locationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 tech-btn tech-btn-outline"
            >
              <MapPin className="w-4 h-4 text-primary" />
              {t(lang, 'openMap')}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Client */}
        {(ticket.clientName || ticket.clientPhone) && (
          <div className="tech-card">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-primary" />
              <span className="font-black text-sm">
                {t(lang, 'clientDetails')}
              </span>
            </div>

            {ticket.clientName && (
              <div className="font-bold text-sm mb-3">
                {ticket.clientName}
              </div>
            )}

            {ticket.clientPhone && (
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`tel:${ticket.clientPhone}`}
                  className="tech-btn tech-btn-success text-xs"
                >
                  <Phone className="w-4 h-4" />
                  {t(lang, 'call')}
                </a>

                <a
                  href={`https://wa.me/${ticket.clientPhone.replace(
                    /\D/g,
                    ''
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tech-btn text-xs"
                  style={{
                    background: '#25D366',
                    color: '#fff',
                  }}
                >
                  <MessageCircle className="w-4 h-4" />
                  {t(lang, 'whatsapp')}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        <div className="tech-card">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-black text-sm">
              {t(lang, 'problemDescription')}
            </span>
          </div>

          <div className="p-3.5 rounded-xl text-sm leading-7 whitespace-pre-wrap" style={{ background: 'var(--tech-card-bg, var(--tech-bg-secondary))', border: '1px solid var(--tech-border)' }}>
            {translateText(ticket.description) || t(lang, 'noTicketDescription')}
          </div>

          {ticket.appointmentNotes && (
            <div className="mt-3 p-3.5 rounded-xl" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <div className="text-xs font-black mb-1" style={{ color: '#f59e0b' }}>
                {t(lang, 'notes')}
              </div>
              <div className="text-sm leading-6">
                {translateText(ticket.appointmentNotes)}
              </div>
            </div>
          )}

        </div>

        {/* Main Action */}
        {!isCompleted && (
          <div className="sticky bottom-[78px] z-40 -mx-1">
            <div className="p-2 rounded-2xl bg-[var(--tech-surface)]/95 backdrop-blur-xl border border-[var(--tech-border)] shadow-lg">

              {canComplete && (
                <button
                  onClick={() =>
                    setShowCompleteModal(true)
                  }
                  disabled={actionLoading}
                  className="tech-btn tech-btn-success"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  {t(lang, 'finishTicket')}
                  <ChevronRight className="w-4 h-4 opacity-70" />
                </button>
              )}

            </div>
          </div>
        )}

        {isCompleted && (
          <div className="tech-card border-emerald-500/30 bg-emerald-500/5 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500" />

            <div className="font-black text-emerald-600 dark:text-emerald-400">
              {t(lang, 'finishTicketSuccess')}
            </div>

            <button
              onClick={() => navigate('/tech')}
              className="tech-btn tech-btn-outline mt-4"
            >
              {t(lang, 'backHome')}
            </button>
          </div>
        )}
      </div>

      {/* Complete Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="w-full max-w-lg bg-[var(--tech-card)] rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] slide-up border border-[var(--tech-border)]">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <div>
                <div className="font-black text-lg">
                  {t(lang, 'finishTicket')}
                </div>

                <div className="text-xs text-[var(--tech-text-muted)]">
                  {t(lang, 'finishHint')}
                </div>
              </div>
            </div>

            <textarea
              className="tech-input min-h-[140px] resize-none"
              value={notes}
              onChange={(e) =>
                setNotes(e.target.value)
              }
              placeholder={t(lang, 'finishPlaceholder')}
              autoFocus
            />

            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                onClick={() =>
                  setShowCompleteModal(false)
                }
                disabled={actionLoading}
                className="tech-btn tech-btn-outline"
              >
                {t(lang, 'cancel')}
              </button>

              <button
                onClick={handleComplete}
                disabled={actionLoading}
                className="tech-btn tech-btn-success"
              >
                {actionLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}

                {t(lang, 'confirmFinish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AppointmentSessionBanner({
  session,
  appointmentId,
  navigate,
}: {
  session: any;
  appointmentId?: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const isPaused = session?.status === 'paused';

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (isPaused) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isPaused]);

  const start = session?.claimedAt ? new Date(session.claimedAt).getTime() : now;
  const end = isPaused && session.pausedAt ? new Date(session.pausedAt).getTime() : now;
  const pauseSecs = (session?.totalPausedMins || 0) * 60;
  const secs = Math.max(0, Math.floor((end - start) / 1000) - pauseSecs);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const label = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;

  const color = isPaused ? '#f59e0b' : '#3b82f6';
  const bg = isPaused
    ? 'linear-gradient(90deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))'
    : 'linear-gradient(90deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))';
  const border = isPaused ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(59,130,246,0.35)';
  const iconBg = isPaused ? 'rgba(245,158,11,0.25)' : 'rgba(59,130,246,0.25)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 14px',
        marginTop: 12,
        borderRadius: 14,
        background: bg,
        border,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: iconBg, color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Clock3 className="w-4 h-4" />
        </div>
        <div>
          <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>
            {isPaused ? 'الموعد متوقف مؤقتاً' : 'الموعد جارٍ التنفيذ'}
          </div>
          <div style={{ fontWeight: 900, fontSize: 16, fontVariantNumeric: 'tabular-nums', color }}>
            {label}
            {isPaused && <span style={{ fontSize: 11, marginRight: 6 }}>⏸</span>}
          </div>
        </div>
      </div>
      {appointmentId && (
        <button
          onClick={() => navigate('/tech')}
          className="tech-btn"
          style={{
            fontSize: 11, padding: '6px 10px',
            background: iconBg, border: `1px solid ${color}30`, color,
          }}
        >
          الموعد كامل
        </button>
      )}
    </div>
  );
}
