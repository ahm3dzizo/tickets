import React, { useState, useEffect } from 'react';
import { Plus, User, Phone, Home, Calendar, Shield, Loader2, Briefcase, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataImport } from '@/components/ui/DataImport';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clientsApi, projectsApi } from '@/lib/api';
import { Project } from '@/types';
import { toast } from 'sonner';

interface ClientFormProps {
  trigger?: React.ReactNode;
  projectId?: string;
  nativeButton?: boolean;
}

export function ClientForm({ trigger, projectId: initialProjectId, nativeButton }: ClientFormProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [villaNumber, setVillaNumber] = useState('');
  const [blockNumber, setBlockNumber] = useState('');
  const [handoverDate, setHandoverDate] = useState('');
  const [warrantyExpiryDate, setWarrantyExpiryDate] = useState('');
  const [projectId, setProjectId] = useState(initialProjectId || '');
  
  const [projects, setProjects] = useState<Project[]>([]);

  const isCustomTrigger = !!trigger;

  useEffect(() => {
    projectsApi.getAll().then(setProjects).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !villaNumber || !projectId) {
      toast.error('يرجى ملء جميع الحقول المطلوبة');
      return;
    }

    setLoading(true);
    try {
      await clientsApi.create(projectId, {
        name,
        phone,
        villaNumber,
        blockNumber,
        handoverDate,
        warrantyExpiryDate,
        projectId,
        createdAt: new Date().toISOString()
      });
      toast.success('تم إضافة العميل بنجاح');
      setOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error creating client:', error);
      const message = error instanceof Error ? error.message : 'فشل إضافة العميل';
      toast.error(message || 'فشل إضافة العميل');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setPhone('');
    setVillaNumber('');
    setBlockNumber('');
    setHandoverDate('');
    setWarrantyExpiryDate('');
    if (!initialProjectId) setProjectId('');
  };

  const handleImportClients = async (data: any[]) => {
    if (!projectId) { toast.error('اختر المشروع أولاً'); return; }
    const rows = data.map(item => {
      const keys = Object.keys(item);
      const byIndex = (i: number) => String(item[keys[i]] ?? '').trim();
      const villaNumber    = String(item.villaNumber    || item['رقم الفيلا']    || item['فيلا']        || (keys.length > 0 ? byIndex(0) : '')).trim();
      const blockNumber    = String(item.blockNumber    || item['رقم البلوك']    || item['البلوك']      || item['رقم القطعة'] || (keys.length > 1 ? byIndex(1) : '')).trim();
      const name           = String(item.name           || item['الاسم']         || item['اسم العميل']  || (keys.length > 2 ? byIndex(2) : '')).trim();
      const phone          = String(item.phone          || item['الجوال']        || item['رقم الجوال']  || item['الهاتف']     || (keys.length > 3 ? byIndex(3) : '')).trim();
      return clientsApi.create(projectId, {
        name, phone, villaNumber, blockNumber,
        handoverDate: item.handoverDate || item['تاريخ الاستلام'] || '',
        warrantyExpiryDate: item.warrantyExpiryDate || item['انتهاء الضمان'] || '',
        projectId,
        createdAt: new Date().toISOString()
      });
    });
    await Promise.all(rows);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger 
        nativeButton={nativeButton ?? true}
        render={React.isValidElement(trigger) ? trigger : (
          <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-xl h-12 px-6 font-bold shadow-lg shadow-blue-500/20">
            <Plus className="w-5 h-5" />
            إضافة عميل
          </Button>
        )} 
      />
      <DialogContent className="bg-card border-border text-slate-200 sm:max-w-[500px] rounded-3xl shadow-2xl shadow-black/40 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold text-white text-right">إضافة عميل جديد</DialogTitle>
            <DataImport 
              title="استيراد عملاء"
              description="ارفع ملف Excel يحتوي على بيانات العملاء"
              fieldDefs={[
                { key: 'villaNumber',         label: 'رقم الفيلا',          aliases: ['رقم الفيلا', 'الفيلا', 'فيلا', 'villa', 'villa number', 'villano', 'رقم villa', 'A', '__EMPTY'] },
                { key: 'blockNumber',         label: 'رقم البلوك',          aliases: ['رقم البلوك', 'البلوك', 'بلوك', 'رقم القطعة', 'القطعة', 'block', 'B', '__EMPTY_1'] },
                { key: 'name',                label: 'الاسم',               aliases: ['الاسم', 'اسم العميل', 'الاسم الكامل', 'name', 'C', '__EMPTY_2'] },
                { key: 'phone',               label: 'رقم الجوال',          aliases: ['الجوال', 'رقم الجوال', 'رقم الهاتف', 'الهاتف', 'phone', 'D', '__EMPTY_3'] },
                { key: 'handoverDate',        label: 'تاريخ التسليم',       aliases: ['تاريخ التسليم', 'التسليم', 'handover', 'E', '__EMPTY_4'] },
                { key: 'warrantyExpiryDate',  label: 'انتهاء الضمان',       aliases: ['انتهاء الضمان', 'الضمان', 'warranty', 'F', '__EMPTY_5'] },
              ]}
              onImport={handleImportClients}
            />
          </div>
          <DialogDescription className="text-slate-500 text-right">
            أدخل بيانات المالك وتفاصيل الوحدة السكنية.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">المشروع</Label>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="w-full justify-between border-border bg-white/5 text-slate-300 rounded-xl h-12" disabled={!!initialProjectId} />}>
                <Briefcase className="w-3 h-3 opacity-50" />
                <span>{projects.find(p => p.id === projectId)?.name || 'اختر المشروع'}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="bg-card border-border text-slate-200 w-64">
                {projects.map((p) => (
                  <DropdownMenuItem key={p.id} className="hover:bg-white/5 cursor-pointer text-right justify-end" onClick={() => setProjectId(p.id)}>
                    {p.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">اسم العميل</Label>
            <div className="relative">
              <Input 
                placeholder="مثال: محمد أحمد" 
                className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <User className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">رقم الهاتف</Label>
              <div className="relative">
                <Input 
                  placeholder="05xxxxxxx" 
                  className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12 font-mono"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
                <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">رقم الفيلا</Label>
              <div className="relative">
                <Input 
                  placeholder="12" 
                  className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12 font-mono"
                  value={villaNumber}
                  onChange={(e) => setVillaNumber(e.target.value)}
                  required
                />
                <Home className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">رقم البلوك (Block Number)</Label>
            <div className="relative">
              <Input 
                placeholder="مثال: A1" 
                className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12 font-mono"
                value={blockNumber}
                onChange={(e) => setBlockNumber(e.target.value)}
              />
              <Hash className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">تاريخ الاستلام</Label>
              <div className="relative">
                <Input 
                  type="date"
                  className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12"
                  value={handoverDate}
                  onChange={(e) => setHandoverDate(e.target.value)}
                />
                <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-slate-500 block text-right text-[10px] font-bold uppercase tracking-widest">انتهاء الضمان</Label>
              <div className="relative">
                <Input 
                  type="date"
                  className="bg-white/5 border-border focus:ring-2 focus:ring-blue-500/20 text-white rounded-xl h-12 text-right pr-12"
                  value={warrantyExpiryDate}
                  onChange={(e) => setWarrantyExpiryDate(e.target.value)}
                />
                <Shield className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 gap-3">
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 rounded-xl h-12 font-bold shadow-lg shadow-blue-500/20 flex-1"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إضافة العميل'}
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              className="text-slate-500 hover:text-white rounded-xl h-12"
              onClick={() => setOpen(false)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
