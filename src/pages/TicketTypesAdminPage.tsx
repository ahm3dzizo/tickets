import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Trash2, Pencil, ChevronDown, ChevronUp,
  Tags, Layers, Hash, CheckCircle2, Loader2, X, KeyRound,
  ToggleLeft, ToggleRight, AlertTriangle,
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
}

interface Specialty {
  id: string;
  key: string;
  nameAr: string;
}

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

  // Edit form state
  const [editData, setEditData] = useState({ nameAr: type.nameAr, description: type.description || '', specialtyId: type.specialtyId || '', isActive: type.isActive });

  // New subtype state
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

  const specialtyColor: Record<string, string> = {
    plumbing: 'text-blue-400 bg-blue-500/10',
    electrical: 'text-amber-400 bg-amber-500/10',
    carpentry: 'text-orange-400 bg-orange-500/10',
    painting: 'text-purple-400 bg-purple-500/10',
    civil: 'text-slate-400 bg-slate-500/10',
    general: 'text-slate-400 bg-slate-500/10',
  };
  const spColor = specialtyColor[type.specialty?.key || 'general'] || 'text-slate-400 bg-slate-500/10';

  return (
    <>
      <Card className={cn(
        'border transition-all duration-200 overflow-hidden',
        type.isActive ? 'bg-white/5 border-border hover:border-white/20' : 'bg-white/2 border-border/40 opacity-60'
      )}>
        {/* ── Card Header ── */}
        <CardContent className="p-0">
          <div className="flex items-center justify-between p-4">
            {/* Left actions */}
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

            {/* Right: type info */}
            <div className="flex items-center gap-3 text-right">
              <div>
                <div className="flex items-center justify-end gap-2">
                  <p className="text-white font-semibold">{type.nameAr}</p>
                  <button onClick={toggleActive}>
                    {type.isActive
                      ? <ToggleRight className="w-4 h-4 text-emerald-400" />
                      : <ToggleLeft className="w-4 h-4 text-slate-500" />}
                  </button>
                </div>
                <div className="flex items-center justify-end gap-2 mt-1">
                  <code className="text-[10px] text-slate-500 font-mono bg-white/5 px-1.5 py-0.5 rounded">{type.key}</code>
                  {type.specialty && (
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', spColor)}>
                      {type.specialty.nameAr}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-border">
                  <Tags className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Stats row ── */}
          <div className="flex items-center justify-end gap-4 px-4 pb-3">
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
              {/* Tabs */}
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

                    {/* Add subtype inline */}
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
          <Field label="الوصف" value={editData.description} onChange={v => setEditData(p => ({ ...p, description: v }))} placeholder="وصف اختياري..." textarea />
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

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function TicketTypesAdminPage() {
  const [types, setTypes] = useState<TicketTypeItem[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newData, setNewData] = useState({ key: '', nameAr: '', description: '', specialtyId: '' });

  const load = useCallback(async () => {
    try {
      const [typesData, specsData] = await Promise.all([
        apiFetch(BASE),
        apiFetch('/api/admin/ticket-types/specialties'),
      ]);
      setTypes(typesData);
      setSpecialties(specsData);
    } catch (e: any) { toast.error('فشل تحميل البيانات: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newData.key.trim() || !newData.nameAr.trim()) return;
    setSaving(true);
    try {
      await apiFetch(BASE, { method: 'POST', body: JSON.stringify(newData) });
      toast.success('تمت إضافة النوع بنجاح');
      setNewData({ key: '', nameAr: '', description: '', specialtyId: '' });
      setAddOpen(false);
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const filtered = types.filter(t =>
    t.nameAr.includes(search) || t.key.toLowerCase().includes(search.toLowerCase()) || t.specialty?.nameAr.includes(search)
  );

  const stats = {
    total: types.length,
    active: types.filter(t => t.isActive).length,
    subtypes: types.reduce((s, t) => s + t.subTypes.length, 0),
    keywords: types.reduce((s, t) => s + t.keywords.length, 0),
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto" dir="rtl">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <Button onClick={() => setAddOpen(true)}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl h-11 px-5 font-bold shrink-0">
            <Plus className="w-4 h-4" />
            نوع جديد
          </Button>
          <div className="text-right">
            <h1 className="text-2xl font-bold text-white">أنواع التذاكر</h1>
            <p className="text-slate-400 text-sm mt-1">إدارة أنواع التذاكر والأنواع الفرعية والكلمات المفتاحية</p>
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

        {/* ── Types List ── */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-border flex items-center justify-center mb-4">
              <Tags className="w-8 h-8 text-slate-600" />
            </div>
            <p className="text-white font-semibold">{search ? 'لا توجد نتائج' : 'لا توجد أنواع بعد'}</p>
            <p className="text-slate-500 text-sm mt-1">{search ? 'جرب كلمة بحث أخرى' : 'أضف أول نوع تذكرة للبدء'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(type => (
              <TypeCard key={type.id} type={type} specialties={specialties} onRefresh={load} />
            ))}
          </div>
        )}
      </div>

      {/* ── Add Type Modal ── */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="إضافة نوع جديد">
        <div className="space-y-4">
          <Field label="المفتاح (key) بالإنجليزية" value={newData.key} onChange={v => setNewData(p => ({ ...p, key: v.toLowerCase().replace(/\s+/g, '_') }))}
            placeholder="مثال: plumbing أو water_leaks" required />
          <Field label="الاسم بالعربي" value={newData.nameAr} onChange={v => setNewData(p => ({ ...p, nameAr: v }))}
            placeholder="مثال: السباكة" required />
          <Field label="الوصف (اختياري)" value={newData.description} onChange={v => setNewData(p => ({ ...p, description: v }))}
            placeholder="وصف مختصر للنوع..." textarea />
          <div className="space-y-1.5">
            <label className="block text-right text-[10px] font-bold uppercase tracking-widest text-slate-500">التخصص</label>
            <select value={newData.specialtyId} onChange={e => setNewData(p => ({ ...p, specialtyId: e.target.value }))}
              className="w-full bg-white/5 border border-border text-slate-200 rounded-xl px-4 h-11 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all appearance-none">
              <option value="">— بدون تخصص —</option>
              {specialties.map(s => <option key={s.id} value={s.id}>{s.nameAr}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={handleAdd} disabled={saving || !newData.key.trim() || !newData.nameAr.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إضافة النوع'}
            </Button>
            <Button variant="ghost" onClick={() => setAddOpen(false)}
              className="flex-1 text-slate-400 hover:text-white rounded-xl h-11 border border-border">
              إلغاء
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
