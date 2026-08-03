import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { usersApi, projectsApi } from '@/lib/api';
import { Users, Shield, Mail, Search, MoreHorizontal, Phone, Briefcase } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserForm } from '@/components/team/UserForm';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const roleTranslations: Record<string, string> = { admin: 'مدير النظام', engineer: 'مهندس مشروع', supervisor: 'مشرف' };
const specialtyLabel: Record<string, string> = { mechanics: 'ميكانيكا', electricity: 'كهرباء', general: 'عام' };
const roleColors: Record<string, string> = {
  admin:      'bg-red-500/10 text-red-500 border-red-500/20',
  engineer:   'bg-purple-500/10 text-purple-500 border-purple-500/20',
  supervisor: 'bg-primary/10 text-primary border-primary/20',
};
const specialtyColor: Record<string, string> = {
  mechanics:   'bg-amber-500/10 text-amber-500 border-amber-500/20',
  electricity: 'bg-primary/10 text-primary border-primary/20',
  general:     'bg-muted text-muted-foreground border-border',
};

export default function Team() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const isEngineer = currentUser?.role === 'engineer';
  const [team, setTeam]         = useState<any[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  // Edit modal — lifted outside dropdown so it doesn't unmount when dropdown closes
  const [editUser, setEditUser] = useState<any>(null);

  const loadData = async () => {
    try {
      const [users, projectList] = await Promise.all([usersApi.getAll(), projectsApi.getAll()]);
      setTeam(users.map((u: any) => ({ ...u, id: u.uid })));
      const map: Record<string, string> = {};
      projectList.forEach((p: any) => { map[p.id] = p.name; });
      setProjects(map);
    } catch { toast.error('فشل تحميل البيانات'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const filtered = team.filter(t => {
    if (!isAdmin && t.role === 'admin') return false;
    if (isEngineer) {
      const myProjects: string[] = currentUser?.projectIds ?? [];
      if (!(t.projectIds ?? []).some((id: string) => myProjects.includes(id))) return false;
    }
    return (
      t.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      t.role?.toLowerCase().includes(search.toLowerCase()) ||
      t.email?.toLowerCase().includes(search.toLowerCase())
    );
  });

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
      <div className="space-y-6 page-in">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-right">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">إدارة الفريق</h1>
            <p className="text-muted-foreground mt-1 text-sm">إضافة وإدارة المهندسين والمشرفين</p>
          </div>
          {(isAdmin || isEngineer) && (
            <UserForm
              allowedRoles={isEngineer ? ['supervisor'] : undefined}
              lockedProjectIds={isEngineer ? (currentUser?.projectIds ?? []) : undefined}
            />
          )}
        </div>

        {/* Main card */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">

          {/* Search bar */}
          <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="البحث بالاسم أو البريد..."
                className="bg-muted/50 border-transparent focus:border-primary/30 pr-10 text-right rounded-xl h-10 text-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <span className="text-muted-foreground text-xs font-bold uppercase tracking-widest">{filtered.length} موظف</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-[10px] font-black uppercase tracking-widest border-b border-border">
                  <th className="px-5 py-3.5">الموظف</th>
                  <th className="px-5 py-3.5">الدور</th>
                  <th className="px-5 py-3.5 hidden sm:table-cell">التخصصات</th>
                  <th className="px-5 py-3.5 hidden md:table-cell">المشاريع</th>
                  <th className="px-5 py-3.5 hidden lg:table-cell">التواصل</th>
                  <th className="px-5 py-3.5 text-center">الحالة</th>
                  <th className="px-5 py-3.5 text-center w-14">...</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-5 py-4"><div className="flex items-center gap-3 justify-end"><div className="space-y-1 text-right"><div className="h-4 shimmer rounded w-24" /><div className="h-3 shimmer rounded w-16" /></div><div className="w-9 h-9 shimmer rounded-full shrink-0" /></div></td>
                      <td className="px-5 py-4"><div className="h-5 shimmer rounded-full w-20 ml-auto" /></td>
                      <td className="px-5 py-4 hidden sm:table-cell"><div className="h-5 shimmer rounded-lg w-16 ml-auto" /></td>
                      <td className="px-5 py-4 hidden md:table-cell"><div className="h-5 shimmer rounded-lg w-24 ml-auto" /></td>
                      <td className="px-5 py-4 hidden lg:table-cell"><div className="h-4 shimmer rounded w-32 ml-auto" /></td>
                      <td className="px-5 py-4"><div className="h-5 shimmer rounded w-12 mx-auto" /></td>
                      <td className="px-5 py-4"><div className="w-6 h-6 shimmer rounded mx-auto" /></td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">لا يوجد موظفين</td>
                  </tr>
                ) : filtered.map(t => {
                  const specs = getSpecialties(t);
                  const memberProjects = (t.projectIds ?? []).map((id: string) => projects[id]).filter(Boolean);
                  return (
                    <tr
                      key={t.id}
                      className="group hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => navigate(`/team/${t.id}`)}
                    >
                      {/* Name */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3 justify-start">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
                            <Shield className="w-4 h-4" />
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-foreground text-sm">{t.displayName}</div>
                            <div className="text-[10px] text-muted-foreground font-mono">{t.employeeId ? `#${t.employeeId}` : ''}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-3.5">
                        <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-bold border', roleColors[t.role] ?? roleColors.supervisor)}>
                          {roleTranslations[t.role] || t.role}
                        </span>
                      </td>

                      {/* Specialties */}
                      <td className="px-5 py-3.5 hidden sm:table-cell">
                        {specs.length > 0 ? (
                          <div className="flex flex-wrap gap-1 justify-start">
                            {specs.map((sp: string) => (
                              <span key={sp} className={cn('text-[10px] font-bold px-2 py-0.5 rounded-lg border', specialtyColor[sp] ?? specialtyColor.general)}>
                                {specialtyLabel[sp] ?? sp}
                              </span>
                            ))}
                          </div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>

                      {/* Projects */}
                      <td className="px-5 py-3.5 hidden md:table-cell max-w-[180px]">
                        {memberProjects.length > 0 ? (
                          <div className="flex flex-wrap gap-1 justify-start">
                            {memberProjects.slice(0, 2).map((name: string) => (
                              <span key={name} className="text-[10px] bg-muted border border-border text-muted-foreground px-2 py-0.5 rounded-lg font-medium">
                                {name}
                              </span>
                            ))}
                            {memberProjects.length > 2 && (
                              <span className="text-[10px] text-muted-foreground">+{memberProjects.length - 2}</span>
                            )}
                          </div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>

                      {/* Contact */}
                      <td className="px-5 py-3.5 hidden lg:table-cell">
                        <div className="space-y-1 text-right">
                          <div className="flex items-center gap-1.5 justify-start text-xs text-muted-foreground font-mono">
                            <span className="truncate max-w-[150px]">{t.email}</span>
                            <Mail className="w-3 h-3 shrink-0" />
                          </div>
                          {t.phoneNumber && (
                            <div className="flex items-center gap-1.5 justify-start text-xs text-muted-foreground font-mono">
                              <span>{t.phoneNumber}</span>
                              <Phone className="w-3 h-3 shrink-0" />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5 text-center">
                        <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-bold border',
                          t.disabled
                            ? 'bg-red-500/10 text-red-500 border-red-500/20'
                            : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        )}>
                          {t.disabled ? 'معطّل' : 'نشط'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          {/* @ts-expect-error type mismatch with Radix UI */}
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border w-48 rounded-2xl">
                            <DropdownMenuItem className="hover:bg-muted cursor-pointer text-start justify-start rounded-xl mx-1 my-0.5" onClick={() => navigate(`/team/${t.id}`)}>
                              عرض الملف الشخصي
                            </DropdownMenuItem>
                            {isAdmin && (
                              <DropdownMenuItem
                                className="hover:bg-muted cursor-pointer text-start justify-start rounded-xl mx-1 my-0.5"
                                onClick={e => { e.stopPropagation(); setEditUser(t); }}
                              >
                                تعديل البيانات
                              </DropdownMenuItem>
                            )}
                            {isAdmin && (
                              <DropdownMenuItem
                                className={cn('hover:bg-muted cursor-pointer text-start justify-start rounded-xl mx-1 my-0.5',
                                  t.disabled ? 'text-emerald-500' : 'text-amber-500')}
                                onClick={() => handleToggleStatus(t)}
                              >
                                {t.disabled ? 'تفعيل الحساب' : 'تعطيل الحساب'}
                              </DropdownMenuItem>
                            )}
                            {isAdmin && currentUser?.uid !== t.id && (
                              <DropdownMenuItem
                                className="hover:bg-red-500/10 text-red-500 cursor-pointer text-start justify-start rounded-xl mx-1 my-0.5"
                                onClick={async () => {
                                  if (!window.confirm(`هل أنت متأكد من حذف العضو "${t.displayName}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
                                  try {
                                    await usersApi.delete(t.uid || t.id);
                                    toast.success('تم حذف العضو بنجاح');
                                    loadData();
                                  } catch {
                                    toast.error('حدث خطأ أثناء الحذف');
                                  }
                                }}
                              >
                                حذف العضو
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Edit modal — rendered outside dropdown to prevent unmount-on-close */}
      {editUser && (
        <UserForm
          key={editUser.id}
          user={editUser}
          open={!!editUser}
          onOpenChange={open => { if (!open) setEditUser(null); }}
          onSaved={() => { setEditUser(null); loadData(); }}
        />
      )}
    </Layout>
  );
}
