import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { clientsApi, projectsApi, ticketsApi } from '@/lib/api';
import {
  Search, MoreHorizontal, UserCheck, FileUp, ChevronDown, X,
  TicketCheck, ExternalLink, Pencil, Phone, Building2,
  Download, FileSpreadsheet, Contact,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ClientForm } from '@/components/clients/ClientForm';
import { DataImport } from '@/components/ui/DataImport';
import { Project, Ticket as ClientTicket } from '@/types';
import { toast } from 'sonner';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  const [searchParams]                  = useSearchParams();
  const [search, setSearch]             = useState(searchParams.get('search') || '');
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

  // ── Export state ──────────────────────────────────────────────────────────
  const [exportOpen, setExportOpen]           = useState(false);
  const [exportProjectIds, setExportProjectIds] = useState<string[]>([]);

  const toggleExportProject = (id: string) =>
    setExportProjectIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const clientsForExport = clients.filter(c =>
    exportProjectIds.length === 0 || exportProjectIds.includes(c.projectId)
  );

  // "721 محمد" — villa + first word of name
  const contactName = (c: any) => {
    const first = (c.name || '').trim().split(/\s+/)[0] || '';
    return `${c.villaNumber || ''} ${first}`.trim();
  };

  // Organization tag = "عملاء NTF" → groups contacts by project when searching phone
  const contactOrg = (c: any) => {
    const proj = projects.find(p => p.id === c.projectId);
    const abbr = proj?.abbreviation || proj?.name || '';
    return `عملاء ${abbr}`;
  };

  const exportExcel = () => {
    const rows = clientsForExport.map(c => ({
      'المشروع':      projects.find(p => p.id === c.projectId)?.name || '',
      'رقم الفيلا':  c.villaNumber || '',
      'رقم البلوك':  c.blockNumber || '',
      'الاسم':       c.name || '',
      'رقم الجوال':  c.phone || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false });
    // RTL column widths
    ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'العملاء');
    const label = exportProjectIds.length === 1
      ? (projects.find(p => p.id === exportProjectIds[0])?.abbreviation || 'clients')
      : 'clients';
    XLSX.writeFile(wb, `${label}_clients.xlsx`);
    setExportOpen(false);
  };

  const exportVCard = () => {
    const lines = clientsForExport.map(c => {
      const phone = (c.phone || '').replace(/\D/g, '');
      const intl = phone.startsWith('966') ? phone : phone.startsWith('0') ? '966' + phone.slice(1) : '966' + phone;
      const fn = contactName(c);
      const org = contactOrg(c);
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${fn}`,
        `ORG:${org}`,
        `TEL;TYPE=CELL:+${intl}`,
        'END:VCARD',
      ].join('\r\n');
    });
    const blob = new Blob([lines.join('\r\n')], { type: 'text/vcard;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const label = exportProjectIds.length === 1
      ? (projects.find(p => p.id === exportProjectIds[0])?.abbreviation || 'clients')
      : 'clients';
    a.download = `${label}_clients.vcf`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };

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
      .then((all: any[]) => setClientTickets(all.filter((t: any) => String(t.villaNumber) === String(selectedClient.villaNumber)) as ClientTicket[]))
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
    if (filterBlock && String(c.blockNumber) !== String(filterBlock)) return false;
    if (search) {
      const s = search.toLowerCase();
      return (c.name || '').toLowerCase().includes(s) || String(c.villaNumber || '').includes(s) || String(c.phone || '').includes(s);
    }
    return true;
  });

  if (search) {
    const s = search.toLowerCase();
    filtered.sort((a, b) => {
      const aExact = String(a.villaNumber || '') === s || String(a.phone || '') === s || (a.name || '').toLowerCase() === s;
      const bExact = String(b.villaNumber || '') === s || String(b.phone || '') === s || (b.name || '').toLowerCase() === s;
      
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      const aStarts = String(a.villaNumber || '').startsWith(s) || String(a.phone || '').startsWith(s) || (a.name || '').toLowerCase().startsWith(s);
      const bStarts = String(b.villaNumber || '').startsWith(s) || String(b.phone || '').startsWith(s) || (b.name || '').toLowerCase().startsWith(s);
      
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      return 0; // Fallback to original order
    });
  }

  const projectName = (id: string) => projects.find(p => p.id === id)?.name || '---';

  return (
    <Layout>
      <div className="space-y-4 page-in">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="text-right">
            <h1 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">العملاء</h1>
            <p className="text-muted-foreground text-xs hidden sm:block">إدارة بيانات أصحاب الفلل والتواصل معهم</p>
          </div>
          <div className="flex gap-2">
            {/* ── Export button ── */}
            <Dialog open={exportOpen} onOpenChange={v => { setExportOpen(v); if (v) setExportProjectIds(filterProject ? [filterProject] : []); }}>
              {/* @ts-expect-error type mismatch with Radix UI */}
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2 rounded-2xl h-10 font-bold border-border">
                  <Download className="w-4 h-4" /> تصدير
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border sm:max-w-[460px] rounded-3xl shadow-2xl" dir="rtl">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-foreground text-right">تصدير العملاء</DialogTitle>
                </DialogHeader>

                {/* Project selector */}
                <div className="space-y-3 py-1">
                  <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">اختر المشاريع</p>
                  <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto">
                    {projects.map(p => {
                      const checked = exportProjectIds.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => toggleExportProject(p.id)}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors text-right',
                            checked
                              ? 'bg-primary/10 border-primary/40 text-primary'
                              : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/60',
                          )}
                        >
                          <span className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors', checked ? 'bg-primary border-primary' : 'border-border')}>
                            {checked && <span className="text-white text-[10px] font-black">✓</span>}
                          </span>
                          <span className="truncate">{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  {exportProjectIds.length === 0 && (
                    <p className="text-xs text-amber-500">لم تختر مشروعاً — سيتم تصدير كل العملاء</p>
                  )}
                  <p className="text-xs text-muted-foreground/70">
                    {clientsForExport.length} عميل سيُصدَّر
                    {exportProjectIds.length > 0 && ` من ${exportProjectIds.length} مشروع`}
                  </p>

                  {/* Format note */}
                  <div className="bg-muted/30 border border-border/50 rounded-xl p-3 text-xs text-muted-foreground space-y-1">
                    <p className="font-bold text-foreground text-xs mb-1">صيغة الاسم في جهات الاتصال:</p>
                    <p><span className="font-mono bg-muted px-1 rounded">721 محمد</span> — رقم الفيلا + أول اسم</p>
                    <p><span className="font-mono bg-muted px-1 rounded">عملاء NTF</span> — اسم الشركة (هاشتاج للبحث)</p>
                  </div>

                  {/* Action buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={exportExcel}
                      className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors"
                    >
                      <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                      <div className="text-center">
                        <p className="text-sm font-bold text-foreground">Excel</p>
                        <p className="text-[10px] text-muted-foreground">للكمبيوتر</p>
                      </div>
                    </button>
                    <button
                      onClick={exportVCard}
                      className="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 transition-colors"
                    >
                      <Contact className="w-6 h-6 text-blue-400" />
                      <div className="text-center">
                        <p className="text-sm font-bold text-foreground">جهات اتصال</p>
                        <p className="text-[10px] text-muted-foreground">iPhone / Android</p>
                      </div>
                    </button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            {canWrite && (
              <Dialog open={importOpen} onOpenChange={v => { setImportOpen(v); if (!v) setImportProjectId(''); }}>
                {/* @ts-expect-error type mismatch with Radix UI */}
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
                        {/* @ts-expect-error type mismatch with Radix UI */}
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="w-full justify-between border-border rounded-xl h-11">
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            <span className="text-foreground">{projects.find(p => p.id === importProjectId)?.name || 'اختر المشروع'}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="bg-card border-border w-72">
                          {projects.map(p => (
                            <DropdownMenuItem key={p.id} className="hover:bg-muted cursor-pointer text-start justify-start" onClick={() => setImportProjectId(p.id)}>
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
          <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px] sm:max-w-xs">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="البحث باسم أو فيلا أو جوال..."
                className="bg-muted/50 border-transparent focus:border-primary/30 pr-9 text-right rounded-xl h-9 text-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <DropdownMenu>
              {/* @ts-expect-error type mismatch with Radix UI */}
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-border rounded-xl h-9 px-3 gap-1.5 text-xs font-medium min-w-[110px] justify-between">
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  <span className="truncate max-w-[90px]">{filterProject ? projectName(filterProject) : 'كل المشاريع'}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-border w-52">
                <DropdownMenuItem className="hover:bg-muted cursor-pointer text-start justify-start text-muted-foreground text-xs" onClick={() => setFilterProject('')}>كل المشاريع</DropdownMenuItem>
                {projects.map(p => (
                  <DropdownMenuItem key={p.id} className="hover:bg-muted cursor-pointer text-start justify-start text-xs" onClick={() => setFilterProject(p.id)}>{p.name}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {blockNumbers.length > 0 && (
              <DropdownMenu>
                {/* @ts-expect-error type mismatch with Radix UI */}
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="border-border rounded-xl h-9 px-3 gap-1.5 text-xs font-medium min-w-[100px] justify-between">
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    <span>{filterBlock ? `بلوك ${filterBlock}` : 'كل البلوكات'}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-card border-border w-36 max-h-52 overflow-y-auto">
                  <DropdownMenuItem className="hover:bg-muted cursor-pointer text-start justify-start text-muted-foreground text-xs" onClick={() => setFilterBlock('')}>كل البلوكات</DropdownMenuItem>
                  {blockNumbers.map(b => (
                    <DropdownMenuItem key={b} className="hover:bg-muted cursor-pointer text-start justify-start text-xs" onClick={() => setFilterBlock(b)}>بلوك {b}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {(filterProject || filterBlock) && (
              <Button variant="ghost" size="sm" className="h-9 px-2 text-muted-foreground hover:text-foreground gap-1 text-xs" onClick={() => { setFilterProject(''); setFilterBlock(''); }}>
                <X className="w-3 h-3" />
              </Button>
            )}
            <span className="text-muted-foreground text-xs font-bold mr-auto">{filtered.length} عميل</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-[10px] font-black uppercase tracking-widest border-b border-border">
                  <th className="px-4 py-2.5">العميل</th>
                  <th className="px-4 py-2.5 hidden sm:table-cell">رقم الفيلا</th>
                  <th className="px-4 py-2.5 hidden md:table-cell">رقم البلوك</th>
                  <th className="px-4 py-2.5 hidden lg:table-cell">رقم الهاتف</th>
                  <th className="px-4 py-2.5 hidden xl:table-cell">المشروع</th>
                  <th className="px-4 py-2.5 text-center w-12">...</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3"><div className="flex items-center gap-2.5"><div className="w-7 h-7 shimmer rounded-full shrink-0" /><div className="space-y-1.5"><div className="h-3.5 shimmer rounded w-28" /><div className="h-2.5 shimmer rounded w-16" /></div></div></td>
                      <td className="px-4 py-3 hidden sm:table-cell"><div className="h-3.5 shimmer rounded w-16 ml-auto" /></td>
                      <td className="px-4 py-3 hidden md:table-cell"><div className="h-3.5 shimmer rounded w-10 ml-auto" /></td>
                      <td className="px-4 py-3 hidden lg:table-cell"><div className="h-3.5 shimmer rounded w-24 ml-auto" /></td>
                      <td className="px-4 py-3 hidden xl:table-cell"><div className="h-3.5 shimmer rounded w-20 ml-auto" /></td>
                      <td className="px-4 py-3"><div className="w-5 h-5 shimmer rounded mx-auto" /></td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">لا يوجد عملاء مطابقين</td>
                  </tr>
                ) : filtered.map(c => (
                  <tr
                    key={c.id}
                    className="group hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedClient(c)}
                  >
                    {/* Mobile: name + villa + block stacked; Desktop: just name */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
                          <UserCheck className="w-3.5 h-3.5" />
                        </div>
                        <div className="text-right min-w-0">
                          <div className="font-semibold text-foreground text-sm leading-tight truncate">{c.name || '—'}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5 sm:hidden">
                            فيلا {c.villaNumber}{c.blockNumber ? ` · بلوك ${c.blockNumber}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      <span className="text-sm font-bold text-foreground">فيلا {c.villaNumber}</span>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">{c.blockNumber || '---'}</span>
                    </td>
                    <td className="px-4 py-2.5 hidden lg:table-cell">
                      <span className="text-sm font-mono text-muted-foreground dir-ltr">{c.phone || '---'}</span>
                    </td>
                    <td className="px-4 py-2.5 hidden xl:table-cell">
                      <span className="text-sm text-muted-foreground">{projectName(c.projectId)}</span>
                    </td>
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-center">
                        <DropdownMenu>
                          {/* @ts-expect-error type mismatch with Radix UI */}
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg">
                              <MoreHorizontal className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border w-40 rounded-2xl">
                            {canWrite && (
                              <DropdownMenuItem className="hover:bg-muted cursor-pointer text-start justify-start gap-2 rounded-xl mx-1 my-0.5 text-sm" onClick={e => openEdit(c, e)}>
                                <Pencil className="w-3.5 h-3.5" /> تعديل
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="hover:bg-muted cursor-pointer text-emerald-500 text-start justify-start gap-2 rounded-xl mx-1 my-0.5 text-sm" onClick={e => openWhatsApp(c, e)}>
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
        <DialogContent
          className="bg-card border-border p-0 flex flex-col gap-0 overflow-hidden shadow-2xl
            !fixed !bottom-0 !top-auto !left-0 !right-0 !translate-x-0 !translate-y-0
            !max-w-full !w-full !rounded-b-none rounded-t-2xl max-h-[88dvh]
            sm:!top-1/2 sm:!bottom-auto sm:!left-1/2 sm:!right-auto
            sm:!-translate-x-1/2 sm:!-translate-y-1/2
            sm:!max-w-[520px] sm:!w-[calc(100%-2rem)] sm:!rounded-2xl sm:max-h-[90dvh]"
          dir="rtl"
        >
          {selectedClient && (<>
            {/* ── Fixed header with action buttons ── */}
            <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border/60">
              {/* drag handle on mobile */}
              <div className="w-10 h-1 bg-border rounded-full mx-auto mb-3 sm:hidden" />
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                  <UserCheck className="w-4.5 h-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-foreground text-sm leading-tight truncate">{selectedClient.name || '—'}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">فيلا {selectedClient.villaNumber}{selectedClient.blockNumber ? ` · بلوك ${selectedClient.blockNumber}` : ''}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {canWrite && (
                    <button
                      onClick={e => { setSelectedClient(null); openEdit(selectedClient, e); }}
                      className="flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <Pencil className="w-3 h-3" /> تعديل
                    </button>
                  )}
                  <button
                    onClick={e => openWhatsApp(selectedClient, e)}
                    className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    <Phone className="w-3 h-3" /> واتساب
                  </button>
                </div>
              </div>
            </div>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'رقم الفيلا',  value: `فيلا ${selectedClient.villaNumber}` },
                  { label: 'رقم البلوك',  value: selectedClient.blockNumber || '---' },
                  { label: 'رقم الجوال',  value: selectedClient.phone || '---' },
                  { label: 'المشروع',     value: projectName(selectedClient.projectId) },
                  ...(selectedClient.handoverDate        ? [{ label: 'تسليم',         value: selectedClient.handoverDate }]        : []),
                  ...(selectedClient.warrantyExpiryDate  ? [{ label: 'انتهاء الضمان', value: selectedClient.warrantyExpiryDate }]  : []),
                ].map(field => (
                  <div key={field.label} className="bg-muted/50 rounded-xl p-2.5 text-right">
                    <p className="text-muted-foreground text-[10px] font-black uppercase tracking-wider mb-0.5">{field.label}</p>
                    <p className="text-foreground font-bold text-sm truncate">{field.value}</p>
                  </div>
                ))}
              </div>

              {/* Tickets */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-muted-foreground text-[11px] font-bold bg-muted/60 px-2 py-0.5 rounded-full">{clientTickets.length} تذكرة</span>
                  <h3 className="text-foreground font-bold text-xs flex items-center gap-1.5">
                    <TicketCheck className="w-3.5 h-3.5 text-primary" /> تذاكر الصيانة
                  </h3>
                </div>
                {ticketsLoading ? (
                  <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
                ) : clientTickets.length === 0 ? (
                  <div className="bg-muted/50 rounded-xl p-5 text-center text-muted-foreground text-sm">لا توجد تذاكر لهذا العميل</div>
                ) : (
                  <div className="space-y-1.5">
                    {clientTickets.map(t => (
                      <div
                        key={t.id}
                        className="bg-muted/50 rounded-xl px-3 py-2.5 flex items-center gap-2.5 hover:bg-muted cursor-pointer transition-colors"
                        onClick={() => { setSelectedClient(null); navigate(`/tickets/${t.id}`); }}
                      >
                        <div className="flex-1 text-right min-w-0">
                          <div className="text-sm text-foreground font-medium line-clamp-1 leading-tight">{t.description}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{t.refNumber || t.ticketId}</div>
                        </div>
                        <Badge className={`text-[10px] font-bold border shrink-0 ${statusColors[t.status] || statusColors.open}`}>
                          {statusLabels[t.status] || t.status}
                        </Badge>
                        <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
