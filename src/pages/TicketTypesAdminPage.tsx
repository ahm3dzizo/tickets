import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Trash2, Pencil, ChevronDown, ChevronUp,
  Tags, Layers, Hash, CheckCircle2, Loader2, X,
  ToggleLeft, ToggleRight, AlertTriangle, Brain, BarChart2,
  Wrench, Zap, Globe, FolderPlus,
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getAuthHeaders } from '@/services/classificationApi';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Keyword {
  id: string;
  keyword: string;
  weight: number;
  source: string;
  isLearned: boolean;
  usageCount: number;
}

interface SubType {
  id: string;
  nameAr: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  keywords: Keyword[];
  _count?: { tickets: number };
}

interface TicketTypeItem {
  id: string;
  key: string;
  nameAr: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  specialtyId?: string;
  specialty?: { id: string; key: string; nameAr: string };
  keywords: Keyword[];
  subTypes: SubType[];
  _count?: { tickets: number; keywords: number };
  hasSubtypeModel?: boolean;
}

interface Specialty {
  id: string;
  key: string;
  nameAr: string;
  sortOrder: number;
}

// ─── Specialty theme ──────────────────────────────────────────────────────────
const SPEC_THEME: Record<string, { border: string; header: string; badge: string; text: string; icon: React.ReactNode }> = {
  mechanics:   { border: 'border-blue-500/25', header: 'bg-blue-500/8', badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30', text: 'text-blue-400', icon: <Wrench className="w-4 h-4" /> },
  electricity: { border: 'border-amber-500/25', header: 'bg-amber-500/8', badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30', text: 'text-amber-400', icon: <Zap className="w-4 h-4" /> },
  general:     { border: 'border-slate-500/25', header: 'bg-slate-500/8', badge: 'bg-slate-500/15 text-slate-300 border-slate-500/30', text: 'text-slate-300', icon: <Globe className="w-4 h-4" /> },
};
const DEFAULT_THEME = { border: 'border-purple-500/25', header: 'bg-purple-500/8', badge: 'bg-purple-500/15 text-purple-300 border-purple-500/30', text: 'text-purple-400', icon: <Tags className="w-4 h-4" /> };

const getTheme = (key?: string) => (key && SPEC_THEME[key]) || DEFAULT_THEME;

// ─── API helpers ──────────────────────────────────────────────────────────────
const BASE = '/api/admin/ticket-types';

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(options?.headers ?? {}) } });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'فشل الطلب'); }
  return res.json();
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse rounded-xl bg-white/5', className)} />
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, icon: Icon, color, bg }: { label: string; value: number; icon: any; color: string; bg: string }) => (
  <Card className="bg-white/5 border-border">
    <CardContent className="p-4 flex items-center gap-4">
      <div className={cn('p-3 rounded-xl', bg)}>
        <Icon className={cn('w-5 h-5', color)} />
      </div>
      <div className="text-right">
        <p className="text-slate-400 text-xs">{label}</p>
        <p className="text-white text-2xl font-bold tabular-nums">{value}</p>
      </div>
    </CardContent>
  </Card>
);

// ─── Input component ─────────────────────────────────────────────────────────
const Field = ({ label, value, onChange, placeholder, required, textarea }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; textarea?: boolean;
}) => (
  <div className="space-y-1.5">
    <label className="block text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">
      {label}{required && <span className="text-red-400 mr-1">*</span>}
    </label>
    {textarea ? (
      <textarea
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} rows={2}
        className="w-full bg-white/5 border border-border text-slate-200 rounded-xl px-4 py-2.5 text-sm text-right resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-600 transition-all"
      />
    ) : (
      <input
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required={required}
        className="w-full bg-white/5 border border-border text-slate-200 rounded-xl px-4 h-11 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-600 transition-all"
      />
    )}
  </div>
);

// ─── Modal wrapper ────────────────────────────────────────────────────────────
const Modal = ({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-card border border-border rounded-3xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors rounded-lg p-1">
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold text-white">{title}</h2>
        </div>
        <div className="p-5 max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

// ─── Confirm Delete Modal ─────────────────────────────────────────────────────
const ConfirmDelete = ({ open, onClose, onConfirm, name, loading }: {
  open: boolean; onClose: () => void; onConfirm: () => void; name: string; loading: boolean;
}) => (
  <Modal open={open} onClose={onClose} title="تأكيد الحذف">
    <div className="text-center space-y-4 py-2">
      <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
        <AlertTriangle className="w-7 h-7 text-red-400" />
      </div>
      <p className="text-slate-300 text-sm">هل تريد حذف <span className="text-white font-bold">"{name}"</span>؟ لا يمكن التراجع عن هذا الإجراء.</p>
      <div className="flex gap-3 pt-2">
        <Button onClick={onConfirm} disabled={loading} className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl h-11">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حذف'}
        </Button>
        <Button variant="ghost" onClick={onClose} className="flex-1 text-slate-400 hover:text-white rounded-xl h-11 border border-border">
          إلغاء
        </Button>
      </div>
    </div>
  </Modal>
);

// ─── Keyword Chip ─────────────────────────────────────────────────────────────
const KeywordChip = ({ kw, onDelete }: { kw: Keyword; onDelete: () => void }) => (
  <span className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-border text-xs text-slate-400 hover:border-red-500/30 transition-all">
    <span>{kw.keyword}</span>
    {kw.weight !== 1 && <span className="text-[9px] text-slate-600 tabular-nums">{kw.weight.toFixed(1)}</span>}
    {kw.isLearned && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60" title="تم تعلمه تلقائياً" />}
    <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-all ml-0.5">
      <X className="w-3 h-3" />
    </button>
  </span>
);

// ─── Keyword Section ──────────────────────────────────────────────────────────
const KeywordsSection = ({ typeId, subTypeId, keywords, onRefresh }: {
  typeId: string; subTypeId?: string; keywords: Keyword[]; onRefresh: () => void;
}) => {
  const [newKw, setNewKw] = useState('');
  const [adding, setAdding] = useState(false);

  const addKeyword = async () => {
    const kw = newKw.trim();
    if (!kw) return;
    setAdding(true);
    try {
      const url = subTypeId ? `${BASE}/${typeId}/subtypes/${subTypeId}/keywords` : `${BASE}/${typeId}/keywords`;
      await apiFetch(url, { method: 'POST', body: JSON.stringify({ keyword: kw, weight: 1.0 }) });
      setNewKw('');
      onRefresh();
      toast.success('تمت إضافة الكلمة المفتاحية');
    } catch (e: any) { toast.error(e.message); }
    finally { setAdding(false); }
  };

  const deleteKeyword = async (kwId: string) => {
    try {
      const url = subTypeId ? `${BASE}/${typeId}/subtypes/${subTypeId}/keywords/${kwId}` : `${BASE}/${typeId}/keywords/${kwId}`;
      await apiFetch(url, { method: 'DELETE' });
      onRefresh();
      toast.success('تم حذف الكلمة المفتاحية');
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {keywords.length === 0
          ? <span className="text-slate-600 text-xs">لا توجد كلمات مفتاحية</span>
          : keywords.map(kw => <KeywordChip key={kw.id} kw={kw} onDelete={() => deleteKeyword(kw.id)} />)
        }
      </div>
      <div className="flex gap-2 mt-2">
        <input
          value={newKw} onChange={e => setNewKw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addKeyword()}
          placeholder="كلمة جديدة..."
          className="flex-1 bg-white/5 border border-border text-slate-200 rounded-xl px-3 h-8 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-600 transition-all"
        />
        <button onClick={addKeyword} disabled={adding || !newKw.trim()}
          className="px-3 h-8 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/20 text-blue-400 text-xs font-bold transition-all disabled:opacity-40 flex items-center gap-1">
          {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          إضافة
        </button>
      </div>
    </div>
  );
};

// ─── SubType Row ──────────────────────────────────────────────────────────────
const SubTypeRow = ({ st, typeId, onRefresh }: { st: SubType; typeId: string; onRefresh: () => void }) => {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const deleteSubType = async () => {
    setDeleting(true);
    try {
      await apiFetch(`${BASE}/${typeId}/subtypes/${st.id}`, { method: 'DELETE' });
      toast.success('تم حذف النوع الفرعي');
      onRefresh();
    } catch (e: any) { toast.error(e.message); setDeleting(false); }
  };

  const toggleActive = async () => {
    try {
      await apiFetch(`${BASE}/${typeId}/subtypes/${st.id}`, { method: 'PUT', body: JSON.stringify({ isActive: !st.isActive }) });
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <>
      <div className={cn(
        'rounded-xl border transition-all duration-200',
        st.isActive ? 'border-border bg-white/3' : 'border-border/40 bg-white/1 opacity-60'
      )}>
        <div className="flex items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2">
            <button onClick={toggleActive} className="text-slate-500 hover:text-slate-300 transition-colors">
              {st.isActive
                ? <ToggleRight className="w-4 h-4 text-emerald-400" />
                : <ToggleLeft className="w-4 h-4" />}
            </button>
            <button onClick={() => setConfirmDel(true)} disabled={deleting}
              className="text-slate-600 hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setExpanded(v => !v)} className="text-slate-500 hover:text-slate-300 transition-colors">
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="flex items-center gap-2 text-right">
            <span className="text-slate-300 text-sm font-medium">{st.nameAr}</span>
            {(st._count?.tickets ?? 0) > 0 && (
              <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400 font-bold h-4 px-1.5">
                {(st._count?.tickets ?? 0).toLocaleString()} تذكرة
              </Badge>
            )}
            <Badge variant="outline" className="text-[9px] border-border text-slate-500 font-normal h-4 px-1.5">
              {st.keywords.length} كلمة
            </Badge>
          </div>
        </div>
        {expanded && (
          <div className="px-3 pb-3 border-t border-border/40 pt-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
            <KeywordsSection typeId={typeId} subTypeId={st.id} keywords={st.keywords} onRefresh={onRefresh} />
          </div>
        )}
      </div>
      <ConfirmDelete open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={deleteSubType} name={st.nameAr} loading={deleting} />
    </>
  );
};

// ─── Type Card ────────────────────────────────────────────────────────────────
const TypeCard = ({ type, specialties, onRefresh }: {
  type: TicketTypeItem; specialties: Specialty[]; onRefresh: () => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'keywords' | 'subtypes'>('keywords');
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addSubOpen, setAddSubOpen] = useState(false);

  const [editData, setEditData] = useState({ nameAr: type.nameAr, description: type.description || '', specialtyId: type.specialtyId || '', isActive: type.isActive });
  const [newSubName, setNewSubName] = useState('');
  const [newSubDesc, setNewSubDesc] = useState('');
  const [addingSubtype, setAddingSubtype] = useState(false);

  const handleEdit = async () => {
    setSaving(true);
    try {
      await apiFetch(`${BASE}/${type.id}`, { method: 'PUT', body: JSON.stringify(editData) });
      toast.success('تم تحديث النوع');
      setEditOpen(false);
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await apiFetch(`${BASE}/${type.id}`, { method: 'DELETE' });
      toast.success('تم حذف النوع');
      onRefresh();
    } catch (e: any) { toast.error(e.message); setDeleting(false); }
  };

  const toggleActive = async () => {
    try {
      await apiFetch(`${BASE}/${type.id}`, { method: 'PUT', body: JSON.stringify({ isActive: !type.isActive }) });
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
  };

  const addSubType = async () => {
    if (!newSubName.trim()) return;
    setAddingSubtype(true);
    try {
      await apiFetch(`${BASE}/${type.id}/subtypes`, { method: 'POST', body: JSON.stringify({ nameAr: newSubName.trim(), description: newSubDesc.trim() }) });
      toast.success('تمت إضافة النوع الفرعي');
      setNewSubName(''); setNewSubDesc('');
      setAddSubOpen(false);
      onRefresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setAddingSubtype(false); }
  };

  const totalSubTickets = type.subTypes.reduce((s, st) => s + (st._count?.tickets ?? 0), 0);
  const hasDistribution = totalSubTickets > 0 && type.subTypes.length > 0;

  return (
    <>
      <Card className={cn(
        'border transition-all duration-200 overflow-hidden',
        type.isActive ? 'bg-white/5 border-border hover:border-white/20' : 'bg-white/2 border-border/40 opacity-60'
      )}>
        <CardContent className="p-0">
          {/* ── Card Header ── */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setExpanded(v => !v)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-border flex items-center justify-center text-slate-400 hover:text-white transition-all">
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <button onClick={() => { setEditData({ nameAr: type.nameAr, description: type.description || '', specialtyId: type.specialtyId || '', isActive: type.isActive }); setEditOpen(true); }}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-border flex items-center justify-center text-slate-400 hover:text-blue-400 transition-all">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setConfirmDel(true)}
                className="w-8 h-8 rounded-xl bg-white/5 hover:bg-red-500/10 border border-border flex items-center justify-center text-slate-400 hover:text-red-400 transition-all">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-3 text-right">
              <div>
                <div className="flex items-center justify-start gap-2">
                  <p className="text-white font-semibold">{type.nameAr}</p>
                  <button onClick={toggleActive}>
                    {type.isActive
                      ? <ToggleRight className="w-4 h-4 text-emerald-400" />
                      : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                  </button>
                  {type.hasSubtypeModel && (
                    <span title="يوجد نموذج ML مخصص للأنواع الفرعية" className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      <Brain className="w-2.5 h-2.5" /> ML
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-start gap-2 mt-1">
                  <code className="text-[10px] text-slate-500 font-mono bg-white/5 px-1.5 py-0.5 rounded">{type.key}</code>
                </div>
                {type.description && (
                  <p className="text-slate-500 text-xs mt-1 text-right">{type.description}</p>
                )}
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-border shrink-0">
                <Tags className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>

          {/* ── Stats row ── */}
          <div className="flex items-center justify-start gap-4 px-4 pb-3">
            <div className="flex items-center gap-1.5 text-slate-500 text-xs">
              <span>{type._count?.tickets ?? 0} تذكرة</span>
              <CheckCircle2 className="w-3 h-3" />
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 text-xs">
              <span>{type.subTypes.length} نوع فرعي</span>
              <Layers className="w-3 h-3" />
            </div>
            <div className="flex items-center gap-1.5 text-slate-500 text-xs">
              <span>{type.keywords.length} كلمة مفتاحية</span>
              <Hash className="w-3 h-3" />
            </div>
          </div>

          {/* ── Expanded section ── */}
          {expanded && (
            <div className="border-t border-border animate-in fade-in slide-in-from-top-2 duration-200">
              {hasDistribution && (
                <div className="px-4 pt-3 pb-1 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 justify-end">
                    <BarChart2 className="w-3 h-3" />
                    <span>توزيع الأنواع الفرعية ({totalSubTickets.toLocaleString()} تذكرة)</span>
                  </div>
                  <div className="flex h-2 rounded-full overflow-hidden gap-px">
                    {type.subTypes.filter(st => (st._count?.tickets ?? 0) > 0).map((st, i) => {
                      const pct = Math.max(2, Math.round(((st._count?.tickets ?? 0) / totalSubTickets) * 100));
                      const colors = ['bg-blue-500','bg-emerald-500','bg-amber-500','bg-purple-500','bg-teal-500','bg-pink-500','bg-orange-500'];
                      return <div key={st.id} title={`${st.nameAr}: ${st._count?.tickets}`} className={cn('transition-all', colors[i % colors.length])} style={{ width: `${pct}%` }} />;
                    })}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 justify-end">
                    {type.subTypes.filter(st => (st._count?.tickets ?? 0) > 0).map((st, i) => {
                      const colors = ['text-blue-400','text-emerald-400','text-amber-400','text-purple-400','text-teal-400','text-pink-400','text-orange-400'];
                      return (
                        <span key={st.id} className={cn('text-[9px]', colors[i % colors.length])}>
                          {st.nameAr} {st._count?.tickets}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex gap-1 p-3 pb-0">
                {([['keywords', 'الكلمات المفتاحية', Hash], ['subtypes', 'الأنواع الفرعية', Layers]] as const).map(([key, label, Icon]) => (
                  <button key={key} onClick={() => setTab(key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all',
                      tab === key ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                    )}>
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>

              <div className="p-4">
                {tab === 'keywords' && (
                  <KeywordsSection typeId={type.id} keywords={type.keywords} onRefresh={onRefresh} />
                )}

                {tab === 'subtypes' && (
                  <div className="space-y-2">
                    {type.subTypes.length === 0 && (
                      <p className="text-slate-600 text-xs text-right">لا توجد أنواع فرعية</p>
                    )}
                    {type.subTypes.map(st => (
                      <SubTypeRow key={st.id} st={st} typeId={type.id} onRefresh={onRefresh} />
                    ))}
                    {addSubOpen ? (
                      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
                        <Field label="الاسم بالعربي" value={newSubName} onChange={setNewSubName} placeholder="مثال: تسرب مياه من الصنبور" required />
                        <Field label="وصف اختياري" value={newSubDesc} onChange={setNewSubDesc} placeholder="وصف مختصر..." textarea />
                        <div className="flex gap-2 pt-1">
                          <Button onClick={addSubType} disabled={addingSubtype || !newSubName.trim()}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-9 text-sm">
                            {addingSubtype ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إضافة'}
                          </Button>
                          <Button variant="ghost" onClick={() => { setAddSubOpen(false); setNewSubName(''); setNewSubDesc(''); }}
                            className="flex-1 text-slate-500 hover:text-white rounded-xl h-9 text-sm border border-border">
                            إلغاء
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setAddSubOpen(true)}
                        className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border border-dashed border-border/60 text-slate-500 hover:text-slate-300 hover:border-border text-xs transition-all">
                        <Plus className="w-3.5 h-3.5" />
                        إضافة نوع فرعي
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`تعديل: ${type.nameAr}`}>
        <div className="space-y-4">
          <Field label="الاسم بالعربي" value={editData.nameAr} onChange={v => setEditData(p => ({ ...p, nameAr: v }))} required />
          <Field label="الوصف (اختياري)" value={editData.description} onChange={v => setEditData(p => ({ ...p, description: v }))} placeholder="وصف مختصر..." textarea />
          <div className="space-y-1.5">
            <label className="block text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">التخصص</label>
            <select value={editData.specialtyId} onChange={e => setEditData(p => ({ ...p, specialtyId: e.target.value }))}
              className="w-full bg-white/5 border border-border text-slate-200 rounded-xl px-4 h-11 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none">
              <option value="">— بدون تخصص —</option>
              {specialties.map(s => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-border">
            <button onClick={() => setEditData(p => ({ ...p, isActive: !p.isActive }))}
              className={cn('transition-all', editData.isActive ? 'text-emerald-400' : 'text-slate-500')}>
              {editData.isActive ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
            </button>
            <span className="text-slate-300 text-sm">تفعيل النوع</span>
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={handleEdit} disabled={saving || !editData.nameAr.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'حفظ التغييرات'}
            </Button>
            <Button variant="ghost" onClick={() => setEditOpen(false)}
              className="flex-1 text-slate-400 hover:text-white rounded-xl h-11 border border-border">
              إلغاء
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDelete open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={handleDelete} name={type.nameAr} loading={deleting} />
    </>
  );
};

// ─── Add Type Inline Form (inside a specialty section) ────────────────────────
const AddTypeInline = ({ specialtyId, onDone, specialties }: {
  specialtyId: string; onDone: () => void; specialties: Specialty[];
}) => {
  const [data, setData] = useState({ key: '', nameAr: '', description: '', specialtyId });
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!data.key.trim() || !data.nameAr.trim()) return;
    setSaving(true);
    try {
      await apiFetch(BASE, { method: 'POST', body: JSON.stringify(data) });
      toast.success('تمت إضافة النوع بنجاح');
      onDone();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150">
      <p className="text-blue-400 text-xs font-bold text-right">إضافة نوع جديد</p>
      <Field label="المفتاح (key) بالإنجليزية" value={data.key}
        onChange={v => setData(p => ({ ...p, key: v.toLowerCase().replace(/\s+/g, '_') }))}
        placeholder="مثال: plumbing" required />
      <Field label="الاسم بالعربي" value={data.nameAr}
        onChange={v => setData(p => ({ ...p, nameAr: v }))} placeholder="مثال: السباكة" required />
      <Field label="الوصف (اختياري)" value={data.description}
        onChange={v => setData(p => ({ ...p, description: v }))} placeholder="وصف مختصر..." textarea />
      <div className="space-y-1.5">
        <label className="block text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">التخصص</label>
        <select value={data.specialtyId} onChange={e => setData(p => ({ ...p, specialtyId: e.target.value }))}
          className="w-full bg-white/5 border border-border text-slate-200 rounded-xl px-4 h-10 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none">
          <option value="">— بدون تخصص —</option>
          {specialties.map(s => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <Button onClick={handleAdd} disabled={saving || !data.key.trim() || !data.nameAr.trim()}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 text-sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إضافة النوع'}
        </Button>
        <Button variant="ghost" onClick={onDone}
          className="flex-1 text-slate-400 hover:text-white rounded-xl h-10 text-sm border border-border">
          إلغاء
        </Button>
      </div>
    </div>
  );
};

// ─── Specialty Section ────────────────────────────────────────────────────────
const SpecialtySection = ({ specialty, types, allSpecialties, onRefresh, onEditSpecialty, onDeleteSpecialty }: {
  specialty: Specialty | null;
  types: TicketTypeItem[];
  allSpecialties: Specialty[];
  onRefresh: () => void;
  onEditSpecialty: (s: Specialty) => void;
  onDeleteSpecialty: (s: Specialty) => void;
}) => {
  const [expanded, setExpanded] = useState(true);
  const [addingType, setAddingType] = useState(false);
  const theme = getTheme(specialty?.key);

  const label = specialty ? specialty.nameAr : 'غير مصنف';
  const specId = specialty?.id ?? '';

  return (
    <div className={cn('rounded-2xl border overflow-hidden', theme.border)}>
      {/* ── Specialty Header ── */}
      <div className={cn('flex items-center justify-between px-5 py-3', theme.header)}>
        {/* Left: actions */}
        <div className="flex items-center gap-2">
          <button onClick={() => setExpanded(v => !v)}
            className="text-slate-500 hover:text-slate-300 transition-colors">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {specialty && (
            <>
              <button onClick={() => onEditSpecialty(specialty)}
                className="text-slate-500 hover:text-blue-400 transition-colors" title="تعديل التخصص">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDeleteSpecialty(specialty)}
                className="text-slate-500 hover:text-red-400 transition-colors" title="حذف التخصص">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button onClick={() => setAddingType(true)}
            className={cn('flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg border transition-all', theme.badge)}>
            <Plus className="w-3 h-3" />
            نوع جديد
          </button>
        </div>

        {/* Right: specialty name */}
        <div className="flex items-center gap-2.5 text-right">
          <div>
            <div className="flex items-center gap-2">
              <span className={cn('text-base font-bold', theme.text)}>{label}</span>
              {specialty && (
                <code className="text-[9px] text-slate-600 font-mono bg-white/5 px-1 py-0.5 rounded">{specialty.key}</code>
              )}
            </div>
            <p className="text-slate-500 text-xs">{types.length} {types.length === 1 ? 'نوع' : 'أنواع'}</p>
          </div>
          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center border', theme.badge)}>
            {theme.icon}
          </div>
        </div>
      </div>

      {/* ── Types under this specialty ── */}
      {expanded && (
        <div className="p-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          {addingType && (
            <AddTypeInline
              specialtyId={specId}
              specialties={allSpecialties}
              onDone={() => { setAddingType(false); onRefresh(); }}
            />
          )}
          {types.length === 0 && !addingType && (
            <p className="text-slate-600 text-xs text-center py-4">لا توجد أنواع تذاكر في هذا التخصص</p>
          )}
          {types.map(type => (
            <TypeCard key={type.id} type={type} specialties={allSpecialties} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Specialty Modal (add / edit) ─────────────────────────────────────────────
const SpecialtyModal = ({ open, onClose, editing, onRefresh }: {
  open: boolean; onClose: () => void; editing: Specialty | null; onRefresh: () => void;
}) => {
  const [data, setData] = useState({ key: '', nameAr: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setData(editing ? { key: editing.key, nameAr: editing.nameAr } : { key: '', nameAr: '' });
    }
  }, [open, editing]);

  const handleSave = async () => {
    if (!data.nameAr.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await apiFetch(`${BASE}/specialties/${editing.id}`, { method: 'PUT', body: JSON.stringify({ nameAr: data.nameAr.trim() }) });
        toast.success('تم تحديث التخصص');
      } else {
        if (!data.key.trim()) return;
        await apiFetch(`${BASE}/specialties`, { method: 'POST', body: JSON.stringify({ key: data.key.trim(), nameAr: data.nameAr.trim() }) });
        toast.success('تمت إضافة التخصص');
      }
      onRefresh();
      onClose();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? `تعديل تخصص: ${editing.nameAr}` : 'إضافة تخصص جديد'}>
      <div className="space-y-4">
        {!editing && (
          <Field label="المفتاح (key) بالإنجليزية" value={data.key}
            onChange={v => setData(p => ({ ...p, key: v.toLowerCase().replace(/\s+/g, '_') }))}
            placeholder="مثال: mechanics أو electricity" required />
        )}
        <Field label="الاسم بالعربي" value={data.nameAr}
          onChange={v => setData(p => ({ ...p, nameAr: v }))}
          placeholder="مثال: ميكانيكا" required />
        <div className="flex gap-3 pt-2">
          <Button onClick={handleSave} disabled={saving || !data.nameAr.trim() || (!editing && !data.key.trim())}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? 'حفظ التغييرات' : 'إضافة التخصص'}
          </Button>
          <Button variant="ghost" onClick={onClose}
            className="flex-1 text-slate-400 hover:text-white rounded-xl h-11 border border-border">
            إلغاء
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function TicketTypesAdminPage() {
  const [types, setTypes] = useState<TicketTypeItem[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // specialty modal state
  const [specModalOpen, setSpecModalOpen] = useState(false);
  const [editingSpecialty, setEditingSpecialty] = useState<Specialty | null>(null);
  const [confirmDelSpec, setConfirmDelSpec] = useState<Specialty | null>(null);
  const [deletingSpec, setDeletingSpec] = useState(false);

  const load = useCallback(async () => {
    try {
      const [typesData, specsData] = await Promise.all([
        apiFetch(BASE),
        apiFetch(`${BASE}/specialties`),
      ]);
      setTypes(typesData);
      setSpecialties(specsData);
    } catch (e: any) { toast.error('فشل تحميل البيانات: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDeleteSpecialty = async () => {
    if (!confirmDelSpec) return;
    setDeletingSpec(true);
    try {
      await apiFetch(`${BASE}/specialties/${confirmDelSpec.id}`, { method: 'DELETE' });
      toast.success('تم حذف التخصص');
      setConfirmDelSpec(null);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setDeletingSpec(false); }
  };

  const filtered = types.filter(t =>
    t.nameAr.includes(search) || t.key.toLowerCase().includes(search.toLowerCase()) || t.specialty?.nameAr.includes(search)
  );

  // Group types by specialty
  const grouped = specialties.map(spec => ({
    specialty: spec,
    types: filtered.filter(t => t.specialtyId === spec.id),
  }));
  const unassigned = filtered.filter(t => !t.specialtyId);

  const stats = {
    total: types.length,
    active: types.filter(t => t.isActive).length,
    subtypes: types.reduce((s, t) => s + t.subTypes.length, 0),
    keywords: types.reduce((s, t) => s + t.keywords.length, 0),
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto" dir="rtl">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <button onClick={() => { setEditingSpecialty(null); setSpecModalOpen(true); }}
            className="flex items-center gap-2 px-4 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-border text-slate-400 hover:text-white text-sm font-bold transition-all shrink-0">
            <FolderPlus className="w-4 h-4" />
            تخصص جديد
          </button>
          <div className="text-right">
            <h1 className="text-2xl font-bold text-white">أنواع التذاكر</h1>
            <p className="text-slate-400 text-sm mt-1">مجمّعة حسب التخصص — ميكانيكا · كهرباء · عام</p>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="إجمالي الأنواع" value={stats.total} icon={Tags} color="text-blue-400" bg="bg-blue-500/10" />
          <StatCard label="الأنواع النشطة" value={stats.active} icon={CheckCircle2} color="text-emerald-400" bg="bg-emerald-500/10" />
          <StatCard label="الأنواع الفرعية" value={stats.subtypes} icon={Layers} color="text-amber-400" bg="bg-amber-500/10" />
          <StatCard label="الكلمات المفتاحية" value={stats.keywords} icon={Hash} color="text-purple-400" bg="bg-purple-500/10" />
        </div>

        {/* ── Search ── */}
        <div className="relative">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث في الأنواع..."
            className="w-full bg-white/5 border border-border text-slate-200 rounded-2xl pr-11 pl-4 h-11 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-600 transition-all" />
        </div>

        {/* ── Grouped Sections ── */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Specialty sections */}
            {grouped.map(({ specialty, types: sTypes }) => (
              (sTypes.length > 0 || !search) && (
                <SpecialtySection
                  key={specialty.id}
                  specialty={specialty}
                  types={sTypes}
                  allSpecialties={specialties}
                  onRefresh={load}
                  onEditSpecialty={s => { setEditingSpecialty(s); setSpecModalOpen(true); }}
                  onDeleteSpecialty={s => setConfirmDelSpec(s)}
                />
              )
            ))}

            {/* Unassigned */}
            {(unassigned.length > 0 || (!search && specialties.length === 0)) && (
              <SpecialtySection
                specialty={null}
                types={unassigned}
                allSpecialties={specialties}
                onRefresh={load}
                onEditSpecialty={() => {}}
                onDeleteSpecialty={() => {}}
              />
            )}

            {filtered.length === 0 && search && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-white/5 border border-border flex items-center justify-center mb-3">
                  <Search className="w-6 h-6 text-slate-600" />
                </div>
                <p className="text-white font-semibold">لا توجد نتائج</p>
                <p className="text-slate-500 text-sm mt-1">جرب كلمة بحث أخرى</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Specialty Modal ── */}
      <SpecialtyModal
        open={specModalOpen}
        onClose={() => setSpecModalOpen(false)}
        editing={editingSpecialty}
        onRefresh={load}
      />

      {/* ── Confirm delete specialty ── */}
      <ConfirmDelete
        open={!!confirmDelSpec}
        onClose={() => setConfirmDelSpec(null)}
        onConfirm={handleDeleteSpecialty}
        name={confirmDelSpec?.nameAr ?? ''}
        loading={deletingSpec}
      />
    </Layout>
  );
}
