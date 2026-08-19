import React, { useEffect, useMemo, useState } from 'react';
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

  clientName?: string;
  clientPhone?: string;

  villa?: string;
  villaNumber?: string;
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

const statusLabel = (status?: string) => {
  switch (status) {
    case 'CLAIMED':
      return 'مخصصة للفني';
    case 'ASSIGNED':
      return 'مخصصة للفني';
    case 'EN_ROUTE':
    case 'TRAVELING':
      return 'في الطريق';
    case 'ARRIVED':
      return 'وصل للموقع';
    case 'IN_PROGRESS':
      return 'جاري التنفيذ';
    case 'PAUSED':
      return 'متوقفة مؤقتًا';
    case 'COMPLETED':
      return 'مكتملة';
    case 'CLOSED':
      return 'مغلقة';
    default:
      return status || 'غير معروف';
  }
};

const statusClass = (status?: string) => {
  switch (status) {
    case 'EN_ROUTE':
    case 'TRAVELING':
      return 'tech-status-info';
    case 'ARRIVED':
    case 'IN_PROGRESS':
      return 'tech-status-success';
    case 'PAUSED':
      return 'tech-status-warning';
    case 'COMPLETED':
    case 'CLOSED':
      return 'tech-status-success';
    default:
      return 'tech-status-info';
  }
};

export default function TechTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, techProfile } = useTechAuth();

  const lang = (techProfile?.language || 'ar') as TechLang;
  const isRtl = lang === 'ar' || lang === 'ur';

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [notes, setNotes] = useState('');

  const fetchTicket = async () => {
    if (!id) return;

    setLoading(true);
    setError(null);

    try {
      const authToken =
        token || localStorage.getItem('tech_token') || '';

      const res = await fetch(`/api/tickets/${id}`, {
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
      setError(err.message || 'فشل تحميل التذكرة');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTicket();
  }, [id, token]);

  const currentStatus = ticket?.status || '';

  const isCompleted =
    currentStatus === 'COMPLETED' ||
    currentStatus === 'CLOSED';

  const canComplete =
    currentStatus === 'in_progress' ||
    currentStatus === 'IN_PROGRESS';

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
      throw new Error('المتصفح لا يدعم تحديد الموقع');
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

    setActionLoading(true);

    try {
      const result = await techApi.completeTicket(
        ticket.id,
        notes.trim() || undefined
      );

      setTicket((prev) => ({
        ...(prev || {}),
        ...(result?.ticket || {}),
        status:
          result?.ticket?.status ||
          result?.status ||
          'COMPLETED',
      }));

      setShowCompleteModal(false);

      toast.success('تم إنهاء التذكرة بنجاح');

      setTimeout(() => {
        navigate('/tech');
      }, 700);
    } catch (err: any) {
      console.error(err);
      toast.error(
        err.message || 'فشل إنهاء التذكرة'
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
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm text-[var(--tech-text-muted)]">
            جاري تحميل التذكرة...
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
            التذكرة
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
              تعذر تحميل التذكرة
            </div>

            <div className="text-xs text-[var(--tech-text-muted)] mb-6">
              {error || 'التذكرة غير موجودة'}
            </div>

            <button
              onClick={fetchTicket}
              className="tech-btn tech-btn-primary"
            >
              <RefreshCw className="w-4 h-4" />
              إعادة المحاولة
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
    ticket.villaNumber ||
    'غير محددة';

  return (
    <div
      className="tech-app min-h-[100dvh]"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Header */}
      <div className="tech-header">
        <button
          onClick={() => navigate('/tech')}
          className="p-2 rounded-xl hover:bg-muted transition-colors"
          aria-label="رجوع"
        >
          {isRtl ? (
            <ArrowRight className="w-5 h-5" />
          ) : (
            <ArrowLeft className="w-5 h-5" />
          )}
        </button>

        <div className="flex-1 text-center min-w-0">
          <div className="text-[10px] text-[var(--tech-text-muted)]">
            التذكرة
          </div>
          <div className="font-black text-sm truncate">
            {ticketRef}
          </div>
        </div>

        <button
          onClick={fetchTicket}
          disabled={loading}
          className="p-2 rounded-xl hover:bg-muted transition-colors"
          aria-label="تحديث"
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
                  رقم التذكرة
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
              {statusLabel(currentStatus)}
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

        {/* Location / Villa */}
        <div className="tech-card">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Home className="w-5 h-5" />
            </div>

            <div>
              <div className="text-[10px] text-[var(--tech-text-muted)]">
                الموقع
              </div>
              <div className="font-black text-base">
                فيلا {villa}
              </div>
            </div>
          </div>

          {ticket.projectName && (
            <div className="p-3 rounded-xl bg-muted/50 border border-border text-sm">
              <div className="text-[10px] text-[var(--tech-text-muted)] mb-1">
                المشروع
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
              فتح الموقع على الخريطة
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
                بيانات العميل
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
                  اتصال
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
                  واتساب
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
              وصف المشكلة
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-muted/50 border border-border text-sm leading-7 whitespace-pre-wrap">
            {ticket.description ||
              'لا يوجد وصف للتذكرة'}
          </div>

          {ticket.notes && (
            <div className="mt-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="text-xs font-black text-amber-600 dark:text-amber-400 mb-1">
                ملاحظات
              </div>

              <div className="text-sm leading-6">
                {ticket.notes}
              </div>
            </div>
          )}
        </div>

        {/* Workflow */}
        <div className="tech-card">
          <div className="font-black text-sm mb-5">
            سير العمل
          </div>

          <div className="space-y-4">
            <WorkflowStep
              active={
                canComplete ||
                isCompleted
              }
              completed={
                canComplete ||
                isCompleted
              }
              label="تم استلام التذكرة"
            />

            <WorkflowStep
              active={
                currentStatus === 'IN_PROGRESS' ||
                currentStatus === 'in_progress' ||
                isCompleted
              }
              completed={
                currentStatus === 'IN_PROGRESS' ||
                currentStatus === 'in_progress' ||
                isCompleted
              }
              label="جاري التنفيذ"
            />

            <WorkflowStep
              active={isCompleted}
              completed={isCompleted}
              label="تم إنهاء التذكرة"
              last
            />
          </div>
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
                  إنهاء التذكرة
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
              تم إنهاء التذكرة
            </div>

            <button
              onClick={() => navigate('/tech')}
              className="tech-btn tech-btn-outline mt-4"
            >
              العودة للرئيسية
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
                  إنهاء التذكرة
                </div>

                <div className="text-xs text-[var(--tech-text-muted)]">
                  أضف وصفًا مختصرًا لما تم تنفيذه
                </div>
              </div>
            </div>

            <textarea
              className="tech-input min-h-[140px] resize-none"
              value={notes}
              onChange={(e) =>
                setNotes(e.target.value)
              }
              placeholder="مثال: تم إصلاح التسريب وتغيير الوصلة التالفة..."
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
                إلغاء
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

                تأكيد الإنهاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkflowStep({
  active,
  completed,
  label,
  last = false,
}: {
  active: boolean;
  completed: boolean;
  label: string;
  last?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center border ${
            completed
              ? 'bg-emerald-500 text-white border-emerald-500'
              : active
              ? 'bg-primary/10 text-primary border-primary'
              : 'bg-muted text-muted-foreground border-border'
          }`}
        >
          {completed ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-current" />
          )}
        </div>

        {!last && (
          <div
            className={`w-px flex-1 min-h-5 mt-1 ${
              completed
                ? 'bg-emerald-500/50'
                : 'bg-[var(--tech-border)]'
            }`}
          />
        )}
      </div>

      <div
        className={`pt-1 text-sm font-bold ${
          active
            ? 'text-[var(--tech-text)]'
            : 'text-[var(--tech-text-muted)]'
        }`}
      >
        {label}
      </div>
    </div>
  );
}
