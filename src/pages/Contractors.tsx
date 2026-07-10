// src/pages/Contractors.tsx
import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  HardHat, Plus, Trash2, Edit, Loader2, Phone, Search,
  ChevronDown, X, Building2, MapPin, Check
} from 'lucide-react';
import { contractorsApi } from '@/lib/contractorsApi';
import { projectsApi } from '@/lib/api';
import { Contractor, ContractorVilla, Project } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useTicketTypes } from '@/contexts/TicketTypesContext';

// ─── helpers ─────────────────────────────────────────────────────────────────
function villaLabel(v: any, projectName?: string): string {
  const p = projectName ? `[${projectName}] ` : '';
  if (v.unitId) return `${p}وحدة (ID: ${v.unitId})`;
  if (v.blockId) return `${p}بلوك (ID: ${v.blockId})`;
  return `${p}(وحدة غير محددة)`;
}

// ─── Assignment Form Row ──────────────────────────────────────────────────────
interface AssignmentRow {
  id: string;
  projectId: string;
  specialtyKey: string;
  level: 'block' | 'unit';
  blockId: string;
  unitId: string;
}

function newRow(): AssignmentRow {
  return { id: Math.random().toString(36).slice(2), projectId: '', specialtyKey: '', level: 'block', blockId: '', unitId: '' };
}

// ─── Contractor Form Dialog ───────────────────────────────────────────────────
interface FormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial?: Contractor | null;
  projects: Project[];
  onSuccess: () => void;
}

const CONTRACTOR_SPECIALTIES: Record<string, string> = {
  plumbing: 'سباكة', electricity: 'كهرباء', doors: 'أبواب',
  aluminum: 'ألومنيوم', garage_door: 'باب كراج'
};

function ContractorFormDialog({ open, onOpenChange, initial, projects, onSuccess }: FormDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [customSpecialty, setCustomSpecialty] = useState('');
  const [assignments, setAssignments] = useState<AssignmentRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const [projectBlocks, setProjectBlocks] = useState<Record<string, any[]>>({});
  const [projectUnits, setProjectUnits] = useState<Record<string, any[]>>({});

  useEffect(() => {
    if (open) {
      setName(initial?.name || '');
      setPhone(initial?.phone || '');
      setSelectedSpecialties(initial?.specialties?.map(s => s.specialtyKey) || []);
      if (initial?.assignments?.length) {
        setAssignments(initial.assignments.map(a => ({
          id: a.id,
          projectId: a.projectId,
          specialtyKey: a.specialtyKey || '',
          level: a.unitId ? 'unit' : 'block',
          blockId: a.blockId || '',
          unitId: a.unitId || '',
        })));
      } else {
        setAssignments([newRow()]);
      }
    }
  }, [open, initial]);

  useEffect(() => {
    // Load blocks and units for selected projects
    const pIds = [...new Set(assignments.map(a => a.projectId).filter(Boolean))];
    for (const pId of pIds) {
      if (!projectBlocks[pId]) {
        projectsApi.getBlocks(pId).then(data => setProjectBlocks(p => ({ ...p, [pId]: data } as Record<string, any[]>))).catch(() => {});
        projectsApi.getUnits(pId).then(data => setProjectUnits(p => ({ ...p, [pId]: data } as Record<string, any[]>))).catch(() => {});
      }
    }
  }, [assignments, projectBlocks, projectUnits]);

  const toggleSpecialty = (key: string) =>
    setSelectedSpecialties(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]);

  const handleAddCustomSpecialty = () => {
    const val = customSpecialty.trim();
    if (val && !selectedSpecialties.includes(val) && !Object.values(CONTRACTOR_SPECIALTIES).includes(val)) {
      setSelectedSpecialties(prev => [...prev, val]);
    }
    setCustomSpecialty('');
  };

  const handleCustomSpecialtyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustomSpecialty();
    }
  };

  const updateRow = (id: string, field: keyof AssignmentRow, value: string) =>
    setAssignments(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const handleSave = async () => {
    if (!name.trim()) { toast.error('الاسم مطلوب'); return; }
    const validAssignments = assignments
      .filter(a => a.projectId && a.specialtyKey && (a.level === 'block' ? a.blockId : a.unitId))
      .map(a => ({
        projectId: a.projectId,
        specialtyKey: a.specialtyKey,
        blockId: a.level === 'block' ? a.blockId : null,
        unitId: a.level === 'unit' ? a.unitId : null,
      }));

    setSaving(true);
    try {
      if (initial) {
        await contractorsApi.update(initial.id, {
          name: name.trim(), phone: phone.trim() || null,
          specialties: selectedSpecialties,
          assignments: validAssignments as any,
        });
        toast.success('تم تحديث المقاول');
      } else {
        await contractorsApi.create({
          name: name.trim(), phone: phone.trim() || undefined,
          specialties: selectedSpecialties,
          assignments: validAssignments as any,
        });
        toast.success('تم إضافة المقاول');
      }
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground sm:max-w-[520px] max-h-[90vh] flex flex-col rounded-3xl p-0 overflow-hidden" dir="rtl">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/50 shrink-0">
          <DialogTitle className="text-lg font-bold flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <HardHat className="w-5 h-5 text-blue-400" />
            </div>
            {initial ? 'تعديل مقاول' : 'إضافة مقاول جديد'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto no-scrollbar p-5 space-y-5">
          {/* Name + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">الاسم *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="اسم المقاول" className="h-10 rounded-xl bg-background" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">الهاتف</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="05xxxxxxxx" className="h-10 rounded-xl bg-background" dir="ltr" />
            </div>
          </div>

          {/* Specialties */}
          <div className="space-y-3">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">التخصصات</Label>
            
            {/* Presets */}
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CONTRACTOR_SPECIALTIES).map(([k, v]) => {
                const sel = selectedSpecialties.includes(v);
                return (
                  <button key={k} onClick={() => toggleSpecialty(v)}
                    type="button"
                    className={cn(
                      'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5',
                      sel ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-muted/20 border-border/50 text-muted-foreground hover:bg-muted/50'
                    )}>
                    {sel && <Check className="w-3 h-3" />}
                    {v}
                  </button>
                );
              })}
              {/* Custom ones that aren't in presets */}
              {selectedSpecialties.filter(s => !Object.values(CONTRACTOR_SPECIALTIES).includes(s)).map(s => (
                <button key={s} onClick={() => toggleSpecialty(s)}
                  type="button"
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 bg-blue-500/10 border-blue-500/30 text-blue-400">
                  <Check className="w-3 h-3" />
                  {s}
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <div className="flex items-center gap-2">
              <Input 
                value={customSpecialty} 
                onChange={e => setCustomSpecialty(e.target.value)} 
                onKeyDown={handleCustomSpecialtyKeyDown}
                placeholder="إضافة تخصص آخر..." 
                className="h-9 rounded-xl bg-background text-sm flex-1" 
              />
              <Button type="button" onClick={handleAddCustomSpecialty} variant="secondary" className="h-9 rounded-xl px-3 bg-muted/50 text-muted-foreground hover:text-foreground">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Assignments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">الوحدات / المشاريع</Label>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-400 hover:bg-blue-500/10"
                onClick={() => setAssignments(prev => [...prev, newRow()])}>
                <Plus className="w-3 h-3" /> إضافة وحدة
              </Button>
            </div>
            <div className="space-y-2">
              {assignments.map(row => (
                <div key={row.id} className="flex flex-col gap-2 p-3 border border-border/50 rounded-2xl bg-muted/20">
                  <div className="flex items-center gap-2">
                    {/* Project picker */}
                    <DropdownMenu>
                      <DropdownMenuTrigger render={
                        <Button variant="outline" size="sm" className="flex-1 h-8 justify-between rounded-xl text-xs border-border/50 bg-background">
                          {row.projectId ? (projects.find(p => p.id === row.projectId)?.name ?? 'المشروع') : 'اختر مشروع'}
                          <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                      } />
                      <DropdownMenuContent className="bg-card border-border text-slate-200">
                        {projects.map(p => (
                          <DropdownMenuItem key={p.id} className="hover:bg-white/5 text-start justify-start"
                            onClick={() => updateRow(row.id, 'projectId', p.id)}>
                            {p.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Specialty picker */}
                    <DropdownMenu>
                      <DropdownMenuTrigger render={
                        <Button variant="outline" size="sm" className="flex-1 h-8 justify-between rounded-xl text-xs border-border/50 bg-background">
                          {row.specialtyKey ? (CONTRACTOR_SPECIALTIES[row.specialtyKey] || row.specialtyKey) : 'التخصص'}
                          <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                      } />
                      <DropdownMenuContent className="bg-card border-border text-slate-200">
                        {selectedSpecialties.map(s => (
                          <DropdownMenuItem key={s} className="hover:bg-white/5 text-start justify-start"
                            onClick={() => updateRow(row.id, 'specialtyKey', s)}>
                            {CONTRACTOR_SPECIALTIES[s] || s}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <button onClick={() => setAssignments(prev => prev.filter(r => r.id !== row.id))}
                      className="text-slate-500 hover:text-red-400 transition-colors p-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Level & Item picker */}
                  <div className="flex gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger render={
                        <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs border-border/50 bg-background gap-1 shrink-0">
                          {row.level === 'block' ? 'بلوك' : 'وحدة'}
                          <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                      } />
                      <DropdownMenuContent className="bg-card border-border text-slate-200">
                        <DropdownMenuItem className="hover:bg-white/5 text-start justify-start" onClick={() => updateRow(row.id, 'level', 'block')}>بلوك</DropdownMenuItem>
                        <DropdownMenuItem className="hover:bg-white/5 text-start justify-start" onClick={() => updateRow(row.id, 'level', 'unit')}>وحدة</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                      <DropdownMenuTrigger render={
                        <Button variant="outline" size="sm" className="flex-1 h-8 justify-between rounded-xl text-xs border-border/50 bg-background" disabled={!row.projectId}>
                          {row.level === 'block' 
                            ? (projectBlocks[row.projectId]?.find(b => b.id === row.blockId)?.blockNumber ?? 'اختر بلوك')
                            : (projectUnits[row.projectId]?.find(u => u.id === row.unitId)?.unitNumber ?? 'اختر وحدة')}
                          <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                      } />
                      <DropdownMenuContent className="bg-card border-border text-slate-200 max-h-48 overflow-y-auto">
                        {row.level === 'block' && projectBlocks[row.projectId]?.map(b => (
                          <DropdownMenuItem key={b.id} className="hover:bg-white/5 text-start justify-start"
                            onClick={() => updateRow(row.id, 'blockId', b.id)}>
                            {b.blockNumber}
                          </DropdownMenuItem>
                        ))}
                        {row.level === 'unit' && projectUnits[row.projectId]?.map(u => (
                          <DropdownMenuItem key={u.id} className="hover:bg-white/5 text-start justify-start"
                            onClick={() => updateRow(row.id, 'unitId', u.id)}>
                            {u.unitNumber}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="px-5 pb-5 pt-4 border-t border-border/50 shrink-0">
          <Button onClick={handleSave} disabled={saving || !name.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 font-bold gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {initial ? 'حفظ التعديلات' : 'إضافة المقاول'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Contractors() {
  const { user } = useAuth();
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectMap, setProjectMap] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Contractor | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canEdit = user?.role === 'admin' || user?.role === 'engineer';

  const loadData = async () => {
    setLoading(true);
    try {
      const [allContractors, allProjects] = await Promise.all([
        contractorsApi.getAll(),
        projectsApi.getAll(),
      ]);
      setContractors(allContractors);
      setProjects(allProjects);
      const pm: Record<string, Project> = {};
      allProjects.forEach((p: any) => { pm[p.id] = p; });
      setProjectMap(pm);
    } catch { toast.error('فشل تحميل البيانات'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await contractorsApi.delete(id);
      toast.success('تم حذف المقاول');
      loadData();
    } catch { toast.error('فشل الحذف'); }
    finally { setDeletingId(null); }
  };

  const filtered = contractors.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  // Group by project for display
  const projectsWithContractors = projects
    .map(p => ({
      project: p,
      contractors: filtered.filter(c => c.assignments.some(a => a.projectId === p.id)),
    }))
    .filter(g => g.contractors.length > 0);

  // Contractors with no assignments
  const unassigned = filtered.filter(c => c.assignments.length === 0);

  return (
    <Layout>
      <div className="space-y-6 page-in" dir="rtl">
        {/* ── Header ─────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                <HardHat className="w-5 h-5 text-blue-400" />
              </div>
              المقاولون
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">إدارة مقاولي الصيانة الخارجيين ووحداتهم</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="بحث..." className="pr-9 h-10 w-44 rounded-xl bg-card border-border text-sm" />
            </div>

            {canEdit && (
              <Button
                onClick={() => { setEditTarget(null); setFormOpen(true); }}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-xl h-10 px-4 font-bold shadow-sm"
              >
                <Plus className="w-4 h-4" /> إضافة مقاول
              </Button>
            )}
          </div>
        </div>

        {/* ── Stats ───────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'إجمالي المقاولين', value: contractors.length, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'المشاريع المغطّاة', value: projectsWithContractors.length, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { label: 'الوحدات المسجّلة', value: contractors.reduce((s, c) => s + c.assignments.length, 0), color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', s.bg)}>
                <HardHat className={cn('w-5 h-5', s.color)} />
              </div>
              <div>
                <p className={cn('text-xl font-black', s.color)}>{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Loading ─────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
          </div>
        )}

        {/* ── Empty ───────────────────────────────── */}
        {!loading && contractors.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center">
              <HardHat className="w-8 h-8 text-blue-400" />
            </div>
            <div>
              <p className="text-foreground font-bold text-lg">لا يوجد مقاولون</p>
              <p className="text-muted-foreground text-sm mt-1">ابدأ بإضافة مقاول جديد من الزر أعلاه</p>
            </div>
          </div>
        )}

        {/* ── Groups by Project ───────────────────── */}
        {!loading && projectsWithContractors.map(({ project, contractors: pContractors }) => (
          <div key={project.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-bold text-foreground">{project.name}</h2>
              <span className="text-xs text-muted-foreground">({pContractors.length} مقاول)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pContractors.map(c => (
                <ContractorCard
                  key={c.id}
                  contractor={c}
                  projectMap={projectMap}
                  canEdit={canEdit}
                  deleting={deletingId === c.id}
                  onEdit={() => { setEditTarget(c); setFormOpen(true); }}
                  onDelete={() => handleDelete(c.id)}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Unassigned */}
        {!loading && unassigned.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-foreground">بدون وحدات محددة</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {unassigned.map(c => (
                <ContractorCard
                  key={c.id}
                  contractor={c}
                  projectMap={projectMap}
                  canEdit={canEdit}
                  deleting={deletingId === c.id}
                  onEdit={() => { setEditTarget(c); setFormOpen(true); }}
                  onDelete={() => handleDelete(c.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Form Dialog ─────────────────────────── */}
        <ContractorFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          initial={editTarget}
          projects={projects}
          onSuccess={loadData}
        />
      </div>
    </Layout>
  );
}

// ─── Contractor Card ──────────────────────────────────────────────────────────
function ContractorCard({
  contractor, projectMap, canEdit, deleting, onEdit, onDelete,
}: {
  contractor: Contractor;
  projectMap: Record<string, Project>;
  canEdit: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3 hover:border-blue-500/30 transition-colors">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 text-sm font-black text-blue-300">
            {contractor.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-foreground text-sm truncate">{contractor.name}</p>
            {contractor.phone && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Phone className="w-3 h-3" /> {contractor.phone}
              </p>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onEdit}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-white hover:bg-muted transition-colors">
              <Edit className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => confirmDelete ? onDelete() : setConfirmDelete(true)}
              onBlur={() => setTimeout(() => setConfirmDelete(false), 200)}
              disabled={deleting}
              className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
                confirmDelete
                  ? 'bg-red-500/20 text-red-400 animate-pulse'
                  : 'text-muted-foreground hover:text-red-400 hover:bg-red-500/10'
              )}>
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>

      {/* Specialties */}
      {contractor.specialties.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {contractor.specialties.map(s => (
            <span key={s.id} className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/15">
              {s.specialtyKey}
            </span>
          ))}
        </div>
      )}

      {/* Assignments */}
      {contractor.assignments.length > 0 && (
        <div className="space-y-1">
          {contractor.assignments.map(a => (
            <div key={a.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="w-3 h-3 shrink-0 text-blue-400" />
              <span className="truncate">{villaLabel(a, projectMap[a.projectId]?.abbreviation || projectMap[a.projectId]?.name)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
