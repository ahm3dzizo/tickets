import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTechAuth } from '@/hooks/useTechAuth';
import { TechLang, t } from '@/i18n/tech';
import { hasTechTaxonomy, translateTechTaxonomy } from '@/i18n/techTaxonomy';
import { techApi } from '@/lib/api';
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Phone,
  MessageCircle,
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
  Hourglass,
  HardHat,
  Ban,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import './tech.css';

type TicketOutcome = 'completed' | 'waiting' | 'contractor' | 'out_of_scope' | 'absent';

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
  detectedTypes?: string[];
  typeLabels?: Record<string, string>;
  closureNotes?: string;
  latitude?: number;
  longitude?: number;
  createdAt?: string;
  issuedAt?: string;
  updatedAt?: string;
  appointmentId?: string;
  appointment?: any;
  appointmentSession?: any;
  [key: string]: any;
}

const statusLabel = (lang: TechLang, status?: string) => {
  switch (status?.toLowerCase()) {
    case 'claimed':
    case 'assigned':
    case 'open':
    case 'pending': return t(lang, 'status_CLAIMED');
    case 'en_route':
    case 'traveling': return t(lang, 'status_EN_ROUTE');
    case 'arrived': return t(lang, 'arrived');
    case 'in_progress': return t(lang, 'status_IN_PROGRESS');
    case 'paused': return t(lang, 'status_PAUSED');
    case 'completed': return t(lang, 'status_COMPLETED');
    case 'closed': return t(lang, 'status_CLOSED');
    case 'waiting': return t(lang, 'status_WAITING');
    case 'out_of_scope': return t(lang, 'status_OUT_OF_SCOPE');
    case 'absent': return t(lang, 'status_ABSENT');
    case 'contractor': return t(lang, 'status_CONTRACTOR');
    case 'note': return t(lang, 'status_NOTE');
    case 'cancelled': return t(lang, 'status_CANCELLED');
    default: return t(lang, 'status_UNKNOWN');
  }
};

const statusClass = (status?: string) => {
  switch (status?.toLowerCase()) {
    case 'waiting':
    case 'paused': return 'tech-status-warning';
    case 'completed':
    case 'closed': return 'tech-status-success';
    case 'out_of_scope':
    case 'absent': return 'tech-status-warning';
    default: return 'tech-status-info';
  }
};

const OUTCOME_META: Record<TicketOutcome, {
  icon: React.ReactNode;
  className: string;
}> = {
  completed: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
  },
  waiting: {
    icon: <Hourglass className="w-4 h-4" />,
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
  },
  contractor: {
    icon: <HardHat className="w-4 h-4" />,
    className: 'border-blue-500/30 bg-blue-500/10 text-blue-500',
  },
  out_of_scope: {
    icon: <Ban className="w-4 h-4" />,
    className: 'border-violet-500/30 bg-violet-500/10 text-violet-500',
  },
  absent: {
    icon: <UserX className="w-4 h-4" />,
    className: 'border-rose-500/30 bg-rose-500/10 text-rose-500',
  },
};

export default function TechTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, techProfile } = useTechAuth();
  const rootRef = useRef<HTMLDivElement>(null);
  const lang = (techProfile?.language || 'ar') as TechLang;
  const isRtl = lang === 'ar' || lang === 'ur';

  useEffect(() => {
    const stored = (() => {
      try { return localStorage.getItem('tech-theme') || 'system'; }
      catch { return 'system'; }
    })();
    const el = rootRef.current;
    if (!el) return;
    if (stored === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', stored);
  }, []);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<TicketOutcome>('completed');
  const [notes, setNotes] = useState('');
  const [dynamicTranslations, setDynamicTranslations] = useState<Record<string, string>>({});

  const fetchTicket = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const authToken = token || localStorage.getItem('tech_token') || '';
      const res = await fetch(`/api/tech/tickets/${id}`, {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        if (res.status === 401 || body?.code === 'TECHNICIAN_DISABLED') {
          throw new Error(body.error || t(lang, 'ticketLoadError'));
        }
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      setTicket(await res.json());
    } catch (err: any) {
      console.error('Failed to load ticket:', err);
      setError(lang === 'ar' && err?.message ? err.message : t(lang, 'ticketLoadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTicket();
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
    add(ticket.notes);
    add(ticket.closureNotes);
    for (const label of Object.values(ticket.typeLabels || {})) add(String(label));
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
    return dynamicTranslations[value.trim()] || value;
  };

  const translateType = (value?: string | null) => {
    if (!value) return '';
    if (hasTechTaxonomy(value)) return translateTechTaxonomy(value, lang);
    const sourceLabel = ticket?.typeLabels?.[value] || value;
    return lang === 'ar' ? sourceLabel : translateText(sourceLabel);
  };

  const ticketTypes = [...new Set(
    (ticket?.detectedTypes?.length ? ticket.detectedTypes : [ticket?.type])
      .filter((value): value is string => typeof value === 'string' && !!value.trim())
  )];

  const normalizedStatus = String(ticket?.status || '').toLowerCase();
  const sessionStatus = String(ticket?.appointmentSession?.status || '').toLowerCase();
  const terminalStatus = ['completed', 'closed', 'out_of_scope', 'absent'].includes(normalizedStatus);
  const hasVisitOutcome = [...Object.keys(OUTCOME_META), 'closed'].includes(normalizedStatus);
  const canSetOutcome = sessionStatus === 'in_progress' && !terminalStatus;

  const locationUrl = useMemo(() => {
    if (typeof ticket?.latitude !== 'number' || typeof ticket?.longitude !== 'number') return null;
    return `https://www.google.com/maps?q=${ticket.latitude},${ticket.longitude}`;
  }, [ticket]);

  const handleOutcome = async () => {
    if (!ticket?.id) return;
    const appointmentId = ticket.appointmentId || ticket.appointment?.id;
    if (!appointmentId) {
      toast.error(t(lang, 'ticketNotLinked'));
      return;
    }
    if (notes.trim().length < 3) {
      toast.error(lang === 'ar' ? 'اكتب ملاحظة توضح نتيجة التذكرة' : 'Add a note explaining the ticket outcome');
      return;
    }

    setActionLoading(true);
    try {
      const updated = await techApi.updateTicketStatus(
        appointmentId,
        ticket.id,
        selectedOutcome,
        notes.trim(),
      );
      setTicket(prev => ({ ...(prev || {}), ...updated, status: updated?.status || selectedOutcome }));
      setShowOutcomeModal(false);
      toast.success(statusLabel(lang, selectedOutcome));
      window.setTimeout(() => navigate('/tech', { replace: true }), 450);
    } catch (err: any) {
      console.error(err);
      toast.error(lang === 'ar' && err?.message ? err.message : t(lang, 'finishTicketError'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="tech-app flex items-center justify-center min-h-[100dvh]" dir={isRtl ? 'rtl' : 'ltr'} ref={rootRef}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm text-[var(--tech-text-muted)]">{t(lang, 'ticketLoading')}</span>
        </div>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="tech-app min-h-[100dvh]" dir={isRtl ? 'rtl' : 'ltr'} ref={rootRef}>
        <div className="tech-header">
          <button onClick={() => navigate('/tech')} className="p-2 rounded-xl hover:bg-muted" aria-label={t(lang, 'backHome')}>
            {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </button>
          <div className="font-black">{t(lang, 'ticket')}</div>
          <button onClick={fetchTicket} className="p-2 rounded-xl hover:bg-muted" aria-label={t(lang, 'retry')}>
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
        <div className="tech-container">
          <div className="tech-card text-center py-12">
            <AlertCircle className="w-10 h-10 mx-auto mb-4 text-rose-500" />
            <div className="font-black text-base mb-2">{t(lang, 'ticketLoadError')}</div>
            <div className="text-xs text-[var(--tech-text-muted)] mb-6">{error || t(lang, 'ticketNotFound')}</div>
            <button onClick={fetchTicket} className="tech-btn tech-btn-primary">
              <RefreshCw className="w-4 h-4" />{t(lang, 'retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const ticketRef = ticket.ref || ticket.itemCode || ticket.ticketId || ticket.id.slice(0, 8);
  const villa = ticket.villa || ticket.unitNumber || t(lang, 'unknownVilla');

  return (
    <div className="tech-app min-h-[100dvh]" dir={isRtl ? 'rtl' : 'ltr'} ref={rootRef}>
      <div className="tech-header">
        <button onClick={() => navigate('/tech')} className="p-2 rounded-xl hover:bg-muted transition-colors" aria-label={t(lang, 'backHome')}>
          {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
        </button>
        <div className="flex-1 text-center min-w-0">
          <div className="text-[10px] text-[var(--tech-text-muted)]">{t(lang, 'ticket')}</div>
          <div className="font-black text-sm truncate">{ticketRef}</div>
        </div>
        <button onClick={fetchTicket} disabled={loading} className="p-2 rounded-xl hover:bg-muted transition-colors" aria-label={t(lang, 'refresh')}>
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="tech-container pb-28">
        <div className="tech-card overflow-hidden relative">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 shrink-0 rounded-2xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-[var(--tech-text-muted)]">{t(lang, 'ticketNumber')}</div>
                <div className="font-black text-lg truncate">{ticketRef}</div>
                {ticket.specialty && (
                  <div className="text-xs text-[var(--tech-text-muted)] mt-0.5">{translateTechTaxonomy(ticket.specialty, lang)}</div>
                )}
              </div>
            </div>
            <span className={`tech-status-badge ${statusClass(ticket.status)}`}>{statusLabel(lang, ticket.status)}</span>
          </div>
          {ticket.createdAt && (
            <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-[var(--tech-border)] text-[10px] text-[var(--tech-text-muted)]">
              <Clock3 className="w-3.5 h-3.5" />
              <span>{new Date(ticket.createdAt).toLocaleString(lang === 'ar' ? 'ar-SA' : undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </div>
          )}
        </div>

        {['in_progress', 'paused'].includes(sessionStatus) && (
          <AppointmentSessionBanner session={ticket.appointmentSession} navigate={navigate} lang={lang} />
        )}

        <div className="tech-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center"><Home className="w-5 h-5" /></div>
            <div>
              <div className="text-[10px] text-[var(--tech-text-muted)]">{t(lang, 'location')}</div>
              <div className="font-black text-base">{t(lang, 'villa')} {villa}</div>
            </div>
          </div>
          {ticket.projectName && (
            <div className="p-3 rounded-xl bg-muted/50 border border-border text-sm">
              <div className="text-[10px] text-[var(--tech-text-muted)] mb-1">{t(lang, 'project')}</div>
              <div className="font-bold">{ticket.projectName}</div>
            </div>
          )}
          {locationUrl && (
            <a href={locationUrl} target="_blank" rel="noopener noreferrer" className="mt-3 tech-btn tech-btn-outline">
              <MapPin className="w-4 h-4 text-primary" />{t(lang, 'openMap')}<ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {(ticket.clientName || ticket.clientPhone) && (
          <div className="tech-card">
            <div className="flex items-center gap-2 mb-3"><User className="w-4 h-4 text-primary" /><span className="font-black text-sm">{t(lang, 'clientDetails')}</span></div>
            {ticket.clientName && <div className="font-bold text-sm mb-3">{ticket.clientName}</div>}
            {ticket.clientPhone && (
              <div className="grid grid-cols-2 gap-2">
                <a href={`tel:${ticket.clientPhone}`} className="tech-btn tech-btn-success text-xs"><Phone className="w-4 h-4" />{t(lang, 'call')}</a>
                <a href={`https://wa.me/${ticket.clientPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="tech-btn text-xs" style={{ background: '#25D366', color: '#fff' }}>
                  <MessageCircle className="w-4 h-4" />{t(lang, 'whatsapp')}
                </a>
              </div>
            )}
          </div>
        )}

        <div className="tech-card">
          <div className="flex items-center gap-2 mb-3"><FileText className="w-4 h-4 text-primary" /><span className="font-black text-sm">{t(lang, 'problemDescription')}</span></div>
          <div className="p-3.5 rounded-xl text-sm leading-7 whitespace-pre-wrap" style={{ background: 'var(--tech-card-bg, var(--tech-bg-secondary))', border: '1px solid var(--tech-border)' }}>
            {translateText(ticket.description) || t(lang, 'noTicketDescription')}
          </div>

          {ticketTypes.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-black mb-2 text-[var(--tech-text-muted)]">{t(lang, 'classifications')}</div>
              <div className="tech-tags">{ticketTypes.map(type => <span key={type}>{translateType(type)}</span>)}</div>
            </div>
          )}

          {ticket.appointmentNotes && (
            <div className="mt-3 p-3.5 rounded-xl" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <div className="text-xs font-black mb-1" style={{ color: '#f59e0b' }}>{t(lang, 'notes')}</div>
              <div className="text-sm leading-6">{translateText(ticket.appointmentNotes)}</div>
            </div>
          )}

          {(ticket.notes || ticket.closureNotes) && (
            <div className="mt-3 p-3.5 rounded-xl" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
              <div className="text-xs font-black mb-1" style={{ color: '#3b82f6' }}>{t(lang, 'ticketNotes')}</div>
              <div className="text-sm leading-6 whitespace-pre-wrap">{translateText(ticket.notes || ticket.closureNotes)}</div>
            </div>
          )}
        </div>

        {hasVisitOutcome && (
          <div className={`tech-card border ${OUTCOME_META[normalizedStatus as TicketOutcome]?.className || 'border-border'}`}>
            <div className="flex items-center gap-2 font-black text-sm">
              {OUTCOME_META[normalizedStatus as TicketOutcome]?.icon || <CheckCircle2 className="w-4 h-4" />}
              {statusLabel(lang, normalizedStatus)}
            </div>
          </div>
        )}

        {!terminalStatus && (
          <div className="sticky bottom-[78px] z-40 -mx-1">
            <div className="p-2 rounded-2xl bg-[var(--tech-surface)]/95 backdrop-blur-xl border border-[var(--tech-border)] shadow-lg">
              {canSetOutcome ? (
                <button onClick={() => setShowOutcomeModal(true)} disabled={actionLoading} className="tech-btn tech-btn-success">
                  <CheckCircle2 className="w-5 h-5" />
                  {hasVisitOutcome ? t(lang, 'complete') : t(lang, 'finishTicket')}
                  <ChevronRight className="w-4 h-4 opacity-70" />
                </button>
              ) : (
                <div className="text-center text-xs font-bold text-[var(--tech-text-muted)] py-2">
                  {sessionStatus === 'paused'
                    ? t(lang, 'appointmentPaused')
                    : (lang === 'ar' ? 'ابدأ الموعد أولاً لتحديد نتيجة التذكرة' : 'Start the appointment before setting a ticket outcome')}
                </div>
              )}
            </div>
          </div>
        )}

        {terminalStatus && (
          <div className="tech-card border-emerald-500/30 bg-emerald-500/5 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
            <div className="font-black text-emerald-600 dark:text-emerald-400">{statusLabel(lang, normalizedStatus)}</div>
            <button onClick={() => navigate('/tech')} className="tech-btn tech-btn-outline mt-4">{t(lang, 'backHome')}</button>
          </div>
        )}
      </div>

      {showOutcomeModal && (
        <OutcomeModal
          lang={lang}
          selected={selectedOutcome}
          notes={notes}
          loading={actionLoading}
          onSelected={setSelectedOutcome}
          onNotes={setNotes}
          onClose={() => setShowOutcomeModal(false)}
          onSubmit={handleOutcome}
        />
      )}
    </div>
  );
}

function OutcomeModal({
  lang,
  selected,
  notes,
  loading,
  onSelected,
  onNotes,
  onClose,
  onSubmit,
}: {
  lang: TechLang;
  selected: TicketOutcome;
  notes: string;
  loading: boolean;
  onSelected: (value: TicketOutcome) => void;
  onNotes: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const outcomes: TicketOutcome[] = ['completed', 'waiting', 'contractor', 'out_of_scope', 'absent'];
  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="w-full max-w-lg bg-[var(--tech-card)] rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] slide-up border border-[var(--tech-border)]" onClick={event => event.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center"><CheckCircle2 className="w-6 h-6" /></div>
          <div>
            <div className="font-black text-lg">{t(lang, 'finishTicket')}</div>
            <div className="text-xs text-[var(--tech-text-muted)]">{lang === 'ar' ? 'حدد النتيجة الفعلية للعمل' : 'Choose the actual work outcome'}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {outcomes.map(outcome => {
            const meta = OUTCOME_META[outcome];
            return (
              <button
                key={outcome}
                type="button"
                onClick={() => onSelected(outcome)}
                className={`min-h-12 rounded-xl border px-3 py-2 text-xs font-black flex items-center justify-center gap-2 transition-all ${selected === outcome ? meta.className : 'border-[var(--tech-border)] bg-transparent text-[var(--tech-text)]'}`}
              >
                {meta.icon}{statusLabel(lang, outcome)}
              </button>
            );
          })}
        </div>

        <textarea
          className="tech-input min-h-[120px] resize-none"
          value={notes}
          onChange={event => onNotes(event.target.value.slice(0, 2000))}
          placeholder={t(lang, 'finishPlaceholder')}
          autoFocus
        />
        <div className="text-[10px] text-[var(--tech-text-muted)] mt-1">{notes.length}/2000</div>

        <div className="grid grid-cols-2 gap-3 mt-4">
          <button onClick={onClose} disabled={loading} className="tech-btn tech-btn-outline">{t(lang, 'cancel')}</button>
          <button onClick={onSubmit} disabled={loading || notes.trim().length < 3} className="tech-btn tech-btn-success">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
            {t(lang, 'confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

function AppointmentSessionBanner({
  session,
  navigate,
  lang,
}: {
  session: any;
  navigate: ReturnType<typeof useNavigate>;
  lang: TechLang;
}) {
  const isPaused = session?.status === 'paused';
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (isPaused) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isPaused]);

  const start = session?.claimedAt ? new Date(session.claimedAt).getTime() : now;
  const end = isPaused && session?.pausedAt ? new Date(session.pausedAt).getTime() : now;
  const pauseSecs = (session?.totalPausedMins || 0) * 60;
  const secs = Math.max(0, Math.floor((end - start) / 1000) - pauseSecs);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const label = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;

  const color = isPaused ? '#f59e0b' : '#3b82f6';
  const background = isPaused
    ? 'linear-gradient(90deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))'
    : 'linear-gradient(90deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))';

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', marginTop: 12, borderRadius: 14, background, border: `1px solid ${color}55` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: `${color}22`, color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Clock3 className="w-4 h-4" />
        </div>
        <div>
          <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 2 }}>{t(lang, isPaused ? 'appointmentPaused' : 'appointmentInProgress')}</div>
          <div style={{ fontWeight: 900, fontSize: 16, fontVariantNumeric: 'tabular-nums', color }}>{label}{isPaused && <span style={{ fontSize: 11, marginInlineStart: 6 }}>⏸</span>}</div>
        </div>
      </div>
      <button onClick={() => navigate('/tech')} className="tech-btn" style={{ fontSize: 11, padding: '6px 10px', background: `${color}22`, border: `1px solid ${color}30`, color }}>
        {t(lang, 'fullAppointment')}
      </button>
    </div>
  );
}
