import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { TicketTable } from '@/components/tickets/TicketTable';
import { projectsApi, ticketsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Home, Building2, MapPin, HardHat, User,
  Ticket as TicketIcon, Loader2, ArrowRight
} from 'lucide-react';

const specialtyLabel: Record<string, string> = {
  aluminum: 'ألمنيوم',
  doors: 'أبواب',
  plumbing: 'سباكة',
  electricity: 'كهرباء',
  general: 'عام',
};

export default function UnitDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [unit, setUnit] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      projectsApi.getUnitDetails(id),
      ticketsApi.getAll({ unitId: id })
    ]).then(([unitData, ticketsData]) => {
      setUnit(unitData);
      setTickets(ticketsData);
    }).catch(() => {
      toast.error('فشل في جلب بيانات الوحدة');
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

  if (!unit) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <Home className="w-12 h-12 text-slate-600" />
          <p className="text-slate-400">لم يتم العثور على الوحدة</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowRight className="w-4 h-4 ml-2" /> العودة
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="text-right space-y-2">
            <button
              onClick={() => navigate(`/projects/${unit.projectId}`)}
              className="flex items-center gap-1.5 text-slate-500 hover:text-white text-xs transition-colors"
            >
              <span>المشروع ({unit.project?.name})</span>
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              <span className="text-white">وحدة {unit.unitNumber}</span>
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold text-white flex items-center gap-2">
                <Home className="w-8 h-8 text-slate-400" />
                وحدة {unit.unitNumber}
              </h1>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold border bg-slate-500/10 text-slate-400 border-slate-500/20">
                بلوك {unit.block?.blockNumber || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Warranty Info */}
        {(unit.handoverDate || unit.warrantyExpiryDate) && (
          <div className="flex flex-wrap gap-6 bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 px-6 text-sm">
            {unit.handoverDate && (
              <div>
                <span className="text-slate-400 block text-xs mb-1">تاريخ الاستلام (بداية الضمان)</span>
                <span className="text-slate-200 font-bold">{unit.handoverDate}</span>
              </div>
            )}
            {unit.warrantyExpiryDate && (
              <div>
                <span className="text-slate-400 block text-xs mb-1">تاريخ نهاية الضمان</span>
                <span className="text-slate-200 font-bold">{unit.warrantyExpiryDate}</span>
              </div>
            )}
          </div>
        )}

        {/* Info Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <User className="w-4 h-4" /> المالك
            </h2>
            {unit.clients?.length > 0 ? (
              <div className="space-y-2">
                {unit.clients.map((cu: any) => (
                  <Link
                    key={cu.id}
                    to={`/clients/${cu.client.id}`}
                    className="flex items-center justify-between text-right px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-border transition-colors text-sm"
                  >
                    <ArrowRight className="w-4 h-4 text-slate-600 rotate-180" />
                    <div>
                      <span className="font-bold text-blue-400 block">{cu.client.name}</span>
                      <span className="text-slate-500 text-xs font-mono">{cu.client.phone || '—'}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-slate-600 text-sm">لا يوجد مُلاّك مسجلين</p>
            )}
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <HardHat className="w-4 h-4" /> المقاولون المخصصون ({unit.contractorAssignments?.length || 0})
            </h2>
            {unit.contractorAssignments?.length > 0 ? (
              <div className="space-y-2">
                {unit.contractorAssignments.map((a: any) => (
                  <Link
                    key={a.id}
                    to={`/contractors/${a.contractor.id}`}
                    className="flex items-center justify-between text-right px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-border transition-colors text-sm"
                  >
                    <ArrowRight className="w-4 h-4 text-slate-600 rotate-180" />
                    <div>
                      <span className="font-bold text-emerald-400 block">{a.contractor.name}</span>
                      <span className="text-slate-500 text-xs">{specialtyLabel[a.specialtyKey] ?? a.specialtyKey}</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-slate-600 text-sm">لا يوجد مقاولين مسندين خصيصاً لهذه الوحدة</p>
            )}
          </div>
        </div>

        {/* Tickets Table */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-border bg-white/5 flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">{tickets.length} تذكرة</span>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <TicketIcon className="w-5 h-5 text-blue-400" />
              تذاكر الوحدة
            </h2>
          </div>
          <TicketTable
            tickets={tickets}
            projects={unit.project ? { [unit.project.id]: { name: unit.project.name } } : {}}
            hideSupervisorColumn={false}
            showInlineFilters={tickets.length > 5}
            defaultShowClosed={true}
            maxHeight="600px"
            emptyMessage="لا توجد تذاكر مرتبطة بهذه الوحدة"
          />
        </div>
      </div>
    </Layout>
  );
}
