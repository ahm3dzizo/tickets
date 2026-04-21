import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { usersApi, projectsApi } from '@/lib/api';
import { Users, Shield, Mail, Search, MoreHorizontal, Phone, Briefcase, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserForm } from '@/components/team/UserForm';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Team() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const [team, setTeam] = useState<any[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadData = async () => {
    try {
      const [users, projectList] = await Promise.all([
        usersApi.getAll(),
        projectsApi.getAll(),
      ]);
      setTeam(users.map((u: any) => ({ ...u, id: u.uid })));
      const map: Record<string, string> = {};
      projectList.forEach((p: any) => { map[p.id] = p.name; });
      setProjects(map);
    } catch { toast.error('فشل تحميل البيانات'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = team.filter(t =>
    t.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    t.role?.toLowerCase().includes(search.toLowerCase()) ||
    t.email?.toLowerCase().includes(search.toLowerCase())
  );

  const roleTranslations: Record<string, string> = {
    'admin': 'مدير النظام',
    'engineer': 'مهندس مشروع',
    'supervisor': 'مشرف',
  };

  const specialtyLabel: Record<string, string> = {
    'mechanics': 'ميكانيكا',
    'electricity': 'كهرباء',
    'general': 'عام',
  };

  const specialtyColor: Record<string, string> = {
    'mechanics': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'electricity': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'general': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };

  const getSpecialties = (t: any): string[] => {
    if (t.specialties?.length) return t.specialties;
    if (t.specialty) return [t.specialty];
    return [];
  };

  const handleToggleStatus = async (member: any) => {
    try {
      await usersApi.update(member.uid || member.id, { disabled: !member.disabled });
      toast.success(member.disabled ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب');
      loadData();
    } catch { toast.error('فشل تحديث الحساب'); }
  };

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="text-right order-2 md:order-1">
            <h1 className="text-3xl font-extrabold text-white">إدارة الفريق</h1>
            <p className="text-slate-500 mt-1">إضافة وإدارة المهندسين والمشرفين وأدوارهم</p>
          </div>
          <div className="order-1 md:order-2 self-end md:self-auto">
            {isAdmin && <UserForm />}
          </div>
        </div>

        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl transition-all">
          <div className="p-6 border-b border-border bg-white/5 flex flex-col md:flex-row gap-4 items-center justify-between">
             <div className="relative w-full md:w-96">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input 
                placeholder="البحث بالاسم أو البريد..." 
                className="bg-white/5 border-border pr-12 text-right rounded-xl h-11"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
               <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">{filtered.length} موظف</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead className="bg-[#1e293b] text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-border">
                <tr>
                  <th className="px-6 py-4">الموظف</th>
                  <th className="px-6 py-4">الدور</th>
                  <th className="px-6 py-4">التخصصات</th>
                  <th className="px-6 py-4">المشاريع</th>
                  <th className="px-6 py-4">التواصل</th>
                  <th className="px-6 py-4 text-center">الحالة</th>
                  <th className="px-6 py-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {loading ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-500">لا يوجد موظفين حالياً</td></tr>
                ) : filtered.map((t) => {
                  const specs = getSpecialties(t);
                  const memberProjects = (t.projectIds ?? []).map((id: string) => projects[id]).filter(Boolean);
                  return (
                    <tr key={t.id} className="group hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => navigate(`/team/${t.id}`)}>

                      {/* Name + ID */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 justify-end">
                          <div className="text-right">
                            <div className="font-bold text-white text-sm">{t.displayName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">ID: {t.employeeId || '---'}</div>
                          </div>
                          <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-blue-400 border border-border shrink-0">
                            <Shield className="w-4 h-4" />
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-4">
                        <span className={cn('px-3 py-1 rounded-full text-[10px] font-bold border',
                          t.role === 'admin'      ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          t.role === 'engineer'   ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                          'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        )}>
                          {roleTranslations[t.role] || t.role}
                        </span>
                      </td>

                      {/* Specialties */}
                      <td className="px-6 py-4">
                        {specs.length > 0 ? (
                          <div className="flex flex-wrap gap-1 justify-end">
                            {specs.map((sp: string) => (
                              <span key={sp} className={cn('text-[10px] font-bold px-2 py-0.5 rounded-lg border', specialtyColor[sp] ?? specialtyColor.general)}>
                                {specialtyLabel[sp] ?? sp}
                              </span>
                            ))}
                          </div>
                        ) : <span className="text-[10px] text-slate-600">—</span>}
                      </td>

                      {/* Projects */}
                      <td className="px-6 py-4 max-w-[200px]">
                        {memberProjects.length > 0 ? (
                          <div className="flex flex-wrap gap-1 justify-end">
                            {memberProjects.slice(0, 3).map((name: string) => (
                              <span key={name} className="text-[10px] bg-white/5 border border-border text-slate-400 px-2 py-0.5 rounded-lg font-medium">
                                {name}
                              </span>
                            ))}
                            {memberProjects.length > 3 && (
                              <span className="text-[10px] text-slate-600">+{memberProjects.length - 3}</span>
                            )}
                          </div>
                        ) : <span className="text-[10px] text-slate-600">—</span>}
                      </td>

                      {/* Contact */}
                      <td className="px-6 py-4">
                        <div className="text-right space-y-1">
                          <div className="flex items-center gap-1.5 justify-end text-xs text-slate-400 font-mono">
                            <span className="truncate max-w-[160px]">{t.email}</span>
                            <Mail className="w-3 h-3 shrink-0 text-slate-600" />
                          </div>
                          {t.phoneNumber && (
                            <div className="flex items-center gap-1.5 justify-end text-xs text-slate-500 font-mono">
                              <span>{t.phoneNumber}</span>
                              <Phone className="w-3 h-3 shrink-0 text-slate-600" />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 text-center">
                        <span className={cn('px-2 py-1 rounded text-[10px] font-bold',
                          t.disabled ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                        )}>
                          {t.disabled ? 'معطّل' : 'نشط'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-white" />}>
                              <MoreHorizontal className="w-4 h-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-card border-border text-slate-200 w-52">
                              <DropdownMenuItem
                                className="hover:bg-white/5 cursor-pointer text-right justify-end"
                                onClick={() => navigate(`/team/${t.id}`)}
                              >
                                عرض الملف الشخصي
                              </DropdownMenuItem>
                              {isAdmin && (
                                <div onClick={e => e.stopPropagation()}>
                                  <UserForm
                                    user={t}
                                    trigger={
                                      <DropdownMenuItem
                                        className="hover:bg-white/5 cursor-pointer text-right justify-end"
                                        onSelect={e => e.preventDefault()}
                                      >
                                        تعديل البيانات
                                      </DropdownMenuItem>
                                    }
                                  />
                                </div>
                              )}
                              {isAdmin && (
                                <DropdownMenuItem
                                  className="hover:bg-white/5 cursor-pointer text-right justify-end"
                                  onClick={() => handleToggleStatus(t)}
                                >
                                  {t.disabled ? 'تفعيل الحساب' : 'تعطيل الحساب'}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
