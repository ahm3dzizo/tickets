import { useState, useEffect, useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { warehouseApi, projectsApi } from '@/lib/api';
import {
  ClipboardList, Plus, Trash2, Download, X, Check, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface RequestItem {
  id?: string;
  name: string;
  quantity: number;
  unit: string;
  urgency: 'low' | 'medium' | 'high';
  notes: string;
}

const EMPTY_ITEM: RequestItem = { name: '', quantity: 1, unit: 'قطعة', urgency: 'medium', notes: '' };

const urgencyLabel: Record<string, string> = { low: 'عادي', medium: 'متوسط', high: 'عاجل' };
const urgencyColor: Record<string, string> = {
  low: 'bg-slate-500/10 text-slate-500',
  medium: 'bg-amber-500/10 text-amber-600',
  high: 'bg-red-500/10 text-red-500',
};

export default function WarehouseRequests() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [filterProject, setFilterProject] = useState('');
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Create dialog
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ projectId: '', title: '', notes: '' });
  const [formItems, setFormItems] = useState<RequestItem[]>([{ ...EMPTY_ITEM }]);
  const [saving, setSaving] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  useEffect(() => {
    projectsApi.getAll().then(p => {
      setProjects(p);
    }).catch(() => toast.error('فشل تحميل المشاريع'));
  }, []);

  const loadRequests = (projectId?: string) => {
    setLoading(true);
    warehouseApi.getRequests(projectId || undefined)
      .then(setRequests)
      .catch(() => toast.error('فشل تحميل الطلبات'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRequests(filterProject || undefined);
  }, [filterProject]);

  const openCreate = () => {
    setForm({ projectId: projects[0]?.id || '', title: '', notes: '' });
    setFormItems([{ ...EMPTY_ITEM }]);
    setShowDialog(true);
  };

  const addFormItem = () => setFormItems(p => [...p, { ...EMPTY_ITEM }]);

  const updateFormItem = (idx: number, field: keyof RequestItem, value: any) => {
    setFormItems(p => p.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const removeFormItem = (idx: number) => {
    setFormItems(p => p.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!form.projectId) { toast.error('اختر المشروع'); return; }
    const validItems = formItems.filter(it => it.name.trim());
    if (validItems.length === 0) { toast.error('أضف بنداً واحداً على الأقل'); return; }
    setSaving(true);
    try {
      const created = await warehouseApi.createRequest({
        projectId: form.projectId,
        title: form.title.trim() || undefined,
        notes: form.notes.trim() || undefined,
        items: validItems.map(it => ({
          name: it.name.trim(),
          quantity: Number(it.quantity) || 1,
          unit: it.unit || 'قطعة',
          urgency: it.urgency,
          notes: it.notes.trim() || undefined,
        })),
      });
      setRequests(prev => [created, ...prev]);
      setShowDialog(false);
      toast.success('تم إرسال الطلب');
    } catch (e: any) {
      toast.error(e.message || 'فشل الإرسال');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('حذف هذا الطلب؟')) return;
    try {
      await warehouseApi.deleteRequest(id);
      setRequests(prev => prev.filter(r => r.id !== id));
      toast.success('تم الحذف');
    } catch {
      toast.error('فشل الحذف');
    }
  };

  const handleExport = async (id: string) => {
    setExportingId(id);
    try {
      await warehouseApi.exportRequest(id);
    } catch (e: any) {
      toast.error(e.message || 'فشل التصدير');
    } finally {
      setExportingId(null);
    }
  };

  const fmt = (d: string) => new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">طلبات الاحتياجات</h1>
              <p className="text-xs text-muted-foreground">طلبات شراء الخامات والمواد</p>
            </div>
          </div>
          <Button onClick={openCreate} disabled={projects.length === 0} className="gap-2 rounded-xl">
            <Plus className="w-4 h-4" />
            طلب جديد
          </Button>
        </div>

        {/* Project filter */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => setFilterProject('')}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all',
              !filterProject ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted'
            )}
          >
            الكل
          </button>
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => setFilterProject(p.id)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all',
                filterProject === p.id ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted/60 text-muted-foreground hover:bg-muted'
              )}
            >
              {p.abbreviation || p.name}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="py-16 text-center text-muted-foreground text-sm">جارٍ التحميل...</div>
        ) : requests.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">لا توجد طلبات بعد</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => (
              <div key={req.id} className="bg-card border border-border/50 rounded-2xl overflow-hidden">
                {/* Request header */}
                <div className="px-4 py-3 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {fmt(req.createdAt)}
                    </span>
                    <span>•</span>
                    <span>{req.requester?.displayName || 'غير محدد'}</span>
                  </div>
                  <div className="text-right flex-1 min-w-0">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <Badge className="text-[10px] px-2 py-0 rounded-full bg-muted text-muted-foreground border-0">
                        {req.project?.abbreviation || req.project?.name}
                      </Badge>
                      <span className="font-semibold text-sm text-foreground truncate">
                        {req.title || `طلب مواد #${req.id.slice(-4)}`}
                      </span>
                    </div>
                    {req.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{req.notes}</p>}
                  </div>
                </div>

                {/* Items */}
                <div className="border-t border-border/40 divide-y divide-border/30">
                  {req.items?.map((it: any, idx: number) => (
                    <div key={it.id || idx} className="px-4 py-2 flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge className={cn('text-[10px] px-1.5 py-0 rounded-full border-0', urgencyColor[it.urgency] || urgencyColor.medium)}>
                          {urgencyLabel[it.urgency] || it.urgency}
                        </Badge>
                        {it.notes && <span className="text-xs text-muted-foreground hidden sm:block">— {it.notes}</span>}
                      </div>
                      <div className="flex items-center gap-3 text-right">
                        <span className="text-muted-foreground text-xs">{it.unit}</span>
                        <span className="font-semibold text-foreground w-8 text-center">{it.quantity}</span>
                        <span className="text-foreground">{it.name}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="border-t border-border/40 px-4 py-2 flex items-center justify-between">
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs rounded-xl gap-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(req.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      حذف
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs rounded-xl gap-1.5 text-muted-foreground hover:text-foreground"
                    disabled={exportingId === req.id}
                    onClick={() => handleExport(req.id)}
                  >
                    <Download className="w-3.5 h-3.5" />
                    {exportingId === req.id ? 'جارٍ...' : 'تصدير Excel'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg flex flex-col max-h-[90vh] p-0 gap-0" dir="rtl">
          <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
            <DialogTitle>طلب احتياجات جديد</DialogTitle>
          </DialogHeader>

          {/* Body */}
          <div className="overflow-y-auto flex-1 p-5 space-y-4">
            {/* Project */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">المشروع *</label>
              <select
                value={form.projectId}
                onChange={e => setForm(p => ({ ...p, projectId: e.target.value }))}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
              >
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Title */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">عنوان الطلب</label>
              <Input
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="اختياري — مثال: احتياجات الطابق الثالث"
                className="rounded-xl"
              />
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={addFormItem}
                  className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  بند جديد
                </button>
                <label className="text-xs font-medium text-muted-foreground">البنود *</label>
              </div>

              <div className="space-y-2">
                {formItems.map((item, idx) => (
                  <div key={idx} className="bg-muted/30 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      {formItems.length > 1 && (
                        <button
                          onClick={() => removeFormItem(idx)}
                          className="w-6 h-6 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                      <span className="text-xs font-medium text-muted-foreground mr-auto">بند {idx + 1}</span>
                    </div>

                    <Input
                      value={item.name}
                      onChange={e => updateFormItem(idx, 'name', e.target.value)}
                      placeholder="اسم الخامة *"
                      className="rounded-xl text-sm"
                    />

                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        type="number" min="0.5" step="0.5"
                        value={item.quantity}
                        onChange={e => updateFormItem(idx, 'quantity', e.target.value)}
                        placeholder="الكمية"
                        className="rounded-xl text-sm"
                      />
                      <Input
                        value={item.unit}
                        onChange={e => updateFormItem(idx, 'unit', e.target.value)}
                        placeholder="الوحدة"
                        className="rounded-xl text-sm"
                      />
                      <select
                        value={item.urgency}
                        onChange={e => updateFormItem(idx, 'urgency', e.target.value)}
                        className="rounded-xl border border-border bg-background px-2 py-1.5 text-sm"
                      >
                        <option value="low">عادي</option>
                        <option value="medium">متوسط</option>
                        <option value="high">عاجل</option>
                      </select>
                    </div>

                    <Input
                      value={item.notes}
                      onChange={e => updateFormItem(idx, 'notes', e.target.value)}
                      placeholder="ملاحظة (اختياري)"
                      className="rounded-xl text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">ملاحظات عامة</label>
              <Input
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="اختياري"
                className="rounded-xl"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-border shrink-0">
            <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl gap-2">
              <Check className="w-4 h-4" />
              {saving ? 'جارٍ الإرسال...' : 'إرسال الطلب'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
