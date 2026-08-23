import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { TicketTable } from '@/components/tickets/TicketTable';
import { contractorsApi } from '@/lib/contractorsApi';
import { ticketsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  HardHat, Phone, Wrench, Building2, MapPin, 
  Ticket as TicketIcon, Loader2, ArrowRight, Home
} from 'lucide-react';

const specialtyLabel: Record<string, string> = {
  aluminum: 'ألمنيوم',
  doors: 'أبواب',
  plumbing: 'سباكة',
  electricity: 'كهرباء',
  general: 'عام',
};

const specialtyColor: Record<string, string> = {
  aluminum: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  doors: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  plumbing: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  electricity: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  general: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export default function ContractorDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [contractor, setContractor] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      contractorsApi.get(id),
      ticketsApi.getAll({ contractorId: id })
    ]).then(([contractorData, ticketsData]) => {
      setContractor(contractorData);
      setTickets(ticketsData);
    }).catch(() => {
      toast.error('فشل في جلب بيانات المقاول');
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        </div>
      </Layout>
    );
  }

  if (!contractor) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <HardHat className="w-12 h-12 text-slate-600" />
          <p className="text-slate-400">لم يتم العثور على المقاول</p>
          <Button variant="outline" onClick={() => navigate('/contractors')}>
            <ArrowRight className="w-4 h-4 ml-2" /> العودة لقائمة المقاولين
          </Button>
        </div>
      </Layout>
    );
  }

  const specialties = contractor.specialties?.map((s: any) => s.specialtyKey) || [];

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="text-right space-y-2">
            <button
              onClick={() => navigate('/contractors')}
              className="flex items-center gap-1.5 text-slate-500 hover:text-white text-xs transition-colors"
            >
              <span>المقاولين</span>
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              <span className="text-white">{contractor.name}</span>
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold text-white">{contractor.name}</h1>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                مقاول
              </span>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">بيانات التواصل</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-end gap-3">
                <div className="text-right">
                  <div className="text-[10px] text-slate-500">الجوال</div>
                  <div className="text-sm text-slate-200 font-medium" dir="ltr">{contractor.phone || '—'}</div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-border shrink-0">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">التخصصات ({specialties.length})</h2>
            {specialties.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {specialties.map((sp: string) => (
                  <span key={sp} className={cn('px-3 py-1.5 rounded-xl text-sm font-bold border', specialtyColor[sp] ?? specialtyColor.general)}>
                    {specialtyLabel[sp] ?? sp}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-slate-600 text-sm">لا توجد تخصصات مسجلة</p>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">النطاق ({contractor.assignments?.length || 0})</h2>
            {contractor.assignments?.length > 0 ? (
              <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
                {contractor.assignments.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between text-right px-3 py-2 rounded-xl bg-white/5 border border-border text-xs">
                    <div>
                      <span className="font-bold text-emerald-400 block">{specialtyLabel[a.specialtyKey] ?? a.specialtyKey}</span>
                      <span className="text-slate-400">
                        {a.unit ? (
                          <Link to={`/units/${a.unit.id}`} className="hover:underline text-blue-400">وحدة {a.unit.unitNumber}</Link>
                        ) : (
                          `بلوك ${a.block?.blockNumber}`
                        )}
                      </span>
                    </div>
                    {a.unit ? <Home className="w-4 h-4 text-slate-500" /> : <Building2 className="w-4 h-4 text-slate-500" />}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-600 text-sm">لا يوجد نطاق مسند</p>
            )}
          </div>
        </div>

        {/* Tickets Table */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-border bg-white/5 flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">{tickets.length} تذكرة</span>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <TicketIcon className="w-5 h-5 text-emerald-400" />
              تذاكر المقاول
            </h2>
          </div>
          <TicketTable
            tickets={tickets}
            projects={{}} // The tickets might span multiple projects, but TicketTable handles that.
            hideSupervisorColumn={false}
            showInlineFilters={tickets.length > 5}
            maxHeight="600px"
            emptyMessage="لا توجد تذاكر مسندة لهذا المقاول"
          />
        </div>
      </div>
    </Layout>
  );
}
