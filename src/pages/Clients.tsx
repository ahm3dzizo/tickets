import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { clientsApi, projectsApi, ticketsApi } from '@/lib/api';
import {
  Search, MoreHorizontal, UserCheck, FileUp, ChevronDown, X,
  TicketCheck, ExternalLink, Pencil, Phone, Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ClientForm } from '@/components/clients/ClientForm';
import { DataImport } from '@/components/ui/DataImport';
import { Project, Ticket as ClientTicket } from '@/types';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const statusColors: Record<string, string> = {
  open:        'bg-red-500/10 text-red-500 border-red-500/20',
  'in-progress':'bg-amber-500/10 text-amber-500 border-amber-500/20',
  pending:     'bg-primary/10 text-primary border-primary/20',
  completed:   'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  closed:      'bg-muted text-muted-foreground border-border',
  waiting:     'bg-purple-500/10 text-purple-500 border-purple-500/20',
};
const statusLabels: Record<string, string> = {
  open: 'مفتوحة', 'in-progress': 'جاري', pending: 'معلقة',
  completed: 'منجزة', closed: 'مغلقة', waiting: 'انتظار',
};

export default function Clients() {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const canWrite  = user?.role === 'admin' || user?.role === 'engineer';

  const [clients, setClients]           = useState<any[]>([]);
  const [projects, setProjects]         = useState<Project[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterBlock, setFilterBlock]   = useState('');
  const [importOpen, setImportOpen]     = useState(false);
  const [importProjectId, setImportProjectId] = useState('');
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [clientTickets, setClientTickets]   = useState<ClientTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [editClient, setEditClient]     = useState<any | null>(null);
  const [editName, setEditName]         = useState('');
  const [editPhone, setEditPhone]       = useState('');
  const [editVilla, setEditVilla]       = useState('');
  const [editBlock, setEditBlock]       = useState('');
  const [editSaving, setEditSaving]     = useState(false);

  const loadData = async () => {
    try {
      const [allClients, allProjects] = await Promise.all([clientsApi.getAll(), projectsApi.getAll()]);
      const sorted = [...allClients].sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'ar'));
      setClients(sorted);
      setProjects(allProjects as Project[]);
    } catch { toast.error('فشل تحميل البيانات'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!selectedClient) { setClientTickets([]); return; }
    setTicketsLoading(true);
    ticketsApi.getAll({ projectId: selectedClient.projectId })
      .then((all: any[]) => setClientTickets(all.filter((t: any) => t.villaNumber === selectedClient.villaNumber) as ClientTicket[]))
      .catch(() => {})
      .finally(() => setTicketsLoading(false));
  }, [selectedClient]);

  const openEdit = (c: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditClient(c); setEditName(c.name || ''); setEditPhone(c.phone || '');
    setEditVilla(c.villaNumber || ''); setEditBlock(c.blockNumber || '');
  };

  const saveEdit = async () => {
    if (!editClient) return;
    setEditSaving(true);
    try {
      await clientsApi.update(editClient.id, { name: editName, phone: editPhone, villaNumber: editVilla, blockNumber: editBlock });
      toast.success('تم تحديث بيانات العميل');
      setEditClient(null); loadData();
    } catch { toast.error('فشل التحديث'); }
    finally { setEditSaving(false); }
  };

  const openWhatsApp = (c: any, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const num = String(c.phone || '').replace(/\D/g, '');
    const intl = num.startsWith('966') ? num : num.startsWith('0') ? '966' + num.slice(1) : '966' + num;
    window.open(`https://wa.me/${intl}`, '_blank');
  };

  const handleImportClients = async (data: any[]) => {
    if (!importProjectId) { toast.error('اختر المشروع أولاً'); return; }
    const batch = data.map(item => {
      const keys = Object.keys(item);
      const byIndex = (i: number) => String(item[keys[i]] ?? '').trim();
      const villaNumber = String(item.villaNumber || item['رقم الفيلا'] || item['فيلا'] || (keys.length > 0 ? byIndex(0) : '')).trim();
      const blockNumber = String(item.blockNumber || item['رقم البلوك'] || item['البلوك'] || (keys.length > 1 ? byIndex(1) : '')).trim();
      const name        = String(item.name        || item['الاسم']      || (keys.length > 2 ? byIndex(2) : '')).trim();
      const phone       = String(item.phone       || item['الجوال']     || item['الهاتف'] || (keys.length > 3 ? byIndex(3) : '')).trim();
      return clientsApi.create(importProjectId, {
        name, phone, villaNumber, blockNumber,
        handoverDate: item.handoverDate || '', warrantyExpiryDate: item.warrantyExpiryDate || '',
        projectId: importProjectId,
      });
    });
    await Promise.all(batch);
    toast.success(`تم استيراد ${data.length} عميل`);
    setImportOpen(false); setImportProjectId(''); loadData();
  };

  const blockNumbers = [...new Set(clients.map(c => c.blockNumber).filter(Boolean))].sort();
  const accessibleProjectIds = user?.role !== 'admin' ? (user?.projectIds ?? []) : null;
  const filtered = clients.filter(c => {
    if (accessibleProjectIds && !accessibleProjectIds.includes(c.projectId)) return false;
    if (filterProject && c.projectId !== filterProject) return false;
    if (filterBlock && c.blockNumber !== filterBlock) return false;
    if (search) {
      const s = search.toLowerCase();
      return (c.name || '').toLowerCase().includes(s) || String(c.villaNumber || '').includes(s) || String(c.phone || '').includes(s);
    }
    return true;
  });

  const projectName = (id: string) => projects.find(p => p.id === id)?.name || '---';

  return (
    <Layout>
      <div className="space-y-6 page-in">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-right">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">العملاء</h1>
            <p className="text-muted-foreground mt-1 text-sm">إدارة بيانات أصحاب الفلل والتواصل معهم</p>
          </div>
          <div className="flex gap-2 self-end sm:self-auto">
            {canWrite && (
              <Dialog open={importOpen} onOpenChange={v => { setImportOpen(v); if (!v) setImportProjectId(''); }}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2 rounded-2xl h-10 font-bold border-border">
                    <FileUp className="w-4 h-4" /> استيراد
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border sm:max-w-[520px] rounded-3xl shadow-2xl">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold text-foreground text-right">استيراد عملاء من ملف</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-5 py-2">
                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-[10px] font-black uppercase tracking-widest block text-right">اختر المشروع أولاً</Label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="w-full justify-between border-border rounded-xl h-11">
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            <span className="text-foreground">{projects.find(p => p.id === importProjectId)?.name || 'اختر المشروع'}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-card border-border w-72">
                          {projects.map(p => (
                            <DropdownMenuItem key={p.id} className="hover:bg-muted cursor-pointer text-right justify-end" onClick={() => setImportProjectId(p.id)}>
                              {p.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className={importProjectId ? '' : 'opacity-40 pointer-events-none select-none'}>
                      {!importProjectId && <p className="text-amber-500 text-xs text-right mb-2 font-medium">⚠ اختر المشروع أولاً لتفعيل الاستيراد</p>}
                      <DataImport
                        title="استيراد عملاء"
                        description="ارفع ملف Excel — A=رقم الفيلا، B=رقم البلوك، C=الاسم، D=الجوال"
                        fieldDefs={[
                          { key: 'villaNumber', label: 'رقم الفيلا',   aliases: ['رقم الفيلا','الفيلا','فيلا','villa','A','__EMPTY'] },
                          { key: 'blockNumber', label: 'رقم البلوك',   aliases: ['رقم البلوك','البلوك','بلوك','رقم القطعة','block','B','__EMPTY_1'] },
                          { key: 'name',        label: 'الاسم',         aliases: ['الاسم','اسم العميل','name','C','__EMPTY_2'] },
                          { key: 'phone',       label: 'رقم الجوال',   aliases: ['الجوال','رقم الجوال','الهاتف','phone','D','__EMPTY_3'] },
                          { key: 'handoverDate',        label: 'تاريخ التسليم', aliases: ['تاريخ التسليم','handover','E','__EMPTY_4'] },
                          { key: 'warrantyExpiryDate',  label: 'انتهاء الضمان', aliases: ['انتهاء الضمان','warranty','F','__EMPTY_5'] },
                        ]}
                        onImport={handleImportClients}
                        trigger={
                          <Button className="w-full bg-primary hover:bg-primary/90 text-white gap-2 rounded-xl h-11 font-bold">
                            <FileUp className="w-4 h-4" /> رفع ملف Excel
                          </Button>
                        }
                      />
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            {canWrite && <ClientForm />}
          </div>
        </div>

        {/* Main card */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">

          {/* Search + Filters */}
          <div className="p-4 border-b border-border flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="البحث باسم أو فيلا أو جوال..."
                  className="bg-muted/50 border-transparent focus:border-primary/30 pr-10 text-right rounded-xl h-10 text-sm"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="border-border rounded-xl h-10 px-3 gap-2 text-sm font-medium min-w-[130px] justify-between">
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{filterProject ? projectName(filterProject) : 'كل المشاريع'}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="bg-card border-border w-52">
                    <DropdownMenuItem className="hover:bg-muted cursor-pointer text-right justify-end text-muted-foreground" onClick={() => setFilterProject('')}>كل المشاريع</DropdownMenuItem>
                    {projects.map(p => (
                      <DropdownMenuItem key={p.id} className="hover:bg-muted cursor-pointer text-right justify-end" onClick={() => setFilterProject(p.id)}>{p.name}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {blockNumbers.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" className="border-border rounded-xl h-10 px-3 gap-2 text-sm font-medium min-w-[120px] justify-between">
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{filterBlock ? `بلوك ${filterBlock}` : 'كل البلوكات'}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-card border-border w-40 max-h-56 overflow-y-auto">
                      <DropdownMenuItem className="hover:bg-muted cursor-pointer text-right justify-end text-muted-foreground" onClick={() => setFilterBlock('')}>كل البلوكات</DropdownMenuItem>
                      {blockNumbers.map(b => (
                        <DropdownMenuItem key={b} className="hover:bg-muted cursor-pointer text-right justify-end" onClick={() => setFilterBlock(b)}>بلوك {b}</DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {(filterProject || filterBlock) && (
                  <Button variant="ghost" size="sm" className="h-10 px-3 text-muted-foreground hover:text-foreground gap-1 text-xs" onClick={() => { setFilterProject(''); setFilterBlock(''); }}>
                    <X className="w-3.5 h-3.5" /> مسح
                  </Button>
                )}
                <span className="text-muted-foreground text-xs font-bold mr-auto">{filtered.length} عميل</span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-[10px] font-black uppercase tracking-widest border-b border-border">
                  <th className="px-5 py-3.5">العميل</th>
                  <th className="px-5 py-3.5">رقم الفيلا</th>
                  <th className="px-5 py-3.5 hidden sm:table-cell">رقم البلوك</th>
                  <th className="px-5 py-3.5 hidden md:table-cell">رقم الهاتف</th>
                  <th className="px-5 py-3.5 hidden lg:table-cell">المشروع</th>
                  <th className="px-5 py-3.5 text-center w-16">...</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-5 py-4"><div className="flex items-center gap-3 justify-end"><div className="h-4 shimmer rounded w-24" /><div className="w-8 h-8 shimmer rounded-full shrink-0" /></div></td>
                      <td className="px-5 py-4"><div className="h-4 shimmer rounded w-16 ml-auto" /></td>
                      <td className="px-5 py-4 hidden sm:table-cell"><div className="h-4 shimmer rounded w-12 ml-auto" /></td>
                      <td className="px-5 py-4 hidden md:table-cell"><div className="h-4 shimmer rounded w-28 ml-auto" /></td>
                      <td className="px-5 py-4 hidden lg:table-cell"><div className="h-4 shimmer rounded w-20 ml-auto" /></td>
                      <td className="px-5 py-4"><div className="w-6 h-6 shimmer rounded mx-auto" /></td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">لا يوجد عملاء مطابقين</td>
                  </tr>
                ) : filtered.map(c => (
                  <tr
                    key={c.id}
                    className="group hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedClient(c)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3 justify-end">
                        <div className="text-right">
                          <div className="font-semibold text-foreground text-sm">{c.name}</div>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
                          <UserCheck className="w-4 h-4" />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-bold text-foreground">فيلا {c.villaNumber}</span>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <span className="text-sm text-muted-foreground">{c.blockNumber || '---'}</span>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <span className="text-sm font-mono text-muted-foreground dir-ltr">{c.phone || '---'}</span>
                    </td>
                    <td className="px-5 py-3.5 hidden lg:table-cell">
                      <span className="text-sm text-muted-foreground">{projectName(c.projectId)}</span>
                    </td>
                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border w-44 rounded-2xl">
                            {canWrite && (
                              <DropdownMenuItem className="hover:bg-muted cursor-pointer text-right justify-end gap-2 rounded-xl mx-1 my-0.5" onClick={e => openEdit(c, e)}>
                                <Pencil className="w-3.5 h-3.5" /> تعديل البيانات
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="hover:bg-muted cursor-pointer text-emerald-500 text-right justify-end gap-2 rounded-xl mx-1 my-0.5" onClick={e => openWhatsApp(c, e)}>
                              <Phone className="w-3.5 h-3.5" /> واتساب
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Client Detail Dialog ────────────────────────────────────── */}
      <Dialog open={!!selectedClient} onOpenChange={v => { if (!v) setSelectedClient(null); }}>
        <DialogContent className="bg-card border-border sm:max-w-[600px] rounded-3xl shadow-2xl max-h-[90dvh] overflow-y-auto">
          {selectedClient && (<>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-foreground text-right flex items-center gap-3 justify-end">
                <span>{selectedClient.name}</span>
                <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <UserCheck className="w-5 h-5" />
                </div>
              </DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3 mt-2">
              {[
                { label: 'رقم الفيلا',   value: `فيلا ${selectedClient.villaNumber}` },
                { label: 'رقم البلوك',   value: selectedClient.blockNumber || '---' },
                { label: 'المشروع',      value: projectName(selectedClient.projectId) },
                { label: 'تاريخ التسليم', value: selectedClient.handoverDate || '---', hidden: !selectedClient.handoverDate },
                { label: 'انتهاء الضمان', value: selectedClient.warrantyExpiryDate || '---', hidden: !selectedClient.warrantyExpiryDate },
              ].filter(f => !f.hidden).map(field => (
                <div key={field.label} className="bg-muted/50 rounded-2xl p-3.5 text-right">
                  <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest mb-1">{field.label}</p>
                  <p className="text-foreground font-bold">{field.value}</p>
                </div>
              ))}
              <div className="bg-muted/50 rounded-2xl p-3.5 text-right">
                <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest mb-1">رقم الجوال</p>
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={e => openWhatsApp(selectedClient, e)} className="text-emerald-500 hover:text-emerald-400 transition-colors">
                    <Phone className="w-4 h-4" />
                  </button>
                  <p className="text-foreground font-mono font-bold">{selectedClient.phone || '---'}</p>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-muted-foreground text-xs font-bold">{clientTickets.length} تذكرة</span>
                <h3 className="text-foreground font-bold text-sm flex items-center gap-2">
                  <TicketCheck className="w-4 h-4 text-primary" /> تذاكر الصيانة
                </h3>
              </div>
              {ticketsLoading ? (
                <div className="flex justify-center py-5"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : clientTickets.length === 0 ? (
                <div className="bg-muted/50 rounded-2xl p-6 text-center text-muted-foreground text-sm">لا توجد تذاكر لهذا العميل</div>
              ) : (
                <div className="space-y-2">
                  {clientTickets.map(t => (
                    <div
                      key={t.id}
                      className="bg-muted/50 rounded-xl p-3.5 flex items-center justify-between gap-3 hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => { setSelectedClient(null); navigate(`/tickets/${t.id}`); }}
                    >
                      <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 text-right min-w-0">
                        <div className="text-sm text-foreground font-medium line-clamp-1">{t.description}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{t.refNumber || t.ticketId}</div>
                      </div>
                      <Badge className={`text-[10px] font-bold border shrink-0 ${statusColors[t.status] || statusColors.open}`}>
                        {statusLabels[t.status] || t.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4 pt-4 border-t border-border">
              {canWrite && (
                <Button variant="ghost" className="gap-2 rounded-xl mr-auto" onClick={e => { setSelectedClient(null); openEdit(selectedClient, e); }}>
                  <Pencil className="w-4 h-4" /> تعديل
                </Button>
              )}
              <Button className="bg-emerald-500 hover:bg-emerald-600 text-white gap-2 rounded-xl" onClick={e => openWhatsApp(selectedClient, e)}>
                <Phone className="w-4 h-4" /> واتساب
              </Button>
            </div>
          </>)}
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ────────────────────────────────────────────── */}
      <Dialog open={!!editClient} onOpenChange={v => { if (!v) setEditClient(null); }}>
        <DialogContent className="bg-card border-border sm:max-w-[440px] rounded-3xl shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground text-right">تعديل بيانات العميل</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {[
              { label: 'الاسم',        value: editName,  set: setEditName,  ph: 'اسم العميل' },
              { label: 'رقم الجوال',  value: editPhone, set: setEditPhone, ph: '05xxxxxxxx' },
              { label: 'رقم الفيلا',  value: editVilla, set: setEditVilla, ph: '12' },
              { label: 'رقم البلوك',  value: editBlock, set: setEditBlock, ph: 'A' },
            ].map(({ label, value, set, ph }) => (
              <div key={label} className="space-y-1.5">
                <Label className="text-muted-foreground text-[10px] font-black uppercase tracking-widest block text-right">{label}</Label>
                <Input value={value} onChange={e => set(e.target.value)} placeholder={ph}
                  className="bg-muted/50 border-transparent focus:border-primary/30 rounded-xl h-11 text-right" />
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="border-border rounded-xl flex-1" onClick={() => setEditClient(null)}>إلغاء</Button>
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-xl flex-1 gap-2" onClick={saveEdit} disabled={editSaving}>
              {editSaving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              حفظ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
