import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { collectionGroup, onSnapshot, query, collection, addDoc, updateDoc, doc, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Search, MoreHorizontal, UserCheck, FileUp, ChevronDown, X, TicketCheck, ExternalLink, Pencil, Phone } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const statusColors: Record<string, string> = {
  open: 'bg-red-500/10 text-red-400 border-red-500/20',
  'in-progress': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  pending: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  closed: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  waiting: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};
const statusLabels: Record<string, string> = {
  open: 'مفتوحة', 'in-progress': 'جاري', pending: 'معلقة',
  completed: 'منجزة', closed: 'مغلقة', waiting: 'انتظار',
};

export default function Clients() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canWrite = user?.role === 'admin' || user?.role === 'engineer';
  const [clients, setClients]       = useState<any[]>([]);
  const [projects, setProjects]     = useState<Project[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterProject, setFilterProject] = useState('');
  const [filterBlock, setFilterBlock]     = useState('');

  // Import dialog
  const [importOpen, setImportOpen]         = useState(false);
  const [importProjectId, setImportProjectId] = useState('');

  // Client detail dialog
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [clientTickets, setClientTickets]   = useState<ClientTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  // Edit dialog
  const [editClient, setEditClient]   = useState<any | null>(null);
  const [editName, setEditName]       = useState('');
  const [editPhone, setEditPhone]     = useState('');
  const [editVilla, setEditVilla]     = useState('');
  const [editBlock, setEditBlock]     = useState('');
  const [editSaving, setEditSaving]   = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(query(collectionGroup(db, 'clients')), (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, _ref: doc.ref, ...doc.data() }));
      docs.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'ar'));
      setClients(docs);
      setLoading(false);
    });
    const projUnsub = onSnapshot(query(collection(db, 'projects')), (snap) => {
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
    });
    return () => { unsub(); projUnsub(); };
  }, []);

  // Load tickets when a client is selected
  useEffect(() => {
    if (!selectedClient) { setClientTickets([]); return; }
    setTicketsLoading(true);
    const q = query(
      collection(db, 'tickets'),
      where('villaNumber', '==', selectedClient.villaNumber),
      where('projectId', '==', selectedClient.projectId),
    );
    getDocs(q).then(snap => {
      setClientTickets(snap.docs.map(d => ({ id: d.id, ...d.data() } as unknown as ClientTicket)));
      setTicketsLoading(false);
    }).catch(() => setTicketsLoading(false));
  }, [selectedClient]);

  const openEdit = (c: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditClient(c);
    setEditName(c.name || '');
    setEditPhone(c.phone || '');
    setEditVilla(c.villaNumber || '');
    setEditBlock(c.blockNumber || '');
  };

  const saveEdit = async () => {
    if (!editClient) return;
    setEditSaving(true);
    try {
      await updateDoc(editClient._ref, { name: editName, phone: editPhone, villaNumber: editVilla, blockNumber: editBlock });
      toast.success('تم تحديث بيانات العميل');
      setEditClient(null);
    } catch { toast.error('فشل التحديث'); }
    finally { setEditSaving(false); }
  };

  const openWhatsApp = (c: any, e: React.MouseEvent) => {
    e.stopPropagation();
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
      return addDoc(collection(db, `projects/${importProjectId}/clients`), {
        name, phone, villaNumber, blockNumber,
        handoverDate: item.handoverDate || '', warrantyExpiryDate: item.warrantyExpiryDate || '',
        projectId: importProjectId, createdAt: new Date().toISOString(),
      });
    });
    await Promise.all(batch);
    toast.success(`تم استيراد ${data.length} عميل بنجاح`);
    setImportOpen(false); setImportProjectId('');
  };

  // Unique block numbers for filter
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
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="text-right order-2 md:order-1">
            <h1 className="text-3xl font-extrabold text-white">العملاء</h1>
            <p className="text-slate-500 mt-1">إدارة بيانات أصحاب الفلل والتواصل معهم</p>
          </div>
          <div className="order-1 md:order-2 self-end md:self-auto flex gap-3">
            {/* Import dialog */}
            {canWrite && <Dialog open={importOpen} onOpenChange={v => { setImportOpen(v); if (!v) setImportProjectId(''); }}>
              <DialogTrigger render={
                <Button variant="outline" className="border-border bg-white/5 text-slate-300 hover:text-white gap-2 rounded-xl h-12 px-5 font-bold">
                  <FileUp className="w-4 h-4" /> استيراد عملاء
                </Button>
              } />
              <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[520px] rounded-3xl shadow-2xl shadow-black/40">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-white text-right">استيراد عملاء من ملف</DialogTitle>
                </DialogHeader>
                <div className="space-y-5 py-2">
                  <div className="space-y-2">
                    <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">اختر المشروع أولاً</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={
                        <Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12">
                          <ChevronDown className="w-4 h-4 opacity-50" />
                          <span>{projects.find(p => p.id === importProjectId)?.name || 'اختر المشروع'}</span>
                        </Button>
                      } />
                      <DropdownMenuContent className="bg-card border-border text-slate-200 w-72">
                        {projects.map(p => (
                          <DropdownMenuItem key={p.id} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setImportProjectId(p.id)}>
                            {p.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className={importProjectId ? '' : 'opacity-40 pointer-events-none select-none'}>
                    {!importProjectId && <p className="text-amber-400 text-xs text-right mb-2 font-medium">⚠ اختر المشروع أولاً لتفعيل الاستيراد</p>}
                    <DataImport
                      title="استيراد عملاء"
                      description="ارفع ملف Excel — A=رقم الفيلا، B=رقم البلوك، C=الاسم، D=الجوال"
                      fieldDefs={[
                        { key: 'villaNumber', label: 'رقم الفيلا', aliases: ['رقم الفيلا','الفيلا','فيلا','villa','A','__EMPTY'] },
                        { key: 'blockNumber', label: 'رقم البلوك', aliases: ['رقم البلوك','البلوك','بلوك','رقم القطعة','block','B','__EMPTY_1'] },
                        { key: 'name',        label: 'الاسم',      aliases: ['الاسم','اسم العميل','name','C','__EMPTY_2'] },
                        { key: 'phone',       label: 'رقم الجوال', aliases: ['الجوال','رقم الجوال','الهاتف','phone','D','__EMPTY_3'] },
                        { key: 'handoverDate', label: 'تاريخ التسليم', aliases: ['تاريخ التسليم','handover','E','__EMPTY_4'] },
                        { key: 'warrantyExpiryDate', label: 'انتهاء الضمان', aliases: ['انتهاء الضمان','warranty','F','__EMPTY_5'] },
                      ]}
                      onImport={handleImportClients}
                      trigger={
                        <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-xl h-12 font-bold">
                          <FileUp className="w-4 h-4" /> رفع ملف Excel
                        </Button>
                      }
                    />
                  </div>
                </div>
              </DialogContent>
            </Dialog>}
            {canWrite && <ClientForm />}
          </div>
        </div>

        {/* Table card */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl">
          {/* Search + Filters */}
          <div className="p-5 border-b border-border bg-white/5 flex flex-col gap-3">
            <div className="flex flex-col md:flex-row gap-3 items-center">
              {/* Search */}
              <div className="relative w-full md:w-80">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input placeholder="البحث باسم أو رقم فيلا أو جوال..." className="bg-white/5 border-border pr-12 text-right rounded-xl h-10 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              {/* Project filter */}
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button variant="outline" className="border-border bg-white/5 text-slate-400 rounded-xl h-10 px-4 gap-2 text-sm font-medium min-w-[160px] justify-between">
                    <ChevronDown className="w-3 h-3" />
                    <span>{filterProject ? projectName(filterProject) : 'كل المشاريع'}</span>
                  </Button>
                } />
                <DropdownMenuContent className="bg-card border-border text-slate-200 w-56">
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-right justify-end text-slate-400" onClick={() => setFilterProject('')}>كل المشاريع</DropdownMenuItem>
                  {projects.map(p => (
                    <DropdownMenuItem key={p.id} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setFilterProject(p.id)}>{p.name}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Block filter */}
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button variant="outline" className="border-border bg-white/5 text-slate-400 rounded-xl h-10 px-4 gap-2 text-sm font-medium min-w-[140px] justify-between">
                    <ChevronDown className="w-3 h-3" />
                    <span>{filterBlock ? `بلوك ${filterBlock}` : 'كل البلوكات'}</span>
                  </Button>
                } />
                <DropdownMenuContent className="bg-card border-border text-slate-200 w-44 max-h-60 overflow-y-auto">
                  <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-right justify-end text-slate-400" onClick={() => setFilterBlock('')}>كل البلوكات</DropdownMenuItem>
                  {blockNumbers.map(b => (
                    <DropdownMenuItem key={b} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setFilterBlock(b)}>بلوك {b}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {/* Active filters / count */}
              <div className="flex items-center gap-2 mr-auto">
                {(filterProject || filterBlock) && (
                  <Button variant="ghost" size="sm" className="text-slate-500 hover:text-white h-8 px-2 gap-1 text-xs" onClick={() => { setFilterProject(''); setFilterBlock(''); }}>
                    <X className="w-3 h-3" /> مسح الفلاتر
                  </Button>
                )}
                <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">{filtered.length} عميل</span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead className="bg-[#1e293b] text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-border">
                <tr>
                  <th className="px-6 py-4">العميل</th>
                  <th className="px-6 py-4">رقم الفيلا</th>
                  <th className="px-6 py-4">رقم البلوك</th>
                  <th className="px-6 py-4">رقم الهاتف</th>
                  <th className="px-6 py-4">المشروع</th>
                  <th className="px-6 py-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {loading ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" /></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">لا يوجد عملاء</td></tr>
                ) : filtered.map(c => (
                  <tr
                    key={c.id}
                    className="group hover:bg-white/[0.03] transition-colors cursor-pointer"
                    onClick={() => setSelectedClient(c)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3 justify-end">
                        <div className="text-right">
                          <div className="font-bold text-white text-sm">{c.name}</div>
                        </div>
                        <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-blue-400 border border-border shrink-0">
                          <UserCheck className="w-4 h-4" />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-300">فيلا {c.villaNumber}</td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-400">{c.blockNumber || '---'}</td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-400 dir-ltr text-left">{c.phone || '---'}</td>
                    <td className="px-6 py-4 text-xs text-slate-500">{projectName(c.projectId)}</td>
                    <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-white" />}>
                            <MoreHorizontal className="w-4 h-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border text-slate-200 w-44">
                            {canWrite && (
                              <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-right justify-end gap-2" onClick={e => openEdit(c, e)}>
                                <Pencil className="w-3.5 h-3.5" /> تعديل البيانات
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-emerald-400 text-right justify-end gap-2" onClick={e => openWhatsApp(c, e)}>
                              <Phone className="w-3.5 h-3.5" /> تواصل واتساب
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

      {/* ── Client Detail Dialog ── */}
      <Dialog open={!!selectedClient} onOpenChange={v => { if (!v) setSelectedClient(null); }}>
        <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[640px] rounded-3xl shadow-2xl shadow-black/40 max-h-[90vh] overflow-y-auto">
          {selectedClient && (<>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-white text-right flex items-center gap-3 justify-end">
                <span>{selectedClient.name}</span>
                <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <UserCheck className="w-5 h-5" />
                </div>
              </DialogTitle>
            </DialogHeader>

            {/* Client info cards */}
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="bg-white/5 rounded-2xl p-4 text-right">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">رقم الفيلا</p>
                <p className="text-white font-bold text-lg">فيلا {selectedClient.villaNumber}</p>
              </div>
              <div className="bg-white/5 rounded-2xl p-4 text-right">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">رقم البلوك</p>
                <p className="text-white font-bold text-lg">{selectedClient.blockNumber || '---'}</p>
              </div>
              <div className="bg-white/5 rounded-2xl p-4 text-right">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">رقم الجوال</p>
                <div className="flex items-center gap-2 justify-end mt-1">
                  <button onClick={e => openWhatsApp(selectedClient, e)} className="text-emerald-400 hover:text-emerald-300 transition-colors">
                    <Phone className="w-4 h-4" />
                  </button>
                  <p className="text-white font-mono font-bold">{selectedClient.phone || '---'}</p>
                </div>
              </div>
              <div className="bg-white/5 rounded-2xl p-4 text-right">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">المشروع</p>
                <p className="text-white font-bold">{projectName(selectedClient.projectId)}</p>
              </div>
              {selectedClient.handoverDate && (
                <div className="bg-white/5 rounded-2xl p-4 text-right">
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">تاريخ التسليم</p>
                  <p className="text-white font-bold">{selectedClient.handoverDate}</p>
                </div>
              )}
              {selectedClient.warrantyExpiryDate && (
                <div className="bg-white/5 rounded-2xl p-4 text-right">
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">انتهاء الضمان</p>
                  <p className="text-white font-bold">{selectedClient.warrantyExpiryDate}</p>
                </div>
              )}
            </div>

            {/* Tickets */}
            <div className="mt-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-500 text-xs font-bold">{clientTickets.length} تذكرة</span>
                <h3 className="text-slate-300 font-bold text-sm flex items-center gap-2">
                  <TicketCheck className="w-4 h-4 text-blue-400" /> تذاكر الصيانة
                </h3>
              </div>
              {ticketsLoading ? (
                <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" /></div>
              ) : clientTickets.length === 0 ? (
                <div className="bg-white/5 rounded-2xl p-6 text-center text-slate-500 text-sm">لا توجد تذاكر لهذا العميل</div>
              ) : (
                <div className="space-y-2">
                  {clientTickets.map(t => (
                    <div
                      key={t.id}
                      className="bg-white/5 rounded-xl p-4 flex items-center justify-between gap-3 hover:bg-white/10 cursor-pointer transition-colors"
                      onClick={() => { setSelectedClient(null); navigate(`/tickets/${t.id}`); }}
                    >
                      <ExternalLink className="w-4 h-4 text-slate-600 shrink-0" />
                      <div className="flex-1 text-right">
                        <div className="text-sm text-white font-medium line-clamp-1">{t.description}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{t.refNumber || t.ticketId}</div>
                      </div>
                      <Badge className={`text-[10px] font-bold border shrink-0 ${statusColors[t.status] || statusColors.open}`}>
                        {statusLabels[t.status] || t.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="flex gap-2 mt-4 pt-4 border-t border-border">
              {canWrite && (
                <Button variant="ghost" className="text-slate-300 hover:text-white gap-2 rounded-xl mr-auto" onClick={e => { setSelectedClient(null); openEdit(selectedClient, e); }}>
                  <Pencil className="w-4 h-4" /> تعديل
                </Button>
              )}
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 rounded-xl" onClick={e => openWhatsApp(selectedClient, e)}>
                <Phone className="w-4 h-4" /> واتساب
              </Button>
            </div>
          </>)}
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editClient} onOpenChange={v => { if (!v) setEditClient(null); }}>
        <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[460px] rounded-3xl shadow-2xl shadow-black/40">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-white text-right">تعديل بيانات العميل</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {[
              { label: 'الاسم', value: editName, set: setEditName, placeholder: 'اسم العميل' },
              { label: 'رقم الجوال', value: editPhone, set: setEditPhone, placeholder: '05xxxxxxxx' },
              { label: 'رقم الفيلا', value: editVilla, set: setEditVilla, placeholder: '12' },
              { label: 'رقم البلوك', value: editBlock, set: setEditBlock, placeholder: 'A' },
            ].map(({ label, value, set, placeholder }) => (
              <div key={label} className="space-y-1.5">
                <Label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block text-right">{label}</Label>
                <Input value={value} onChange={e => set(e.target.value)} placeholder={placeholder} className="bg-white/5 border-border text-white rounded-xl h-11 text-right" />
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="border-border text-slate-400 rounded-xl flex-1" onClick={() => setEditClient(null)}>إلغاء</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex-1 gap-2" onClick={saveEdit} disabled={editSaving}>
              {editSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
              حفظ التغييرات
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </Layout>
  );
}



