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
  ChevronDown, X, Building2, MapPin, Check, Wrench, Hash, Users, Download, FileSpreadsheet, Printer
} from 'lucide-react';
import { contractorsApi } from '@/lib/contractorsApi';
import { projectsApi } from '@/lib/api';
import { Contractor, ContractorVilla, Project } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

// ─── helpers ─────────────────────────────────────────────────────────────────
const CONTRACTOR_SPECIALTIES: Record<string, string> = {
  plumbing: 'سباكة', electricity: 'كهرباء', doors: 'أبواب',
  aluminum: 'ألومنيوم', garage_door: 'باب كراج'
};

const SPECIALTY_COLORS: Record<string, { badge: string; section: string; icon: string }> = {
  plumbing:     { badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20',     section: 'border-blue-500/30 bg-blue-500/5',     icon: 'text-blue-400' },
  electricity:  { badge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', section: 'border-yellow-500/30 bg-yellow-500/5', icon: 'text-yellow-400' },
  doors:        { badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', section: 'border-emerald-500/30 bg-emerald-500/5', icon: 'text-emerald-400' },
  aluminum:     { badge: 'bg-purple-500/10 text-purple-400 border-purple-500/20', section: 'border-purple-500/30 bg-purple-500/5', icon: 'text-purple-400' },
  garage_door:  { badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20', section: 'border-orange-500/30 bg-orange-500/5', icon: 'text-orange-400' },
};
const DEFAULT_COLORS = { badge: 'bg-slate-500/10 text-slate-400 border-slate-500/20', section: 'border-slate-500/30 bg-slate-500/5', icon: 'text-slate-400' };

function getSpecialtyColors(key: string) { return SPECIALTY_COLORS[key] || DEFAULT_COLORS; }
function getAvatarColor(name: string) {
  const colors = ['from-blue-500 to-blue-700','from-emerald-500 to-emerald-700','from-purple-500 to-purple-700','from-orange-500 to-orange-700','from-rose-500 to-rose-700','from-cyan-500 to-cyan-700','from-amber-500 to-amber-700','from-indigo-500 to-indigo-700'];
  return colors[name.charCodeAt(0) % colors.length];
}

// ─── Assignment Form Row ──────────────────────────────────────────────────────
interface AssignmentRow {
  id: string; projectId: string; specialtyKey: string;
  level: 'block' | 'unit' | 'block_range' | 'unit_range';
  blockId: string; unitId: string; toBlockId?: string; toUnitId?: string;
}
function newRow(): AssignmentRow {
  return { id: Math.random().toString(36).slice(2), projectId: '', specialtyKey: '', level: 'block', blockId: '', unitId: '' };
}

// ─── Contractor Form Dialog ───────────────────────────────────────────────────
interface FormDialogProps { open: boolean; onOpenChange: (v: boolean) => void; initial?: Contractor | null; projects: Project[]; onSuccess: () => void; }

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
          id: a.id, projectId: a.projectId, specialtyKey: a.specialtyKey || '',
          level: a.unitId ? 'unit' : 'block', blockId: a.blockId || '', unitId: a.unitId || '',
        })));
      } else { setAssignments([newRow()]); }
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
  }, [assignments]);

  const toggleSpecialty = (key: string) =>
    setSelectedSpecialties(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]);

  const handleAddCustomSpecialty = () => {
    const val = customSpecialty.trim();
    if (val && !selectedSpecialties.includes(val) && !Object.values(CONTRACTOR_SPECIALTIES).includes(val)) {
      setSelectedSpecialties(prev => [...prev, val]);
    }
    setCustomSpecialty('');
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
    for (const va of validAssignments) uniqueMap.set(`${va.projectId}-${va.specialtyKey}-${va.blockId}-${va.unitId}`, va);
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
      onSuccess(); onOpenChange(false);
    } catch (e: any) { toast.error(e.message || 'فشل الحفظ'); }
    finally { setSaving(false); }
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
              <Input value={customSpecialty} onChange={e => setCustomSpecialty(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomSpecialty(); } }}
                placeholder="إضافة تخصص آخر..." className="h-9 rounded-xl bg-background text-sm flex-1" />
              <Button type="button" onClick={handleAddCustomSpecialty} variant="secondary" className="h-9 rounded-xl px-3">
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
              {[...assignments].sort((a, b) => {
                if (a.projectId !== b.projectId) return (a.projectId || '').localeCompare(b.projectId || '');
                const bA = parseInt(a.blockId ? projectBlocks[a.projectId]?.find((bl: any) => bl.id === a.blockId)?.blockNumber : '0') || 0;
                const bB = parseInt(b.blockId ? projectBlocks[b.projectId]?.find((bl: any) => bl.id === b.blockId)?.blockNumber : '0') || 0;
                if (bA !== bB) return bA - bB;
                const uA = parseInt(a.unitId ? projectUnits[a.projectId]?.find((u: any) => u.id === a.unitId)?.unitNumber : '0') || 0;
                const uB = parseInt(b.unitId ? projectUnits[b.projectId]?.find((u: any) => u.id === b.unitId)?.unitNumber : '0') || 0;
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
  const [exportOpen, setExportOpen] = useState(false);
  const [exportProject, setExportProject] = useState<string>('');
  const [exportSpecialties, setExportSpecialties] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState<'pdf' | 'xlsx'>('pdf');
  const [exporting, setExporting] = useState(false);

  const canEdit = user?.role === 'admin' || user?.role === 'engineer';

  // Projects accessible to this user
  const accessibleProjectIds = useMemo(() => {
    if (user?.role === 'admin') return null; // null = all
    return user?.projectIds || [];
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allContractors, allProjects] = await Promise.all([
        contractorsApi.getAll(),
        projectsApi.getAll(),
      ]);

      // Filter projects to accessible ones
      const accessProjects: Project[] = accessibleProjectIds === null
        ? allProjects
        : allProjects.filter((p: any) => accessibleProjectIds.includes(p.id));

      setProjects(accessProjects);
      const pm: Record<string, Project> = {};
      accessProjects.forEach((p: any) => { pm[p.id] = p; });
      setProjectMap(pm);

      // Filter contractors to those serving accessible projects
      const accessiblePIds = new Set(accessProjects.map((p: any) => p.id));
      const filteredContractors = accessibleProjectIds === null
        ? allContractors
        : allContractors.filter((c: any) => c.assignments.some((a: any) => accessiblePIds.has(a.projectId)));

      setContractors(filteredContractors);

      // Load units for all accessible projects
      const unitsMap: Record<string, any[]> = {};
      await Promise.all(accessProjects.map(async (p: any) => {
        try { unitsMap[p.id] = await projectsApi.getUnits(p.id); } catch {}
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

  // ── Filtered contractors ──────────────────────────────────────────────────
  const filtered = useMemo(() => contractors.filter(c => {
    const s = search.toLowerCase();
    const matchSearch = !s || c.name.toLowerCase().includes(s) ||
      c.phone?.includes(s) ||
      c.specialties?.some((sp: any) => sp.specialtyKey.toLowerCase().includes(s) || (CONTRACTOR_SPECIALTIES[sp.specialtyKey] || '').includes(s)) ||
      c.assignments.some((a: any) => {
        if (a.unit?.unitNumber && a.unit.unitNumber.includes(s)) return true;
        if (a.block?.blockNumber && a.block.blockNumber.includes(s)) return true;
        if (a.blockId && !a.unitId && projectUnits[a.projectId]) {
          return projectUnits[a.projectId].filter((u: any) => String(u.blockId) === String(a.blockId)).some((u: any) => u.unitNumber.includes(s));
        }
        return false;
      });
    const matchProject = selectedProject === 'all' || c.assignments.some(a => a.projectId === selectedProject);
    return matchSearch && matchProject;
  }), [contractors, search, selectedProject, projectUnits]);

  // ── Group by specialty ────────────────────────────────────────────────────
  const specialtyGroups = useMemo(() => {
    const allKeys = new Set<string>();
    filtered.forEach(c => c.specialties?.forEach((s: any) => allKeys.add(s.specialtyKey)));

    const knownOrder = Object.keys(CONTRACTOR_SPECIALTIES);
    const sorted = [
      ...knownOrder.filter(k => allKeys.has(k)),
      ...[...allKeys].filter(k => !knownOrder.includes(k)).sort(),
    ];

    return sorted.map(key => {
      const groupContractors = filtered.filter(c => c.specialties?.some((s: any) => s.specialtyKey === key));
      const unitSet = new Set<string>();
      groupContractors.forEach(c => {
        c.assignments.filter((a: any) => a.specialtyKey === key).forEach((a: any) => {
          if (a.unitId) { unitSet.add(a.unitId); }
          else if (a.blockId && projectUnits[a.projectId]) {
            projectUnits[a.projectId]
              .filter((u: any) => String(u.blockId) === String(a.blockId))
              .forEach((u: any) => unitSet.add(u.id));
          }
        });
      });
      return {
        key,
        label: CONTRACTOR_SPECIALTIES[key] || key,
        contractors: groupContractors,
        unitCount: unitSet.size,
      };
    });
  }, [filtered, projectUnits]);

  const unassigned = filtered.filter(c => c.assignments.length === 0);

  const totalUnits = useMemo(() => {
    const unitSet = new Set<string>();
    contractors.forEach(c => {
      c.assignments.forEach((a: any) => {
        if (a.unitId) unitSet.add(a.unitId);
        else if (a.blockId && projectUnits[a.projectId]) {
          projectUnits[a.projectId].filter((u: any) => String(u.blockId) === String(a.blockId)).forEach((u: any) => unitSet.add(u.id));
        }
      });
    });
    return unitSet.size;
  }, [contractors, projectUnits]);

  // ── Export project specialties ────────────────────────────────────────────
  const exportProjectSpecialties = useMemo(() => {
    if (!exportProject) return [];
    const pContractors = contractors.filter(c => c.assignments.some((a: any) => a.projectId === exportProject));
    const keys = [...new Set(pContractors.flatMap(c => c.specialties?.map((s: any) => s.specialtyKey) || []))];
    const knownOrder = Object.keys(CONTRACTOR_SPECIALTIES);
    return [
      ...knownOrder.filter(k => keys.includes(k)),
      ...keys.filter(k => !knownOrder.includes(k)).sort(),
    ];
  }, [exportProject, contractors]);

  useEffect(() => {
    setExportSpecialties(new Set(exportProjectSpecialties));
  }, [exportProject]);

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!exportProject) { toast.error('اختر مشروعاً للتصدير'); return; }
    if (exportSpecialties.size === 0) { toast.error('اختر تخصصاً واحداً على الأقل'); return; }
    const units = projectUnits[exportProject] || [];
    if (units.length === 0) { toast.error('لا توجد وحدات في هذا المشروع'); return; }

    setExporting(true);
    try {
      const projectContractors = contractors.filter(c => c.assignments.some((a: any) => a.projectId === exportProject));
      const knownOrder = Object.keys(CONTRACTOR_SPECIALTIES);
      const sortedSpecialties = [
        ...knownOrder.filter(k => exportSpecialties.has(k)),
        ...exportProjectSpecialties.filter(k => !knownOrder.includes(k) && exportSpecialties.has(k)).sort(),
      ];

      // Build lookup: unitId → { specialtyKey → contractorName }
      const unitContractorMap = new Map<string, Record<string, string>>();
      for (const u of units) {
        const map: Record<string, string> = {};
        for (const c of projectContractors) {
          for (const a of c.assignments) {
            if (a.projectId !== exportProject) continue;
            const coversUnit = a.unitId === u.id || (a.blockId && !a.unitId && String(u.blockId) === String(a.blockId));
            if (coversUnit && a.specialtyKey && exportSpecialties.has(a.specialtyKey)) {
              map[a.specialtyKey] = c.name;
            }
          }
        }
        unitContractorMap.set(u.id, map);
      }

      const project = projectMap[exportProject];
      const specialtyLabels = sortedSpecialties.map(k => CONTRACTOR_SPECIALTIES[k] || k);
      const headers = ['رقم الفيلا', ...specialtyLabels];
      const sortedUnits = [...units].sort((a, b) =>
        String(a.unitNumber).localeCompare(String(b.unitNumber), undefined, { numeric: true })
      );
      const rows = sortedUnits.map(u => {
        const map = unitContractorMap.get(u.id) || {};
        return [u.unitNumber, ...sortedSpecialties.map(k => map[k] || '-')];
      });

      const tableHTML = `
        <table border="1" cellpadding="6" cellspacing="0" dir="rtl"
          style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:12px;border-color:#e5e7eb">
          <thead>
            <tr style="background:#1e40af;color:#fff">
              ${headers.map(h => `<th style="padding:8px;font-weight:bold;white-space:nowrap;text-align:center">${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row, idx) =>
              `<tr style="background:${idx % 2 === 0 ? '#f9fafb' : '#ffffff'}">
                ${row.map(cell => `<td style="text-align:center;padding:6px 8px;border-color:#e5e7eb">${cell}</td>`).join('')}
              </tr>`
            ).join('')}
          </tbody>
        </table>`;

      if (exportFormat === 'pdf') {
        const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <title>مقاولون - ${project?.name || ''}</title>
  <style>
    body { font-family: Arial, sans-serif; direction: rtl; margin: 20px; color: #111; }
    h2 { font-size: 15px; margin: 0 0 4px; }
    p  { font-size: 11px; color: #666; margin: 0 0 14px; }
    @media print { @page { size: landscape; margin: 10mm; } body { margin: 0; } }
  </style>
</head>
<body>
  <h2>مقاولو مشروع: ${project?.name || ''}</h2>
  <p>إجمالي الوحدات: ${units.length} · التخصصات: ${specialtyLabels.join('، ')}</p>
  ${tableHTML}
  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;
        const win = window.open('', '_blank', 'width=1000,height=700');
        if (!win) { toast.error('يرجى السماح بفتح النوافذ المنبثقة'); setExporting(false); return; }
        win.document.write(html);
        win.document.close();
        toast.success('فُتحت نافذة الطباعة — اختر «حفظ كـ PDF»');
        setExportOpen(false);
      } else {
        const xlsHTML = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>${project?.name || 'مقاولون'}</x:Name>
<x:WorksheetOptions><x:DisplayRightToLeft/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head>
<body>${tableHTML}</body>
</html>`;
        const blob = new Blob(['﻿' + xlsHTML], { type: 'application/vnd.ms-excel;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `مقاولون_${project?.name || ''}.xls`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('تم تصدير الملف');
        setExportOpen(false);
      }
    } catch (e: any) {
      toast.error('فشل التصدير: ' + (e.message || ''));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Layout>
      <div className="flex flex-col h-full page-in" dir="rtl">

        {/* ── Sticky Top Bar ───────────────────────────────── */}
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/40 px-4 pt-4 pb-3 space-y-3">
          {/* Title + Buttons */}
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
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setExportProject(selectedProject !== 'all' ? selectedProject : (projects[0]?.id || '')); setExportOpen(true); }}
                className="h-9 rounded-xl border-blue-500/30 bg-blue-500/5 text-blue-500 hover:bg-blue-500/10 gap-1.5 text-xs font-bold px-3"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">تصدير</span>
              </Button>
              {canEdit && (
                <Button
                  onClick={() => { setEditTarget(null); setFormOpen(true); }}
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 rounded-2xl h-9 px-4 font-bold shadow-sm text-sm"
                >
                  <Plus className="w-4 h-4" /> إضافة
                </Button>
              )}
            </div>
          </div>

          {/* Search + Project Filter */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="بحث بالاسم، تخصص، رقم فيلا..." className={cn("pr-9 h-9 rounded-xl bg-card border-border text-sm", search && "pl-9")} />
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
                  {selectedProject === 'all' ? 'كل المشاريع' : (projectMap[selectedProject]?.name?.slice(0, 10) || 'مشروع')}
                  <ChevronDown className="w-3 h-3 opacity-40" />
                </Button>
              } />
              <DropdownMenuContent className="bg-card border-border text-slate-200 z-[200]">
                <DropdownMenuItem className="hover:bg-white/5 text-start justify-start" onClick={() => setSelectedProject('all')}>كل المشاريع</DropdownMenuItem>
                {projects.map(p => (
                  <DropdownMenuItem key={p.id} className="hover:bg-white/5 text-start justify-start" onClick={() => setSelectedProject(p.id)}>
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Quick Stats */}
          {!loading && (
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-0.5">
              {[
                { label: 'مقاول', value: contractors.length, color: 'text-blue-400' },
                { label: 'وحدة مغطّاة', value: totalUnits, color: 'text-emerald-400' },
                { label: 'تخصص', value: specialtyGroups.length, color: 'text-purple-400' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-1.5 bg-card border border-border/50 rounded-xl px-3 py-1.5 shrink-0">
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
              <p className="text-muted-foreground text-sm">لا توجد نتائج</p>
              <button onClick={() => { setSearch(''); setSelectedProject('all'); }} className="text-blue-400 text-xs hover:underline">إلغاء الفلتر</button>
            </div>
          )}

          {/* ── Specialty Sections ── */}
          {!loading && specialtyGroups.map(group => {
            const colors = getSpecialtyColors(group.key);
            return (
              <div key={group.key} className="space-y-2">
                {/* Section header */}
                <div className={cn('flex items-center gap-2.5 px-3 py-2 rounded-2xl border', colors.section)}>
                  <Wrench className={cn('w-4 h-4 shrink-0', colors.icon)} />
                  <span className={cn('text-sm font-black', colors.icon)}>{group.label}</span>
                  <span className="text-xs text-muted-foreground bg-background/60 px-2 py-0.5 rounded-full font-bold">
                    {group.contractors.length} مقاول
                  </span>
                  {group.unitCount > 0 && (
                    <span className="text-xs text-muted-foreground bg-background/60 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <Hash className="w-3 h-3" />{group.unitCount} فيلا
                    </span>
                  )}
                </div>

                {/* Contractor grid */}
                <div className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-2 sm:space-y-0 lg:grid-cols-3">
                  {group.contractors.map(c => (
                    <ContractorCard
                      key={c.id}
                      contractor={c}
                      specialtyKey={group.key}
                      projectMap={projectMap}
                      projectUnits={projectUnits}
                      selectedProject={selectedProject}
                      canEdit={canEdit}
                      deleting={deletingId === c.id}
                      onEdit={() => { setEditTarget(c); setFormOpen(true); }}
                      onDelete={() => handleDelete(c.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* ── Unassigned ── */}
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
                    specialtyKey=""
                    projectMap={projectMap}
                    projectUnits={projectUnits}
                    selectedProject={selectedProject}
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
        <ContractorFormDialog open={formOpen} onOpenChange={setFormOpen} initial={editTarget} projects={projects} onSuccess={loadData} />

        {/* ── Export Dialog ────────────────────────── */}
        <Dialog open={exportOpen} onOpenChange={setExportOpen}>
          <DialogContent className="bg-card border-border text-foreground sm:max-w-[400px] rounded-3xl p-0 overflow-hidden" dir="rtl">
            <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/50">
              <DialogTitle className="text-base font-bold flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <FileSpreadsheet className="w-4 h-4 text-blue-400" />
                </div>
                تصدير المقاولين
              </DialogTitle>
            </DialogHeader>
            <div className="p-5 space-y-4">
              {/* Format selector */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExportFormat('pdf')}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border p-2.5 transition-all text-sm font-semibold',
                    exportFormat === 'pdf'
                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Printer className="w-4 h-4" />
                  PDF / طباعة
                </button>
                <button
                  type="button"
                  onClick={() => setExportFormat('xlsx')}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border p-2.5 transition-all text-sm font-semibold',
                    exportFormat === 'xlsx'
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground'
                  )}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Excel
                </button>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground">اختر المشروع</Label>
                <div className="space-y-1.5">
                  {projects.map(p => {
                    const unitCount = (projectUnits[p.id] || []).length;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setExportProject(p.id)}
                        className={cn(
                          'w-full flex items-center gap-3 p-3 rounded-xl border text-right transition-all',
                          exportProject === p.id
                            ? 'bg-blue-500/10 border-blue-500/40 text-blue-400'
                            : 'bg-muted/10 border-border/50 hover:bg-muted/30 text-foreground'
                        )}
                      >
                        <Building2 className={cn('w-4 h-4 shrink-0', exportProject === p.id ? 'text-blue-400' : 'text-muted-foreground')} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground">{unitCount} وحدة</p>
                        </div>
                        {exportProject === p.id && <Check className="w-4 h-4 text-blue-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {exportProject && exportProjectSpecialties.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-muted-foreground">التخصصات</Label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setExportSpecialties(new Set(exportProjectSpecialties))}
                        className="text-xs text-primary hover:opacity-80 transition-opacity"
                      >
                        تحديد الكل
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportSpecialties(new Set())}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        مسح الكل
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {exportProjectSpecialties.map(key => {
                      const selected = exportSpecialties.has(key);
                      const colors = getSpecialtyColors(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setExportSpecialties(prev => {
                            const next = new Set(prev);
                            selected ? next.delete(key) : next.add(key);
                            return next;
                          })}
                          className={cn(
                            'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5',
                            selected ? colors.badge : 'bg-muted/20 border-border/50 text-muted-foreground hover:bg-muted/40'
                          )}
                        >
                          {selected && <Check className="w-3 h-3 shrink-0" />}
                          {CONTRACTOR_SPECIALTIES[key] || key}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground text-right">
                    إجمالي الوحدات: <span className="font-bold text-foreground">{(projectUnits[exportProject] || []).length}</span>
                    {' · '}
                    <span className="font-bold text-foreground">{exportSpecialties.size}</span> تخصص مختار
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="px-5 pb-5 pt-0">
              <Button
                onClick={handleExport}
                disabled={!exportProject || exportSpecialties.size === 0 || exporting}
                className={cn(
                  'w-full text-white rounded-xl h-10 font-bold gap-2',
                  exportFormat === 'pdf'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                )}
              >
                {exporting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : exportFormat === 'pdf' ? <Printer className="w-4 h-4" /> : <Download className="w-4 h-4" />
                }
                {exporting ? 'جاري التصدير...' : exportFormat === 'pdf' ? 'طباعة / PDF' : 'تحميل Excel'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

// ─── Contractor Card ──────────────────────────────────────────────────────────
function ContractorCard({
  contractor, specialtyKey, projectMap, projectUnits, selectedProject, canEdit, deleting, onEdit, onDelete,
}: {
  contractor: Contractor;
  specialtyKey: string;
  projectMap: Record<string, Project>;
  projectUnits: Record<string, any[]>;
  selectedProject: string;
  canEdit: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const avatarGradient = getAvatarColor(contractor.name);

  // Assignments for this specialty (filtered by selected project)
  const relevantAssignments = useMemo(() => {
    return contractor.assignments.filter((a: any) => {
      const matchSpec = !specialtyKey || a.specialtyKey === specialtyKey;
      const matchProj = selectedProject === 'all' || a.projectId === selectedProject;
      return matchSpec && matchProj;
    });
  }, [contractor.assignments, specialtyKey, selectedProject]);

  // Count covered units for this specialty
  const coveredUnitCount = useMemo(() => {
    const unitSet = new Set<string>();
    relevantAssignments.forEach((a: any) => {
      if (a.unitId) { unitSet.add(a.unitId); }
      else if (a.blockId && projectUnits[a.projectId]) {
        projectUnits[a.projectId].filter((u: any) => String(u.blockId) === String(a.blockId)).forEach((u: any) => unitSet.add(u.id));
      }
    });
    return unitSet.size;
  }, [relevantAssignments, projectUnits]);

  // Projects for this specialty
  const projectsForSpecialty = useMemo(() => {
    const pIds = new Set(relevantAssignments.map((a: any) => a.projectId));
    return [...pIds].map(id => projectMap[id]).filter(Boolean);
  }, [relevantAssignments, projectMap]);

  return (
    <div className="bg-card border border-border/60 rounded-2xl p-3.5 flex items-center gap-3 hover:border-blue-500/30 hover:bg-card/80 active:scale-[0.99] transition-all group">
      {/* Avatar */}
      <div className={cn('w-11 h-11 rounded-2xl bg-gradient-to-br flex items-center justify-center shrink-0 text-white text-sm font-black shadow-sm', avatarGradient)}>
        {contractor.name.charAt(0)}
      </div>

      {/* Main Info */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-foreground text-sm truncate leading-tight">{contractor.name}</p>

        {/* Projects for this specialty */}
        {projectsForSpecialty.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {projectsForSpecialty.map(p => (
              <span key={p.id} className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border bg-muted/20 border-border/50 text-muted-foreground">
                {p.name}
              </span>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
          {contractor.phone && (
            <a href={`tel:${contractor.phone}`} className="flex items-center gap-0.5 hover:text-blue-400 transition-colors" onClick={e => e.stopPropagation()}>
              <Phone className="w-3 h-3" />{contractor.phone}
            </a>
          )}
          {coveredUnitCount > 0 && (
            <>
              {contractor.phone && <span className="text-border">·</span>}
              <span className="flex items-center gap-0.5">
                <Hash className="w-3 h-3" />{coveredUnitCount} وحدة
              </span>
            </>
          )}
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
