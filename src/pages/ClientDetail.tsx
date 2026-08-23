import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { TicketTable } from '@/components/tickets/TicketTable';
import { clientsApi, ticketsApi, appointmentsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  User, Phone, Calendar, Shield, Hash, MapPin,
  Ticket as TicketIcon, Loader2, ArrowRight, Home,
  Clock, FileText
} from 'lucide-react';

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [client, setClient] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      clientsApi.get(id),
      ticketsApi.getAll({ clientId: id }),
      appointmentsApi.getByClient(id).catch(() => [] as any[]),
    ]).then(([clientData, ticketsData, apptsData]) => {
      setClient(clientData);
      setTickets(ticketsData);
      setAppointments(apptsData);
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
              <div className="flex items-center justify-between gap-3 bg-white/5 rounded-xl p-3 border border-border">
                {client.phone ? (
                  <div className="flex gap-2 shrink-0">
                    <a href={`https://wa.me/${client.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                       className="w-8 h-8 rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 flex items-center justify-center transition-colors">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </a>
                    <a href={`tel:${client.phone}`}
                       className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 flex items-center justify-center transition-colors">
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ) : <div /> }
                <div className="text-right">
                  <div className="text-[10px] text-slate-500">الجوال</div>
                  <div className="text-sm text-slate-200 font-bold" dir="ltr">{client.phone || '—'}</div>
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

        {/* Appointments Section */}
        {appointments.length > 0 && (() => {
          const today = new Date().toISOString().split('T')[0];
          const sorted = [...appointments].sort((a, b) => b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || ''));
          const upcoming = appointments.filter(a => a.date >= today).sort((a, b) => a.date.localeCompare(b.date));
          return (
            <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl">
              <div className="p-5 border-b border-border bg-white/5 flex items-center justify-between">
                <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">{appointments.length} موعد</span>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                  المواعيد
                </h2>
              </div>
              {upcoming.length > 0 && (
                <div className="px-5 py-3 border-b border-border bg-emerald-500/5">
                  <div className="flex items-center justify-end gap-1.5 mb-2">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">قادمة</span>
                  </div>
                  <div className="space-y-2">
                    {upcoming.map(appt => (
                      <div key={appt.id} className="flex items-start justify-between gap-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3">
                        <div className="flex flex-col items-start gap-1 shrink-0">
                          {appt.unitNumber && (
                            <Link to={`/units/${appt.clientId ? '' : ''}`} className="text-[10px] text-slate-500 flex items-center gap-1">
                              <Home className="w-3 h-3" />
                              وحدة {appt.unitNumber}
                            </Link>
                          )}
                          {appt.time && (
                            <span className="text-[10px] text-slate-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" />{appt.time}
                            </span>
                          )}
                        </div>
                        <div className="text-right flex-1">
                          <div className="font-bold text-emerald-300 text-sm">{appt.date}</div>
                          {appt.notes && <p className="text-slate-400 text-xs mt-1 leading-relaxed">{appt.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="divide-y divide-border max-h-72 overflow-y-auto">
                {sorted.filter(a => a.date < today).map(appt => (
                  <div key={appt.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="flex flex-col items-start gap-1 shrink-0">
                      {appt.unitNumber && (
                        <span className="text-[10px] text-slate-600 flex items-center gap-1">
                          <Home className="w-3 h-3" />
                          وحدة {appt.unitNumber}
                        </span>
                      )}
                      {appt.time && (
                        <span className="text-[10px] text-slate-600 flex items-center gap-1">
                          <Clock className="w-3 h-3" />{appt.time}
                        </span>
                      )}
                    </div>
                    <div className="text-right flex-1">
                      <div className="text-slate-400 text-sm font-bold">{appt.date}</div>
                      {appt.notes && <p className="text-slate-600 text-xs mt-0.5 leading-relaxed">{appt.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

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
            defaultShowClosed={true}
            maxHeight="600px"
            emptyMessage="لا توجد تذاكر مسجلة لهذا العميل"
          />
        </div>
      </div>
    </Layout>
  );
}
