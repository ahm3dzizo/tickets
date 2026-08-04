import React, { useState, useEffect, useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { warrantiesApi, projectsApi } from '@/lib/api';
import { ShieldCheck, Search, SearchX, Download, Filter, FileSpreadsheet, Building2, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Project } from '@/types';
import * as XLSX from 'xlsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Warranties() {
  const [warranties, setWarranties] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expiring' | 'expired'>('all');
  const [importing, setImporting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [warrantiesData, projectsData] = await Promise.all([
        warrantiesApi.getAll(),
        projectsApi.getAll()
      ]);
      setWarranties(warrantiesData);
      setProjects(projectsData as Project[]);
    } catch (err: any) {
      toast.error('فشل تحميل بيانات الضمانات');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const now = new Date();
    const nextMonth = new Date(now.getTime() + 30 * 86_400_000);

    return warranties.filter(w => {
      // 1. Search term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const isShortNumber = /^\d{1,4}$/.test(term);
        const match = 
          (w.unitNumber || '').toLowerCase().includes(term) ||
          (w.clientName || '').toLowerCase().includes(term) ||
          (!isShortNumber && (w.clientPhone || '').includes(term));
        if (!match) return false;
      }

      // 2. Project filter
      if (selectedProjects.length > 0 && !selectedProjects.includes(w.projectId)) {
        return false;
      }

      // 3. Status filter
      if (statusFilter !== 'all') {
        const expiryDate = new Date(w.warrantyExpiryDate);
        if (statusFilter === 'expired' && expiryDate >= now) return false;
        if (statusFilter === 'expiring' && (expiryDate < now || expiryDate > nextMonth)) return false;
        if (statusFilter === 'active' && expiryDate < now) return false;
      }

      return true;
    });
  }, [warranties, searchTerm, selectedProjects, statusFilter]);

  const toggleProject = (projectId: string) => {
    setSelectedProjects(prev => 
      prev.includes(projectId) 
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const exportExcel = () => {
    if (filtered.length === 0) {
      toast.error('لا توجد بيانات للتصدير');
      return;
    }
    
    const rows = filtered.map(w => {
      const expiryDate = new Date(w.warrantyExpiryDate);
      const status = expiryDate < new Date() ? 'منتهي' : 'ساري';
      
      return {
        'رقم الفيلا': w.unitNumber,
        'اسم العميل': w.clientName,
        'رقم الجوال': w.clientPhone,
        'المشروع': w.projectName,
        'تاريخ التسليم': w.handoverDate,
        'تاريخ الانتهاء': w.warrantyExpiryDate,
        'حالة الضمان': status
      };
    });
    
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الضمانات');
    XLSX.writeFile(wb, `warranties_export.xlsx`);
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      const res = await warrantiesApi.import(file);
      if (res.success) {
        toast.success(`تم التحديث: ${res.updated} وحدة بنجاح`);
        if (res.errors && res.errors.length > 0) {
          toast.warning(`تم التحديث ببعض الأخطاء: \n${res.errors.slice(0, 5).join('\\n')}`);
        }
        loadData();
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل استيراد الضمانات');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto space-y-6" dir="rtl">
        {/* Header Section */}
        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-7 h-7 text-amber-500" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground">إدارة الضمانات</h1>
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                <span className="font-semibold text-foreground">{warranties.length}</span> إجمالي الضمانات المسجلة
              </p>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".xlsx,.xls,.csv" 
              onChange={handleImportExcel} 
            />
            <Button 
              onClick={() => fileInputRef.current?.click()} 
              variant="outline" 
              disabled={importing}
              className="gap-2 border-indigo-500/20 hover:bg-indigo-500/10 hover:text-indigo-500 transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" /> 
              {importing ? 'جاري الاستيراد...' : 'استيراد Excel'}
            </Button>
            <Button onClick={exportExcel} variant="outline" className="gap-2 border-emerald-500/20 hover:bg-emerald-500/10 hover:text-emerald-500 transition-colors">
              <Download className="w-4 h-4" /> تصدير Excel
            </Button>
          </div>
        </div>

        {/* Filters Section */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-5 relative">
            <Search className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ابحث برقم الفيلا، اسم العميل، الجوال..."
              className="pl-4 pr-11 h-12 rounded-2xl border-border bg-card shadow-sm text-base"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="md:col-span-3">
            <DropdownMenu>
              <DropdownMenuTrigger>
                <div className="flex w-full h-12 items-center justify-between rounded-2xl border border-input bg-card px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span className="truncate">
                      {selectedProjects.length === 0 ? 'كل المشاريع' : `محدد (${selectedProjects.length})`}
                    </span>
                  </div>
                  <Filter className="w-4 h-4 text-muted-foreground opacity-50" />
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" dir="rtl">
                {projects.map(p => (
                  <DropdownMenuCheckboxItem
                    key={p.id}
                    checked={selectedProjects.includes(p.id)}
                    onCheckedChange={() => toggleProject(p.id)}
                  >
                    {p.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="md:col-span-4 flex rounded-2xl bg-card border border-border p-1 shadow-sm">
            <button 
              onClick={() => setStatusFilter('all')}
              className={`flex-1 text-xs font-semibold rounded-xl transition-all ${statusFilter === 'all' ? 'bg-primary text-primary-foreground shadow' : 'hover:bg-muted text-muted-foreground'}`}
            >الكل</button>
            <button 
              onClick={() => setStatusFilter('active')}
              className={`flex-1 text-xs font-semibold rounded-xl transition-all ${statusFilter === 'active' ? 'bg-emerald-500 text-white shadow' : 'hover:bg-muted text-muted-foreground'}`}
            >ساري</button>
            <button 
              onClick={() => setStatusFilter('expiring')}
              className={`flex-1 text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1 ${statusFilter === 'expiring' ? 'bg-amber-500 text-white shadow' : 'hover:bg-muted text-muted-foreground'}`}
            ><Clock className="w-3 h-3"/> ينتهي قريباً</button>
            <button 
              onClick={() => setStatusFilter('expired')}
              className={`flex-1 text-xs font-semibold rounded-xl transition-all ${statusFilter === 'expired' ? 'bg-red-500 text-white shadow' : 'hover:bg-muted text-muted-foreground'}`}
            >منتهي</button>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-muted-foreground font-semibold">
                  <th className="px-6 py-4 whitespace-nowrap">رقم الفيلا</th>
                  <th className="px-6 py-4 whitespace-nowrap">اسم العميل</th>
                  <th className="px-6 py-4 whitespace-nowrap">رقم الجوال</th>
                  <th className="px-6 py-4 whitespace-nowrap">المشروع</th>
                  <th className="px-6 py-4 whitespace-nowrap">تاريخ التسليم</th>
                  <th className="px-6 py-4 whitespace-nowrap">انتهاء الضمان</th>
                  <th className="px-6 py-4 whitespace-nowrap">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <p className="font-semibold">جاري تحميل البيانات...</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                          <SearchX className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <p className="font-semibold text-base">لا توجد بيانات مطابقة</p>
                        <p className="text-xs">جرب تغيير كلمات البحث أو الفلاتر المختارة</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((w, idx) => {
                    const expiryDate = new Date(w.warrantyExpiryDate);
                    const now = new Date();
                    const nextMonth = new Date(now.getTime() + 30 * 86_400_000);
                    
                    let statusColor = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
                    let statusLabel = "ساري";
                    
                    if (expiryDate < now) {
                      statusColor = "bg-red-500/10 text-red-500 border-red-500/20";
                      statusLabel = "منتهي";
                    } else if (expiryDate <= nextMonth) {
                      statusColor = "bg-amber-500/10 text-amber-500 border-amber-500/20";
                      statusLabel = "ينتهي قريباً";
                    }

                    return (
                      <tr key={w.id || idx} className="hover:bg-muted/30 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="font-bold text-foreground bg-background border border-border px-3 py-1 rounded-lg inline-block shadow-sm">
                            {w.unitNumber}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-semibold">{w.clientName}</td>
                        <td className="px-6 py-4 font-medium" dir="ltr">
                          {w.clientPhone ? (
                            <span className="bg-muted px-2 py-1 rounded-md text-xs">{w.clientPhone}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className="text-muted-foreground bg-muted/50 border-transparent">
                            {w.projectName}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground text-xs font-medium" dir="ltr">{w.handoverDate}</td>
                        <td className="px-6 py-4 font-bold text-foreground" dir="ltr">{w.warrantyExpiryDate}</td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className={`border ${statusColor}`}>
                            {statusLabel}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          
          {!loading && filtered.length > 0 && (
            <div className="bg-muted/30 px-6 py-3 border-t border-border flex justify-between items-center text-xs text-muted-foreground font-medium">
              <span>عرض {filtered.length} نتيجة</span>
              {filtered.length < warranties.length && (
                <span>من أصل {warranties.length} ضمان</span>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
