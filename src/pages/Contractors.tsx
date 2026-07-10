// src/pages/Contractors.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  HardHat, Plus, Trash2, Edit, Loader2, Phone, Search,
  ChevronDown, X, Building2, MapPin, Check, Wrench, Hash, Users
} from 'lucide-react';
import { contractorsApi } from '@/lib/contractorsApi';
import { projectsApi } from '@/lib/api';
import { Contractor, ContractorVilla, Project } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

// ─── helpers ─────────────────────────────────────────────────────────────────
function villaLabel(v: any, projectName?: string): string {
  const p = projectName ? `[${projectName}] ` : '';
  if (v.unit) return `${p}وحدة ${v.unit.unitNumber}`;
  if (v.block) return `${p}بلوك ${v.block.blockNumber}`;
  return `${p}(نطاق غير محدد)`;
}

// ─── Assignment Form Row ──────────────────────────────────────────────────────
interface AssignmentRow {
  id: string;
  projectId: string;
  specialtyKey: string;
  level: 'block' | 'unit' | 'block_range' | 'unit_range';
  blockId: string;
  unitId: string;
  toBlockId?: string;
  toUnitId?: string;
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

const SPECIALTY_COLORS: Record<string, string> = {
  plumbing: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  electricity: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  doors: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  aluminum: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  garage_door: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
};

function getSpecialtyColor(key: string) {
  return SPECIALTY_COLORS[key] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
}

function getAvatarColor(name: string) {
  const colors = [
    'from-blue-500 to-blue-700',
    'from-emerald-500 to-emerald-700',
    'from-purple-500 to-purple-700',
    'from-orange-500 to-orange-700',
    'from-rose-500 to-rose-700',
    'from-cyan-500 to-cyan-700',
    'from-amber-500 to-amber-700',
    'from-indigo-500 to-indigo-700',
  ];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}

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
    const pIds = [...new Set(assignments.map(a => a.projectId).filter(Boolean))];
    for (const pId of pIds) {
      if (!projectBlocks[pId]) {
        projectsApi.getBlocks(pId).then(data => setProjectBlocks(p => ({ ...p, [pId]: data.sort((a: any, b: any) => String(a.blockNumber).localeCompare(String(b.blockNumber), undefined, { numeric: true })) }))).catch(() => {});
        projectsApi.getUnits(pId).then(data => setProjectUnits(p => ({ ...p, [pId]: data.sort((a: any, b: any) => String(a.unitNumber).localeCompare(String(b.unitNumber), undefined, { numeric: true })) }))).catch(() => {});
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
    if (e.key === 'Enter') { e.preventDefault(); handleAddCustomSpecialty(); }
  };

  const updateRow = (id: string, field: keyof AssignmentRow, value: string) =>
    setAssignments(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  const handleSave = async () => {
    if (!name.trim()) { toast.error('الاسم مطلوب'); return; }
    const validAssignments: any[] = [];
    for (const a of assignments) {
      if (!a.projectId || !a.specialtyKey) continue;
      if (a.level === 'block' && a.blockId) {
        validAssignments.push({ projectId: a.projectId, specialtyKey: a.specialtyKey, blockId: a.blockId, unitId: null });
      } else if (a.level === 'unit' && a.unitId) {
        validAssignments.push({ projectId: a.projectId, specialtyKey: a.specialtyKey, blockId: null, unitId: a.unitId });
      } else if (a.level === 'block_range' && a.blockId && a.toBlockId) {
        const blocks = projectBlocks[a.projectId] || [];
        const i1 = blocks.findIndex(b => b.id === a.blockId);
        const i2 = blocks.findIndex(b => b.id === a.toBlockId);
        if (i1 !== -1 && i2 !== -1) {
          for (let i = Math.min(i1, i2); i <= Math.max(i1, i2); i++)
            validAssignments.push({ projectId: a.projectId, specialtyKey: a.specialtyKey, blockId: blocks[i].id, unitId: null });
        }
      } else if (a.level === 'unit_range' && a.unitId && a.toUnitId) {
        const units = projectUnits[a.projectId] || [];
        const i1 = units.findIndex(u => u.id === a.unitId);
        const i2 = units.findIndex(u => u.id === a.toUnitId);
        if (i1 !== -1 && i2 !== -1) {
          for (let i = Math.min(i1, i2); i <= Math.max(i1, i2); i++)
            validAssignments.push({ projectId: a.projectId, specialtyKey: a.specialtyKey, blockId: null, unitId: units[i].id });
        }
      }
    }
    const uniqueMap = new Map();
    for (const va of validAssignments) {
      uniqueMap.set(`${va.projectId}-${va.specialtyKey}-${va.blockId}-${va.unitId}`, va);
    }
    const finalAssignments = Array.from(uniqueMap.values());
    setSaving(true);
    try {
      if (initial) {
        await contractorsApi.update(initial.id, { name: name.trim(), phone: phone.trim() || null, specialties: selectedSpecialties, assignments: finalAssignments as any });
        toast.success('تم تحديث المقاول');
      } else {
        await contractorsApi.create({ name: name.trim(), phone: phone.trim() || undefined, specialties: selectedSpecialties, assignments: finalAssignments as any });
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

          <div className="space-y-3">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">التخصصات</Label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CONTRACTOR_SPECIALTIES).map(([k, v]) => {
                const sel = selectedSpecialties.includes(v);
                return (
                  <button key={k} onClick={() => toggleSpecialty(v)} type="button"
                    className={cn('px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5',
                      sel ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-muted/20 border-border/50 text-muted-foreground hover:bg-muted/50')}>
                    {sel && <Check className="w-3 h-3" />}{v}
                  </button>
                );
              })}
              {selectedSpecialties.filter(s => !Object.values(CONTRACTOR_SPECIALTIES).includes(s)).map(s => (
                <button key={s} onClick={() => toggleSpecialty(s)} type="button"
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 bg-blue-500/10 border-blue-500/30 text-blue-400">
                  <Check className="w-3 h-3" />{s}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input value={customSpecialty} onChange={e => setCustomSpecialty(e.target.value)} onKeyDown={handleCustomSpecialtyKeyDown}
                placeholder="إضافة تخصص آخر..." className="h-9 rounded-xl bg-background text-sm flex-1" />
              <Button type="button" onClick={handleAddCustomSpecialty} variant="secondary" className="h-9 rounded-xl px-3 bg-muted/50 text-muted-foreground hover:text-foreground">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">الوحدات / المشاريع</Label>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-blue-400 hover:bg-blue-500/10"
                onClick={() => setAssignments(prev => [...prev, newRow()])}>
                <Plus className="w-3 h-3" /> إضافة وحدة
              </Button>
            </div>
            <div className="space-y-2">
              {[...assignments].sort((rowA, rowB) => {
                if (rowA.projectId !== rowB.projectId) return (rowA.projectId || '').localeCompare(rowB.projectId || '');
                const bA = parseInt(rowA.blockId ? projectBlocks[rowA.projectId]?.find((b: any) => b.id === rowA.blockId)?.blockNumber : '0') || 0;
                const bB = parseInt(rowB.blockId ? projectBlocks[rowB.projectId]?.find((b: any) => b.id === rowB.blockId)?.blockNumber : '0') || 0;
                if (bA !== bB) return bA - bB;
                const uA = parseInt(rowA.unitId ? projectUnits[rowA.projectId]?.find((u: any) => u.id === rowA.unitId)?.unitNumber : '0') || 0;
                const uB = parseInt(rowB.unitId ? projectUnits[rowB.projectId]?.find((u: any) => u.id === rowB.unitId)?.unitNumber : '0') || 0;
                return uA - uB;
              }).map(row => (
                <div key={row.id} className="flex flex-col gap-2 p-3 border border-border/50 rounded-2xl bg-muted/20">
                  <div className="flex items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger render={
                        <Button variant="outline" size="sm" className="flex-1 h-8 justify-between rounded-xl text-xs border-border/50 bg-background">
                          {row.projectId ? (projects.find(p => p.id === row.projectId)?.name ?? 'المشروع') : 'اختر مشروع'}
                          <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                      } />
                      <DropdownMenuContent className="bg-card border-border text-slate-200">
                        {projects.map(p => (
                          <DropdownMenuItem key={p.id} className="hover:bg-white/5 text-start justify-start" onClick={() => updateRow(row.id, 'projectId', p.id)}>
                            {p.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <DropdownMenu>
                      <DropdownMenuTrigger render={
                        <Button variant="outline" size="sm" className="flex-1 h-8 justify-between rounded-xl text-xs border-border/50 bg-background">
                          {row.specialtyKey ? (CONTRACTOR_SPECIALTIES[row.specialtyKey] || row.specialtyKey) : 'التخصص'}
                          <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                      } />
                      <DropdownMenuContent className="bg-card border-border text-slate-200">
                        {selectedSpecialties.map(s => (
                          <DropdownMenuItem key={s} className="hover:bg-white/5 text-start justify-start" onClick={() => updateRow(row.id, 'specialtyKey', s)}>
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

                  <div className="flex gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger render={
                        <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs border-border/50 bg-background gap-1 shrink-0">
                          {row.level === 'block' ? 'بلوك' : row.level === 'unit' ? 'وحدة' : row.level === 'block_range' ? 'نطاق بلوكات' : 'نطاق وحدات'}
                          <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                      } />
                      <DropdownMenuContent className="bg-card border-border text-slate-200">
                        <DropdownMenuItem className="hover:bg-white/5 text-start justify-start" onClick={() => updateRow(row.id, 'level', 'block')}>بلوك</DropdownMenuItem>
                        <DropdownMenuItem className="hover:bg-white/5 text-start justify-start" onClick={() => updateRow(row.id, 'level', 'unit')}>وحدة</DropdownMenuItem>
                        <DropdownMenuItem className="hover:bg-white/5 text-start justify-start" onClick={() => updateRow(row.id, 'level', 'block_range')}>نطاق بلوكات</DropdownMenuItem>
                        <DropdownMenuItem className="hover:bg-white/5 text-start justify-start" onClick={() => updateRow(row.id, 'level', 'unit_range')}>نطاق وحدات</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="flex items-center gap-1 flex-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={
                          <Button variant="outline" size="sm" className="flex-1 h-8 justify-between rounded-xl text-xs border-border/50 bg-background" disabled={!row.projectId}>
                            {row.level.startsWith('block')
                              ? (projectBlocks[row.projectId]?.find(b => b.id === row.blockId)?.blockNumber ?? 'من بلوك')
                              : (projectUnits[row.projectId]?.find(u => u.id === row.unitId)?.unitNumber ?? 'من وحدة')}
                            <ChevronDown className="w-3 h-3 opacity-50" />
                          </Button>
                        } />
                        <DropdownMenuContent className="bg-card border-border text-slate-200 max-h-48 overflow-y-auto">
                          {row.level.startsWith('block') && projectBlocks[row.projectId]?.map(b => (
                            <DropdownMenuItem key={b.id} className="hover:bg-white/5 text-start justify-start" onClick={() => updateRow(row.id, 'blockId', b.id)}>{b.blockNumber}</DropdownMenuItem>
                          ))}
                          {row.level.startsWith('unit') && projectUnits[row.projectId]?.map(u => (
                            <DropdownMenuItem key={u.id} className="hover:bg-white/5 text-start justify-start" onClick={() => updateRow(row.id, 'unitId', u.id)}>{u.unitNumber}</DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {row.level.includes('range') && (
                        <>
                          <span className="text-muted-foreground text-xs px-1 shrink-0">إلى</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger render={
                              <Button variant="outline" size="sm" className="flex-1 h-8 justify-between rounded-xl text-xs border-border/50 bg-background" disabled={!row.projectId}>
                                {row.level === 'block_range'
                                  ? (projectBlocks[row.projectId]?.find(b => b.id === row.toBlockId)?.blockNumber ?? 'إلى بلوك')
                                  : (projectUnits[row.projectId]?.find(u => u.id === row.toUnitId)?.unitNumber ?? 'إلى وحدة')}
                                <ChevronDown className="w-3 h-3 opacity-50" />
                              </Button>
                            } />
                            <DropdownMenuContent className="bg-card border-border text-slate-200 max-h-48 overflow-y-auto">
                              {row.level === 'block_range' && projectBlocks[row.projectId]?.map(b => (
                                <DropdownMenuItem key={b.id} className="hover:bg-white/5 text-start justify-start" onClick={() => updateRow(row.id, 'toBlockId', b.id)}>{b.blockNumber}</DropdownMenuItem>
                              ))}
                              {row.level === 'unit_range' && projectUnits[row.projectId]?.map(u => (
                                <DropdownMenuItem key={u.id} className="hover:bg-white/5 text-start justify-start" onClick={() => updateRow(row.id, 'toUnitId', u.id)}>{u.unitNumber}</DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                    </div>
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
  const [projectUnits, setProjectUnits] = useState<Record<string, any[]>>({});
  const [selectedProject, setSelectedProject] = useState<string>('all');

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
      const unitsMap: Record<string, any[]> = {};
      await Promise.all(allProjects.map(async (p: any) => {
        try { unitsMap[p.id] = await projectsApi.getUnits(p.id); } catch(e) {}
      }));
      setProjectUnits(unitsMap);
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

  const filtered = useMemo(() => contractors.filter(c => {
    const s = search.toLowerCase();
    const matchSearch = !s || c.name.toLowerCase().includes(s) ||
      c.phone?.includes(s) ||
      c.specialties?.some((sp: any) => sp.specialtyKey.toLowerCase().includes(s) || (CONTRACTOR_SPECIALTIES[sp.specialtyKey] && CONTRACTOR_SPECIALTIES[sp.specialtyKey].includes(s))) ||
      c.assignments.some((a: any) => {
        if (a.unit?.unitNumber && a.unit.unitNumber.includes(s)) return true;
        if (a.block?.blockNumber && a.block.blockNumber.includes(s)) return true;
        if (a.blockId && !a.unitId && projectUnits[a.projectId]) {
          const unitsInThisBlock = projectUnits[a.projectId].filter((u: any) => u.blockId === a.blockId);
          if (unitsInThisBlock.some((u: any) => u.unitNumber.includes(s))) return true;
        }
        return false;
      });
    const matchProject = selectedProject === 'all' || c.assignments.some(a => a.projectId === selectedProject);
    return matchSearch && matchProject;
  }), [contractors, search, selectedProject, projectUnits]);

  const projectsWithContractors = useMemo(() => projects
    .map(p => ({ project: p, contractors: filtered.filter(c => c.assignments.some(a => a.projectId === p.id)) }))
    .filter(g => g.contractors.length > 0), [projects, filtered]);

  const unassigned = filtered.filter(c => c.assignments.length === 0);

  const totalUnits = useMemo(() => {
    const unitSet = new Set<string>();
    contractors.forEach(c => {
      c.assignments.forEach((a: any) => {
        if (a.unitId) unitSet.add(a.unitId);
        if (a.blockId && !a.unitId && projectUnits[a.projectId]) {
          projectUnits[a.projectId].filter((u: any) => u.blockId === a.blockId).forEach((u: any) => unitSet.add(u.id));
        }
      });
    });
    return unitSet.size;
  }, [contractors, projectUnits]);

  return (
    <Layout>
      <div className="flex flex-col h-full page-in" dir="rtl">

        {/* ── Sticky Top Bar ───────────────────────────────── */}
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/40 px-4 pt-4 pb-3 space-y-3">
          {/* Title + Add Button */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
                <HardHat className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-black text-foreground leading-none">المقاولون</h1>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {contractors.length} مقاول · {totalUnits} وحدة مغطّاة
                </p>
              </div>
            </div>
            {canEdit && (
              <Button
                onClick={() => { setEditTarget(null); setFormOpen(true); }}
                className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 rounded-2xl h-9 px-4 font-bold shadow-sm shrink-0 text-sm"
              >
                <Plus className="w-4 h-4" /> إضافة
              </Button>
            )}
          </div>

          {/* Search + Project Filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالاسم، تخصص، رقم فيلا..." className="pr-9 h-9 rounded-xl bg-card border-border text-sm" />
              {search && (
                <button onClick={() => setSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="outline" size="sm" className="h-9 rounded-xl border-border/50 bg-card gap-1.5 text-xs font-bold shrink-0 px-3">
                  <Building2 className="w-3.5 h-3.5 text-blue-400" />
                  {selectedProject === 'all' ? 'كل المشاريع' : (projectMap[selectedProject]?.name?.slice(0, 8) || 'مشروع')}
                  <ChevronDown className="w-3 h-3 opacity-40" />
                </Button>
              } />
              <DropdownMenuContent className="bg-card border-border text-slate-200 z-20">
                <DropdownMenuItem className="hover:bg-white/5 text-start justify-start" onClick={() => setSelectedProject('all')}>كل المشاريع</DropdownMenuItem>
                {projects.map(p => (
                  <DropdownMenuItem key={p.id} className="hover:bg-white/5 text-start justify-start" onClick={() => setSelectedProject(p.id)}>
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Quick Stats Strip */}
          {!loading && (
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-0.5">
              {[
                { label: 'مقاول', value: contractors.length, icon: HardHat, color: 'text-blue-400' },
                { label: 'وحدة مغطّاة', value: totalUnits, icon: Hash, color: 'text-emerald-400' },
                { label: 'مشروع', value: projectsWithContractors.length, icon: Building2, color: 'text-purple-400' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-1.5 bg-card border border-border/50 rounded-xl px-3 py-1.5 shrink-0">
                  <s.icon className={cn('w-3.5 h-3.5', s.color)} />
                  <span className={cn('text-sm font-black', s.color)}>{s.value}</span>
                  <span className="text-[11px] text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Body ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">

          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
            </div>
          )}

          {!loading && contractors.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="w-16 h-16 rounded-3xl bg-blue-500/10 flex items-center justify-center">
                <HardHat className="w-8 h-8 text-blue-400" />
              </div>
              <div>
                <p className="text-foreground font-bold text-lg">لا يوجد مقاولون</p>
                <p className="text-muted-foreground text-sm mt-1">ابدأ بإضافة مقاول جديد من الزر أعلاه</p>
              </div>
            </div>
          )}

          {!loading && filtered.length === 0 && contractors.length > 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-muted/30 flex items-center justify-center">
                <Search className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm">لا توجد نتائج لـ "<span className="text-foreground font-bold">{search}</span>"</p>
              <button onClick={() => { setSearch(''); setSelectedProject('all'); }} className="text-blue-400 text-xs hover:underline">إلغاء الفلتر</button>
            </div>
          )}

          {!loading && projectsWithContractors.map(({ project, contractors: pContractors }) => (
            <div key={project.id} className="space-y-2">
              {/* Project header */}
              <div className="flex items-center gap-2 px-1">
                <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-blue-400 to-blue-600" />
                <span className="text-sm font-bold text-foreground">{project.name}</span>
                <span className="text-xs text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full">{pContractors.length}</span>
              </div>

              {/* Contractor list — single column on mobile, 2 cols on tablet+ */}
              <div className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-2 sm:space-y-0 lg:grid-cols-3">
                {pContractors.map(c => (
                  <ContractorCard
                    key={c.id}
                    contractor={c}
                    projectMap={projectMap}
                    projectUnits={projectUnits}
                    canEdit={canEdit}
                    deleting={deletingId === c.id}
                    onEdit={() => { setEditTarget(c); setFormOpen(true); }}
                    onDelete={() => handleDelete(c.id)}
                  />
                ))}
              </div>
            </div>
          ))}

          {!loading && unassigned.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <div className="w-1.5 h-5 rounded-full bg-gradient-to-b from-amber-400 to-amber-600" />
                <span className="text-sm font-bold text-foreground">بدون وحدات محددة</span>
                <span className="text-xs text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full">{unassigned.length}</span>
              </div>
              <div className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-2 sm:space-y-0 lg:grid-cols-3">
                {unassigned.map(c => (
                  <ContractorCard
                    key={c.id}
                    contractor={c}
                    projectMap={projectMap}
                    projectUnits={projectUnits}
                    canEdit={canEdit}
                    deleting={deletingId === c.id}
                    onEdit={() => { setEditTarget(c); setFormOpen(true); }}
                    onDelete={() => handleDelete(c.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

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
  contractor, projectMap, projectUnits, canEdit, deleting, onEdit, onDelete,
}: {
  contractor: Contractor;
  projectMap: Record<string, Project>;
  projectUnits: Record<string, any[]>;
  canEdit: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { blockCount, unitCount } = useMemo(() => {
    const blockSet = new Set(contractor.assignments.filter((a: any) => a.blockId && !a.unitId).map((a: any) => a.blockId));
    const unitSet = new Set(contractor.assignments.filter((a: any) => a.unitId).map((a: any) => a.unitId));
    contractor.assignments.filter((a: any) => a.blockId && !a.unitId).forEach((a: any) => {
      if (projectUnits[a.projectId]) {
        projectUnits[a.projectId].filter((u: any) => u.blockId === a.blockId).forEach((u: any) => unitSet.add(u.id));
      }
    });
    return { blockCount: blockSet.size, unitCount: unitSet.size };
  }, [contractor.assignments, projectUnits]);

  const avatarGradient = getAvatarColor(contractor.name);

  return (
    <div className="bg-card border border-border/60 rounded-2xl p-3.5 flex items-center gap-3 hover:border-blue-500/30 hover:bg-card/80 active:scale-[0.99] transition-all group">
      {/* Avatar */}
      <div className={cn('w-11 h-11 rounded-2xl bg-gradient-to-br flex items-center justify-center shrink-0 text-white text-sm font-black shadow-sm', avatarGradient)}>
        {contractor.name.charAt(0)}
      </div>

      {/* Main Info */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-foreground text-sm truncate leading-tight">{contractor.name}</p>

        {/* Specialties */}
        {contractor.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {contractor.specialties.slice(0, 3).map((s: any) => (
              <span key={s.id} className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md border', getSpecialtyColor(s.specialtyKey))}>
                {s.specialtyKey}
              </span>
            ))}
            {contractor.specialties.length > 3 && (
              <span className="text-[10px] text-muted-foreground px-1">+{contractor.specialties.length - 3}</span>
            )}
          </div>
        )}

        {/* Coverage stats + phone */}
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
          {contractor.phone && (
            <a href={`tel:${contractor.phone}`} className="flex items-center gap-0.5 hover:text-blue-400 transition-colors" onClick={e => e.stopPropagation()}>
              <Phone className="w-3 h-3" />{contractor.phone}
            </a>
          )}
          {(blockCount > 0 || unitCount > 0) && contractor.phone && <span className="text-border">·</span>}
          {blockCount > 0 && <span className="flex items-center gap-0.5"><Building2 className="w-3 h-3" />{blockCount} بلوك</span>}
          {blockCount > 0 && unitCount > 0 && <span className="text-border">·</span>}
          {unitCount > 0 && <span className="flex items-center gap-0.5"><Hash className="w-3 h-3" />{unitCount} وحدة</span>}
        </div>
      </div>

      {/* Actions */}
      {canEdit && (
        <div className="flex flex-col items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-white hover:bg-muted transition-colors">
            <Edit className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => confirmDelete ? onDelete() : setConfirmDelete(true)}
            onBlur={() => setTimeout(() => setConfirmDelete(false), 200)}
            disabled={deleting}
            className={cn('w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
              confirmDelete ? 'bg-red-500/20 text-red-400 animate-pulse' : 'text-muted-foreground hover:text-red-400 hover:bg-red-500/10')}>
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}
