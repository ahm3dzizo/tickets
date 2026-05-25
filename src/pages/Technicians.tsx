import React, { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { techniciansApi } from '@/lib/api';
import { HardHat, Phone, Wrench, Search, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TechnicianForm } from '@/components/technicians/TechnicianForm';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const specialtyLabels: Record<string, string> = { mechanics: 'ميكانيكا / سباكة', electricity: 'كهرباء', general: 'عام' };
const specialtyColors: Record<string, string> = {
  mechanics:   'bg-amber-500/10 text-amber-500 border-amber-500/20',
  electricity: 'bg-primary/10 text-primary border-primary/20',
  general:     'bg-muted text-muted-foreground border-border',
};

export default function Technicians() {
  const { user } = useAuth();
  const isAdminOrSupervisor = user?.role === 'admin' || user?.role === 'supervisor';
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');

  const loadTechs = () =>
    techniciansApi.getAll()
      .then((list: any[]) => setTechnicians(list.sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => toast.error('فشل تحميل الفنيين'))
      .finally(() => setLoading(false));

  useEffect(() => { loadTechs(); }, []);

  const filtered = technicians.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    t.specialty?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div className="space-y-6 page-in">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-right">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">الفنيين</h1>
            <p className="text-muted-foreground mt-1 text-sm">إدارة طاقم الفنيين وتخصصاتهم</p>
          </div>
          {isAdminOrSupervisor && <TechnicianForm />}
        </div>

        {/* Main card */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">

          {/* Search */}
          <div className="p-4 border-b border-border flex items-center justify-between gap-3">
            <span className="text-muted-foreground text-xs font-bold uppercase tracking-widest shrink-0">{filtered.length} فني</span>
            <div className="relative w-full sm:w-80">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="البحث عن فني أو تخصص..."
                className="bg-muted/50 border-transparent focus:border-primary/30 pr-10 text-right rounded-xl h-10 text-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Grid of technician cards */}
          <div className="p-4">
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="border border-border rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-3 justify-start">
                      <div className="space-y-1 text-right"><div className="h-4 shimmer rounded w-20" /><div className="h-3 shimmer rounded w-14" /></div>
                      <div className="w-10 h-10 shimmer rounded-full shrink-0" />
                    </div>
                    <div className="h-5 shimmer rounded-full w-16 ml-auto" />
                    <div className="h-4 shimmer rounded w-24 ml-auto" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <HardHat className="w-7 h-7" />
                </div>
                <p className="font-semibold">لا يوجد فنيين{search ? ' مطابقين' : ''}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filtered.map(t => (
                  <div
                    key={t.id}
                    className="border border-border rounded-2xl p-4 hover:border-primary/30 hover:shadow-md transition-all duration-300 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg shrink-0 -mt-1 -ml-1">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="bg-card border-border w-44 rounded-2xl">
                          <div onClick={e => e.stopPropagation()}>
                            <TechnicianForm
                              technician={t}
                              onSaved={loadTechs}
                              trigger={
                                <DropdownMenuItem className="hover:bg-muted cursor-pointer text-start justify-start rounded-xl mx-1 my-0.5" onSelect={e => e.preventDefault()}>
                                  تعديل البيانات
                                </DropdownMenuItem>
                              }
                            />
                          </div>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <div className="flex items-center gap-3 flex-1 justify-start">
                        <div className="text-right min-w-0">
                          <div className="font-semibold text-foreground text-sm truncate">{t.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">#{t.id.slice(0, 6)}</div>
                        </div>
                        <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20 shrink-0 group-hover:bg-amber-500 group-hover:text-white transition-all duration-300">
                          <HardHat className="w-5 h-5" />
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <span className={cn('inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold border', specialtyColors[t.specialty] ?? specialtyColors.general)}>
                        {specialtyLabels[t.specialty] ?? t.specialty ?? 'عام'}
                      </span>
                      {(t.phoneNumber || t.phone) && (
                        <div className="flex items-center gap-1.5 justify-start text-xs text-muted-foreground font-mono">
                          <span>{t.phoneNumber || t.phone}</span>
                          <Phone className="w-3 h-3 shrink-0" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
