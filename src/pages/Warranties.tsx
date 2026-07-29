import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { warrantiesApi } from '@/lib/api';
import { ShieldCheck, Search, SearchX } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function Warranties() {
  const [warranties, setWarranties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadWarranties();
  }, []);

  const loadWarranties = async () => {
    try {
      setLoading(true);
      const data = await warrantiesApi.getAll();
      setWarranties(data);
    } catch (err: any) {
      toast.error('فشل تحميل بيانات الضمانات');
    } finally {
      setLoading(false);
    }
  };

  const filtered = warranties.filter(w => 
    w.unitNumber.includes(searchTerm) || 
    w.clientName.includes(searchTerm) || 
    w.clientPhone.includes(searchTerm)
  );

  return (
    <Layout title="إدارة الضمانات">
      <div className="max-w-6xl mx-auto space-y-6" dir="rtl">
        <div className="bg-card border border-border rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">ضمانات الوحدات والفلل</h1>
                <p className="text-sm text-muted-foreground">قائمة بجميع الفلل وتواريخ بداية ونهاية الضمان</p>
              </div>
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="ابحث برقم الفيلا أو العميل..."
                className="pl-3 pr-9 rounded-xl border-border bg-background h-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border overflow-hidden bg-background">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold">
                    <th className="px-4 py-3">رقم الوحدة/الفيلا</th>
                    <th className="px-4 py-3">اسم العميل</th>
                    <th className="px-4 py-3">رقم الجوال</th>
                    <th className="px-4 py-3">المشروع</th>
                    <th className="px-4 py-3">تاريخ التسليم (بداية الضمان)</th>
                    <th className="px-4 py-3">تاريخ انتهاء الضمان</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                        جاري التحميل...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground flex flex-col items-center justify-center">
                        <SearchX className="w-12 h-12 text-border mb-3" />
                        <p>لا توجد بيانات مطابقة للبحث</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((w, idx) => {
                      const expiryDate = new Date(w.warrantyExpiryDate);
                      const isExpired = expiryDate < new Date();
                      return (
                        <tr key={idx} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-semibold text-foreground">{w.unitNumber}</td>
                          <td className="px-4 py-3">{w.clientName}</td>
                          <td className="px-4 py-3" dir="ltr">{w.clientPhone}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{w.projectName}</td>
                          <td className="px-4 py-3 text-muted-foreground" dir="ltr">{w.handoverDate}</td>
                          <td className="px-4 py-3" dir="ltr">
                            <Badge variant="secondary" className={isExpired ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500"}>
                              {w.warrantyExpiryDate}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
