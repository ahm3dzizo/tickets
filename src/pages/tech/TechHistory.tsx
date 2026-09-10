import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Briefcase, CalendarDays, ChevronLeft, ChevronRight, Clock3, Coffee, Loader2, RefreshCw, Ticket, Timer } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTechAuth } from '@/hooks/useTechAuth';
import type { TechLang } from '@/i18n/tech';
import './tech.css';

type HistoryResponse = {
  items: any[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
};

const copy: Record<TechLang, Record<string, string>> = {
  ar: {
    title: 'سجل العمل',
    subtitle: 'الورديات والزيارات السابقة',
    loading: 'جاري تحميل السجل...',
    empty: 'لا يوجد سجل عمل حتى الآن',
    retry: 'إعادة المحاولة',
    shift: 'الوردية',
    active: 'نشطة',
    completed: 'مكتملة',
    work: 'عمل',
    breaks: 'استراحة',
    overtime: 'إضافي',
    visits: 'زيارات',
    tickets: 'تذاكر',
    villa: 'الوحدة',
    appointment: 'موعد',
    previous: 'السابق',
    next: 'التالي',
    page: 'صفحة',
    of: 'من',
    error: 'تعذر تحميل سجل العمل',
  },
  en: {
    title: 'Work history', subtitle: 'Previous shifts and visits', loading: 'Loading history...', empty: 'No work history yet', retry: 'Retry',
    shift: 'Shift', active: 'Active', completed: 'Completed', work: 'Work', breaks: 'Breaks', overtime: 'Overtime', visits: 'Visits', tickets: 'Tickets', villa: 'Unit', appointment: 'Appointment', previous: 'Previous', next: 'Next', page: 'Page', of: 'of', error: 'Could not load work history',
  },
  hi: {
    title: 'कार्य इतिहास', subtitle: 'पिछली शिफ्ट और विज़िट', loading: 'इतिहास लोड हो रहा है...', empty: 'अभी कोई कार्य इतिहास नहीं है', retry: 'फिर कोशिश करें',
    shift: 'शिफ्ट', active: 'सक्रिय', completed: 'पूर्ण', work: 'काम', breaks: 'ब्रेक', overtime: 'ओवरटाइम', visits: 'विज़िट', tickets: 'टिकट', villa: 'यूनिट', appointment: 'अपॉइंटमेंट', previous: 'पिछला', next: 'अगला', page: 'पेज', of: 'में से', error: 'कार्य इतिहास लोड नहीं हो सका',
  },
  ur: {
    title: 'کام کی تاریخ', subtitle: 'گزشتہ شفٹیں اور وزٹس', loading: 'ریکارڈ لوڈ ہو رہا ہے...', empty: 'ابھی کوئی کام کا ریکارڈ نہیں', retry: 'دوبارہ کوشش',
    shift: 'شفٹ', active: 'فعال', completed: 'مکمل', work: 'کام', breaks: 'وقفہ', overtime: 'اوور ٹائم', visits: 'وزٹس', tickets: 'ٹکٹس', villa: 'یونٹ', appointment: 'اپائنٹمنٹ', previous: 'پچھلا', next: 'اگلا', page: 'صفحہ', of: 'از', error: 'کام کا ریکارڈ لوڈ نہیں ہو سکا',
  },
};

function minsLabel(minutes?: number | null) {
  const mins = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (hours > 0) return `${hours}h ${rest}m`;
  return `${rest}m`;
}

function dateLabel(value: string | Date | null | undefined, lang: TechLang) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(lang === 'ar' ? 'ar-SA' : lang === 'hi' ? 'hi-IN' : lang === 'ur' ? 'ur-PK' : 'en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function timeLabel(value: string | Date | null | undefined, lang: TechLang) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(lang === 'ar' ? 'ar-SA' : undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function TechHistory() {
  const navigate = useNavigate();
  const { token, techProfile } = useTechAuth() as any;
  const lang = (techProfile?.language || localStorage.getItem('tech_language') || 'ar') as TechLang;
  const isRtl = lang === 'ar' || lang === 'ur';
  const text = copy[lang] || copy.ar;
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPage = page) => {
    const authToken = token || localStorage.getItem('tech_token') || '';
    if (!authToken) {
      navigate('/tech/login', { replace: true });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(targetPage), pageSize: '12' });
      const response = await fetch(`/api/tech/history?${query.toString()}`, {
        headers: { Authorization: `Bearer ${authToken}` },
        cache: 'no-store',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || text.error);
      }
      const result = await response.json() as HistoryResponse;
      setData(result);
      setPage(result.pagination.page);
    } catch (err: any) {
      setError(err?.message || text.error);
    } finally {
      setLoading(false);
    }
  }, [navigate, page, text.error, token]);

  useEffect(() => { void load(page); }, [page]);

  const totals = useMemo(() => {
    const items = data?.items || [];
    return {
      shifts: data?.pagination.total || 0,
      visits: items.reduce((sum, shift) => sum + Number(shift.appointmentsWorked || 0), 0),
      tickets: items.reduce((sum, shift) => sum + Number(shift.ticketsWorked || 0), 0),
    };
  }, [data]);

  return (
    <div className="tech-app min-h-[100dvh]" dir={isRtl ? 'rtl' : 'ltr'}>
      <header className="tech-header">
        <button type="button" onClick={() => navigate('/tech')} className="tech-icon-btn" aria-label="Back">
          {isRtl ? <ArrowRight size={19} /> : <ArrowLeft size={19} />}
        </button>
        <div className="min-w-0 flex-1">
          <strong className="block text-sm">{text.title}</strong>
          <span className="block text-[10px] text-[var(--tech-text-muted)]">{text.subtitle}</span>
        </div>
        <button type="button" onClick={() => void load(page)} className="tech-icon-btn" aria-label={text.retry}>
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </header>

      <main className="tech-container pb-10">
        <section className="tech-stats-grid slide-up">
          <div className="tech-stat-card"><div className="tech-stat-icon blue"><CalendarDays size={18} /></div><div><strong>{totals.shifts}</strong><span>{text.shift}</span></div></div>
          <div className="tech-stat-card"><div className="tech-stat-icon emerald"><Briefcase size={18} /></div><div><strong>{totals.visits}</strong><span>{text.visits}</span></div></div>
          <div className="tech-stat-card"><div className="tech-stat-icon amber"><Ticket size={18} /></div><div><strong>{totals.tickets}</strong><span>{text.tickets}</span></div></div>
        </section>

        {loading && !data ? (
          <div className="tech-loading"><Loader2 size={26} className="animate-spin" /><span>{text.loading}</span></div>
        ) : error ? (
          <div className="tech-card text-center py-10">
            <div className="font-black mb-4">{error}</div>
            <button type="button" onClick={() => void load(page)} className="tech-btn tech-btn-primary"><RefreshCw size={16} />{text.retry}</button>
          </div>
        ) : !data?.items?.length ? (
          <div className="tech-empty"><div className="tech-empty-icon"><Clock3 size={25} /></div><strong>{text.empty}</strong></div>
        ) : (
          <div className="space-y-3 mt-3">
            {data.items.map((shift: any) => (
              <article key={shift.id} className="tech-card slide-up">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-black text-sm">{dateLabel(shift.clockInAt || shift.shiftDate, lang)}</div>
                    <div className="text-[11px] text-[var(--tech-text-muted)] mt-1">
                      {shift.project?.name || shift.project?.abbreviation || '—'} · {timeLabel(shift.clockInAt, lang)} → {timeLabel(shift.clockOutAt, lang)}
                    </div>
                  </div>
                  <span className={`tech-status-badge ${shift.status === 'COMPLETED' ? 'tech-status-success' : 'tech-status-info'}`}>
                    {shift.status === 'COMPLETED' ? text.completed : text.active}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4">
                  <Metric icon={<Timer size={14} />} label={text.work} value={minsLabel(shift.totalWorkMinutes)} />
                  <Metric icon={<Coffee size={14} />} label={text.breaks} value={minsLabel(shift.totalBreakMinutes)} />
                  <Metric icon={<Clock3 size={14} />} label={text.overtime} value={minsLabel(shift.overtimeMinutes)} />
                </div>

                {shift.workSessions?.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-[var(--tech-border)] space-y-2">
                    {shift.workSessions.map((session: any) => (
                      <div key={session.id} className="rounded-xl border border-[var(--tech-border)] p-3 bg-[var(--tech-surface)]">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-black text-xs">
                            {text.villa} {session.appointment?.unit?.unitNumber || '—'}
                          </div>
                          <div className="text-[10px] text-[var(--tech-text-muted)]">{session.appointment?.date || ''} {session.appointment?.time || ''}</div>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap mt-2 text-[11px] text-[var(--tech-text-muted)]">
                          <span className="inline-flex items-center gap-1"><Briefcase size={12} />{text.appointment}</span>
                          <span className="inline-flex items-center gap-1"><Timer size={12} />{minsLabel(session.totalDurationMins)}</span>
                          <span className="inline-flex items-center gap-1"><Ticket size={12} />{session.appointment?.tickets?.length || 0} {text.tickets}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 mt-5">
            <button type="button" className="tech-btn tech-btn-outline" disabled={loading || page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}>
              {isRtl ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}{text.previous}
            </button>
            <span className="text-xs font-bold text-[var(--tech-text-muted)]">{text.page} {page} {text.of} {data.pagination.totalPages}</span>
            <button type="button" className="tech-btn tech-btn-outline" disabled={loading || !data.pagination.hasMore} onClick={() => setPage(current => current + 1)}>
              {text.next}{isRtl ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--tech-border)] p-2.5 text-center bg-[var(--tech-surface)]">
      <div className="flex justify-center text-[var(--tech-text-muted)] mb-1">{icon}</div>
      <div className="font-black text-sm">{value}</div>
      <div className="text-[10px] text-[var(--tech-text-muted)]">{label}</div>
    </div>
  );
}
