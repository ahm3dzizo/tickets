import { useState, useEffect, useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { warehouseApi, projectsApi } from '@/lib/api';
import {
  Package, Plus, Pencil, Trash2, AlertTriangle, Search, X, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Item {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  unit: string;
  minQuantity: number | null;
  notes: string | null;
}

const EMPTY_FORM = { name: '', category: '', quantity: 0, unit: 'قطعة', minQuantity: '', notes: '' };

export default function Warehouse() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // dialog state
  const [showDialog, setShowDialog] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    projectsApi.getAll().then(p => {
      setProjects(p);
      if (p.length > 0) setSelectedProject(p[0].id);
    }).catch(() => toast.error('فشل تحميل المشاريع'));
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    warehouseApi.getItems(selectedProject)
      .then(setItems)
      .catch(() => toast.error('فشل تحميل المخزن'))
      .finally(() => setLoading(false));
  }, [selectedProject]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter(i =>
      i.name.toLowerCase().includes(s) ||
      (i.category || '').toLowerCase().includes(s)
    );
  }, [items, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    filtered.forEach(item => {
      const cat = item.category || 'عام';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    });
    return map;
  }, [filtered]);

  const openAdd = () => {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  };

  const openEdit = (item: Item) => {
    setEditItem(item);
    setForm({
      name: item.name,
      category: item.category || '',
      quantity: item.quantity,
      unit: item.unit,
      minQuantity: item.minQuantity != null ? String(item.minQuantity) : '',
      notes: item.notes || '',
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('اسم الصنف مطلوب'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category.trim() || undefined,
        quantity: Number(form.quantity) || 0,
        unit: form.unit.trim() || 'قطعة',
        minQuantity: form.minQuantity !== '' ? Number(form.minQuantity) : undefined,
        notes: form.notes.trim() || undefined,
      };
      if (editItem) {
        const updated = await warehouseApi.updateItem(editItem.id, payload);
        setItems(prev => prev.map(i => i.id === editItem.id ? updated : i));
        toast.success('تم تحديث الصنف');
      } else {
        const created = await warehouseApi.createItem({ projectId: selectedProject, ...payload });
        setItems(prev => [...prev, created]);
        toast.success('تمت الإضافة');
      }
      setShowDialog(false);
    } catch (e: any) {
      toast.error(e.message || 'فشلت العملية');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: Item) => {
    if (!confirm(`حذف "${item.name}"؟`)) return;
    try {
      await warehouseApi.deleteItem(item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
      toast.success('تم الحذف');
    } catch {
      toast.error('فشل الحذف');
    }
  };

  const isLow = (item: Item) =>
    item.minQuantity != null && item.quantity <= item.minQuantity;

  const currentProject = projects.find(p => p.id === selectedProject);

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">المخزن</h1>
              <p className="text-xs text-muted-foreground">إدارة مخزون المواد لكل مشروع</p>
            </div>
          </div>
          <Button onClick={openAdd} disabled={!selectedProject} className="gap-2 rounded-xl">
            <Plus className="w-4 h-4" />
            إضافة صنف
          </Button>
        </div>

        {/* Project tabs */}
        {projects.length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {projects.map(p => (
              <button
                key={p.id}
                onClick={() => setSelectedProject(p.id)}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all',
                  selectedProject === p.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                )}
              >
                {p.abbreviation || p.name}
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="بحث في المخزن..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-9 rounded-xl bg-muted/40 border-border/50"
          />
        </div>

        {/* Items */}
        {loading ? (
          <div className="py-16 text-center text-muted-foreground text-sm">جارٍ التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">لا توجد أصناف{search ? ' تطابق البحث' : ' — أضف أول صنف'}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {Array.from(grouped.entries()).map(([cat, catItems]) => (
              <div key={cat}>
                <p className="text-xs font-bold text-muted-foreground/60 uppercase tracking-wider mb-2 px-1">{cat}</p>
                <div className="bg-card border border-border/50 rounded-2xl overflow-hidden divide-y divide-border/40">
                  {catItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-foreground">{item.name}</span>
                          {isLow(item) && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-1 rounded-full">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              نقص
                            </Badge>
                          )}
                        </div>
                        {item.notes && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{item.notes}</p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <span className={cn(
                          'text-lg font-bold',
                          isLow(item) ? 'text-destructive' : 'text-foreground'
                        )}>
                          {item.quantity}
                        </span>
                        <span className="text-xs text-muted-foreground mr-1">{item.unit}</span>
                        {item.minQuantity != null && (
                          <p className="text-[10px] text-muted-foreground">الحد الأدنى: {item.minQuantity}</p>
                        )}
                      </div>

                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground" onClick={() => openEdit(item)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" dir="rtl">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDialog(false)} />
          <div className="relative bg-card border border-border rounded-3xl shadow-2xl w-full max-w-md mx-4 sm:mx-0 p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <button onClick={() => setShowDialog(false)} className="w-8 h-8 rounded-xl hover:bg-muted flex items-center justify-center text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
              <h2 className="text-base font-bold">{editItem ? 'تعديل الصنف' : 'إضافة صنف جديد'}</h2>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">اسم الصنف *</label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="مثال: سيراميك 60×60" className="rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">التصنيف</label>
                <Input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  placeholder="مثال: بلاط، سباكة، كهرباء" className="rounded-xl" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">الكمية</label>
                  <Input type="number" min="0" value={form.quantity}
                    onChange={e => setForm(p => ({ ...p, quantity: Number(e.target.value) }))}
                    className="rounded-xl" />
                </div>
                <div className="col-span-1">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">الوحدة</label>
                  <Input value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
                    placeholder="قطعة" className="rounded-xl" />
                </div>
                <div className="col-span-1">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">حد التنبيه</label>
                  <Input type="number" min="0" value={form.minQuantity}
                    onChange={e => setForm(p => ({ ...p, minQuantity: e.target.value }))}
                    placeholder="اختياري" className="rounded-xl" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">ملاحظات</label>
                <Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="اختياري" className="rounded-xl" />
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl gap-2">
              <Check className="w-4 h-4" />
              {saving ? 'جارٍ الحفظ...' : editItem ? 'حفظ التعديلات' : 'إضافة'}
            </Button>
          </div>
        </div>
      )}
    </Layout>
  );
}
