import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { TicketTable } from '@/components/tickets/TicketTable';
import { clientsApi, ticketsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  User, Phone, Calendar, Shield, Hash, MapPin, 
  Ticket as TicketIcon, Loader2, ArrowRight, Home
} from 'lucide-react';

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [client, setClient] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      clientsApi.get(id),
      ticketsApi.getAll({ clientId: id })
    ]).then(([clientData, ticketsData]) => {
      setClient(clientData);
      setTickets(ticketsData);
    }).catch(() => {
      toast.error('فشل في جلب بيانات العميل');
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

  if (!client) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <User className="w-12 h-12 text-slate-600" />
          <p className="text-slate-400">لم يتم العثور على العميل</p>
          <Button variant="outline" onClick={() => navigate('/clients')}>
            <ArrowRight className="w-4 h-4 ml-2" /> العودة لقائمة العملاء
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
              onClick={() => navigate('/clients')}
              className="flex items-center gap-1.5 text-slate-500 hover:text-white text-xs transition-colors"
            >
              <span>العملاء</span>
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              <span className="text-white">{client.name}</span>
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-extrabold text-white">{client.name}</h1>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold border bg-blue-500/10 text-blue-400 border-blue-500/20">
                عميل
              </span>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">بيانات التواصل</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-end gap-3">
                <div className="text-right">
                  <div className="text-[10px] text-slate-500">الجوال</div>
                  <div className="text-sm text-slate-200 font-medium" dir="ltr">{client.phone || '—'}</div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-border shrink-0">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3">
                <div className="text-right">
                  <div className="text-[10px] text-slate-500">المشاريع</div>
                  <div className="text-sm text-blue-400 font-medium">
                    {Array.from(new Set(client.units?.map((cu: any) => cu.unit?.project?.name).filter(Boolean))).join('، ') || '—'}
                  </div>
                </div>
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-border shrink-0">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">الوحدات المملوكة ({client.units?.length || 0})</h2>
            {client.units?.length > 0 ? (
              <div className="space-y-2">
                {client.units.map((cu: any) => (
                  <Link
                    key={cu.id}
                    to={`/units/${cu.unit.id}`}
                    className="flex items-center justify-between text-right px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-border transition-colors text-sm"
                  >
                    <ArrowRight className="w-4 h-4 text-slate-600 rotate-180" />
                    <div>
                      <span className="font-bold text-blue-400">وحدة {cu.unit.unitNumber}</span>
                      {cu.unit.block && (
                        <span className="text-slate-500 mr-2 text-xs">(بلوك {cu.unit.block.blockNumber})</span>
                      )}
                    </div>
                    <Home className="w-4 h-4 text-slate-500" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-slate-600 text-sm">لا توجد وحدات مسجلة</p>
            )}
          </div>
        </div>

        {/* Tickets Table */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-border bg-white/5 flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">{tickets.length} تذكرة</span>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <TicketIcon className="w-5 h-5 text-blue-400" />
              تذاكر العميل
            </h2>
          </div>
          <TicketTable
            tickets={tickets}
            projects={client.units?.reduce((acc: any, cu: any) => {
              if (cu.unit?.project) acc[cu.unit.project.id] = { name: cu.unit.project.name };
              return acc;
            }, {}) || {}}
            hideSupervisorColumn={false}
            showInlineFilters={tickets.length > 5}
            maxHeight="600px"
            emptyMessage="لا توجد تذاكر مسجلة لهذا العميل"
          />
        </div>
      </div>
    </Layout>
  );
}
