import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { HardHat, Phone, Wrench, Plus, Search, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TechnicianForm } from '@/components/technicians/TechnicianForm';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Technicians() {
  const { user } = useAuth();
  const isAdminOrSupervisor = user?.role === 'admin' || user?.role === 'supervisor';
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'technicians'), orderBy('name', 'asc'));
    return onSnapshot(q, (snapshot) => {
      setTechnicians(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
  }, []);

  const filtered = technicians.filter(t => 
    t.name?.toLowerCase().includes(search.toLowerCase()) || 
    t.specialty?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="text-right order-2 md:order-1">
            <h1 className="text-3xl font-extrabold text-white">الفنيين</h1>
            <p className="text-slate-500 mt-1">إدارة طاقم الفنيين وتخصصاتهم</p>
          </div>
          <div className="order-1 md:order-2 self-end md:self-auto">
            {isAdminOrSupervisor && <TechnicianForm />}
          </div>
        </div>

        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl transition-all">
          <div className="p-6 border-b border-border bg-white/5 flex flex-col md:flex-row gap-4 items-center justify-between">
             <div className="relative w-full md:w-96">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input 
                placeholder="البحث عن فني أو تخصص..." 
                className="bg-white/5 border-border pr-12 text-right rounded-xl h-11"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
               <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">{filtered.length} فني</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead className="bg-[#1e293b] text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-border">
                <tr>
                  <th className="px-6 py-4">الاسم</th>
                  <th className="px-6 py-4">التخصص</th>
                  <th className="px-6 py-4">رقم الهاتف</th>
                  <th className="px-6 py-4">الحالة</th>
                  <th className="px-6 py-4 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500">لا يوجد فنيين حالياً</td>
                  </tr>
                ) : (
                  filtered.map((t) => (
                    <tr key={t.id} className="group hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 justify-end leading-tight">
                           <div className="text-right">
                            <div className="font-bold text-white text-sm">{t.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">#{t.id.slice(0, 6)}</div>
                          </div>
                          <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-blue-400 border border-border">
                            <HardHat className="w-4 h-4" />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-300">
                        {t.specialty === 'mechanics' ? 'ميكانيكا' : t.specialty === 'electricity' ? 'كهرباء' : 'عام'}
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-slate-400">{t.phone}</td>
                      <td className="px-6 py-4 text-xs">
                        <span className="bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded text-[10px] font-bold">نشط</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center gap-2">
                          <DropdownMenu>
                             <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-white" />}>
                                <MoreHorizontal className="w-4 h-4" />
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="end" className="bg-card border-border text-slate-200">
                                <DropdownMenuItem className="hover:bg-white/5 cursor-pointer text-right justify-end">تعديل البيانات</DropdownMenuItem>
                             </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
