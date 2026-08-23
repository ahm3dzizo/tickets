import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { usersApi, projectsApi } from '@/lib/api';
import {
  Users, Shield, Mail, Search, MoreHorizontal, Phone,
  Briefcase, ChevronDown, ChevronRight, HardHat, UserPlus,
  Crown, Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserForm } from '@/components/team/UserForm';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const roleColors: Record<string, string> = {
  admin:      'bg-red-500/10 text-red-500 border-red-500/20',
  engineer:   'bg-purple-500/10 text-purple-500 border-purple-500/20',
  supervisor: 'bg-primary/10 text-primary border-primary/20',
};
const roleLabels: Record<string, string> = {
  admin: 'مدير النظام', engineer: 'مهندس مشروع', supervisor: 'مشرف',
};
const roleIcons: Record<string, React.ElementType> = {
  admin: Crown, engineer: Briefcase, supervisor: Shield,
};

interface Member {
  uid: string; id: string; displayName: string; role: string;
  email?: string; phoneNumber?: string; employeeId?: string;
  projectIds?: string[]; disabled?: boolean;
}

export default function Team() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const isAdmin    = currentUser?.role === 'admin';
  const isEngineer = currentUser?.role === 'engineer';

  const [team, setTeam]         = useState<Member[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [editUser, setEditUser] = useState<any>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const loadData = async () => {
    try {
      const [users, projectList] = await Promise.all([usersApi.getAll(), projectsApi.getAll()]);
      setTeam(users.map((u: any) => ({ ...u, id: u.uid })));
      setProjects(projectList as any[]);
    } catch { toast.error('فشل تحميل البيانات'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const handleToggleStatus = async (member: Member) => {
    try {
      await usersApi.update(member.uid || member.id, { disabled: !member.disabled });
      toast.success(member.disabled ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب');
      loadData();
    } catch { toast.error('فشل تحديث الحساب'); }
  };

  const toggleProject = (id: string) => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  // Build tree structure
  const admins = team.filter(u => u.role === 'admin');
  const engineers = team.filter(u => u.role === 'engineer');
  const supervisors = team.filter(u => u.role === 'supervisor');

  // Filter by search
  const matchesSearch = (u: Member) =>
    !search ||
    u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.employeeId?.toLowerCase().includes(search.toLowerCase());

  // Visible projects scoped to engineer's access
  const visibleProjects = isEngineer
    ? projects.filter(p => (currentUser?.projectIds ?? []).includes(p.id))
    : projects;

  const getProjectEngineers = (projectId: string) =>
    engineers.filter(e => (e.projectIds ?? []).includes(projectId) && matchesSearch(e));

  const getProjectSupervisors = (projectId: string) =>
    supervisors.filter(s => (s.projectIds ?? []).includes(projectId) && matchesSearch(s));

  // Stats
  const activeCount = team.filter(u => !u.disabled).length;

  const MemberCard = ({ member, indent = 0 }: { member: Member; indent?: number }) => {
    const Icon = roleIcons[member.role] ?? Shield;
    const canEdit = isAdmin || (isEngineer && member.role === 'supervisor');

    if (!matchesSearch(member)) return null;

    return (
      <div className={cn(
        "group flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-200 cursor-pointer hover:border-primary/20 hover:bg-muted/30",
        member.disabled ? 'opacity-50 border-border/50' : 'border-border',
        indent === 1 && 'mr-6',
        indent === 2 && 'mr-12',
      )}
        onClick={() => navigate(`/team/${member.id}`)}
      >
        {/* Avatar */}
        <div className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center border shrink-0',
          roleColors[member.role]?.split(' ').slice(0, 2).join(' ') || 'bg-muted border-border',
          'border',
          member.role === 'admin' ? 'border-red-500/30' : member.role === 'engineer' ? 'border-purple-500/30' : 'border-primary/30',
        )}>
          <Icon className="w-4 h-4" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 text-right">
          <div className="flex items-center gap-2 justify-end flex-wrap">
            <span className="font-semibold text-foreground text-sm truncate">{member.displayName}</span>
            <span className={cn('px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wide', roleColors[member.role])}>
              {roleLabels[member.role] || member.role}
            </span>
            {member.disabled && (
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-red-500/10 text-red-400 border border-red-500/20">معطّل</span>
            )}
          </div>
          <div className="flex items-center gap-3 justify-end mt-0.5 flex-wrap">
            {member.employeeId && <span className="text-[10px] text-muted-foreground font-mono">#{member.employeeId}</span>}
            {member.email && <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">{member.email}</span>}
            {member.phoneNumber && <span className="text-[10px] text-muted-foreground font-mono">{member.phoneNumber}</span>}
          </div>
        </div>

        {/* Actions */}
        <div onClick={e => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <button className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors opacity-0 group-hover:opacity-100">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            } />
            <DropdownMenuContent align="end" className="bg-card border-border w-48 rounded-2xl">
              <DropdownMenuItem className="hover:bg-muted cursor-pointer text-start justify-start rounded-xl mx-1 my-0.5" onClick={() => navigate(`/team/${member.id}`)}>
                عرض الملف الشخصي
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem className="hover:bg-muted cursor-pointer text-start justify-start rounded-xl mx-1 my-0.5" onClick={() => setEditUser(member)}>
                  تعديل البيانات
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <DropdownMenuItem
                  className={cn('hover:bg-muted cursor-pointer text-start justify-start rounded-xl mx-1 my-0.5', member.disabled ? 'text-emerald-500' : 'text-amber-500')}
                  onClick={() => handleToggleStatus(member)}
                >
                  {member.disabled ? 'تفعيل الحساب' : 'تعطيل الحساب'}
                </DropdownMenuItem>
              )}
              {isAdmin && currentUser?.uid !== member.id && (
                <DropdownMenuItem
                  className="hover:bg-red-500/10 text-red-500 cursor-pointer text-start justify-start rounded-xl mx-1 my-0.5"
                  onClick={async () => {
                    if (!window.confirm(`هل أنت متأكد من حذف العضو "${member.displayName}"؟`)) return;
                    try {
                      await usersApi.delete(member.uid || member.id);
                      toast.success('تم حذف العضو');
                      loadData();
                    } catch { toast.error('حدث خطأ أثناء الحذف'); }
                  }}
                >
                  حذف العضو
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="space-y-6 page-in">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="text-right">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">إدارة الفريق</h1>
            <p className="text-muted-foreground mt-1 text-sm">الهيكل التنظيمي للمهندسين والمشرفين</p>
          </div>

          {/* Stats + Add button */}
          <div className="flex items-center gap-3 flex-wrap">
            {[
              { icon: Crown, label: 'مدراء', count: admins.length, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
              { icon: Briefcase, label: 'مهندسون', count: engineers.length, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
              { icon: Shield, label: 'مشرفون', count: supervisors.length, color: 'text-primary bg-primary/10 border-primary/20' },
            ].map(s => (
              <div key={s.label} className={cn('hidden sm:flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full border', s.color)}>
                <s.icon className="w-3.5 h-3.5" />
                <span>{s.count} {s.label}</span>
              </div>
            ))}
            {(isAdmin || isEngineer) && (
              <UserForm
                allowedRoles={isEngineer ? ['supervisor'] : undefined}
                lockedProjectIds={isEngineer ? (currentUser?.projectIds ?? []) : undefined}
                trigger={
                  <Button size="sm" className="gap-2 shrink-0">
                    <UserPlus className="w-4 h-4" />
                    إضافة عضو
                  </Button>
                }
              />
            )}
          </div>
        </div>

        {/* ── Mobile stats ── */}
        <div className="sm:hidden grid grid-cols-3 gap-2">
          {[
            { icon: Crown, label: 'مدراء', count: admins.length, color: 'text-red-400 bg-red-500/10 border-red-500/20' },
            { icon: Briefcase, label: 'مهندسون', count: engineers.length, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
            { icon: Shield, label: 'مشرفون', count: supervisors.length, color: 'text-primary bg-primary/10 border-primary/20' },
          ].map(s => (
            <div key={s.label} className={cn('flex flex-col items-center gap-1 text-xs font-bold p-3 rounded-2xl border', s.color)}>
              <s.icon className="w-5 h-5" />
              <span className="text-lg font-black">{s.count}</span>
              <span className="text-[10px]">{s.label}</span>
            </div>
          ))}
        </div>

        {/* ── Search ── */}
        <div className="relative max-w-sm">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="البحث بالاسم أو البريد أو الرقم..."
            className="bg-card border-border focus:border-primary/30 pr-10 text-right rounded-xl h-10 text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-card border border-border rounded-3xl p-5 space-y-3">
                <div className="h-5 shimmer rounded w-40" />
                {[0, 1].map(j => (
                  <div key={j} className="flex items-center gap-3 p-3 rounded-2xl border border-border">
                    <div className="w-9 h-9 shimmer rounded-xl shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-4 shimmer rounded w-32 mr-auto" />
                      <div className="h-3 shimmer rounded w-24 mr-auto" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">

            {/* ── Admins ── (only visible to admin) */}
            {isAdmin && admins.filter(matchesSearch).length > 0 && (
              <div className="bg-card border border-red-500/20 rounded-3xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-red-500/5 flex items-center gap-3">
                  <Crown className="w-4 h-4 text-red-400" />
                  <h2 className="font-bold text-sm text-red-400">مدراء النظام</h2>
                  <span className="text-[10px] bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-black">{admins.filter(matchesSearch).length}</span>
                </div>
                <div className="p-3 space-y-2">
                  {admins.filter(matchesSearch).map(m => <MemberCard key={m.id} member={m} />)}
                </div>
              </div>
            )}

            {/* ── Projects + Engineers + Supervisors ── */}
            {visibleProjects.map(project => {
              const projEngineers   = getProjectEngineers(project.id);
              const projSupervisors = getProjectSupervisors(project.id);
              const total = projEngineers.length + projSupervisors.length;

              if (search && total === 0) return null;

              const isOpen = !collapsed[project.id];

              return (
                <div key={project.id} className="bg-card border border-border rounded-3xl overflow-hidden">

                  {/* Project header (clickable to collapse) */}
                  <button
                    className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-muted/30 transition-colors border-b border-border"
                    onClick={() => toggleProject(project.id)}
                  >
                    <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1 text-right min-w-0">
                      <div className="flex items-center gap-2 justify-end flex-wrap">
                        <span className="font-bold text-sm text-foreground">{project.name}</span>
                        <span className="text-[10px] font-black text-muted-foreground bg-muted px-2 py-0.5 rounded-lg">{project.abbreviation}</span>
                      </div>
                      <div className="flex items-center gap-3 justify-end mt-0.5">
                        <span className="text-[10px] text-purple-400">{projEngineers.length} مهندس</span>
                        <span className="text-[10px] text-primary">{projSupervisors.length} مشرف</span>
                      </div>
                    </div>
                    {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                  </button>

                  {/* Collapsed content */}
                  {isOpen && (
                    <div className="p-3 space-y-1">

                      {/* Engineers */}
                      {projEngineers.length > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 px-2 py-1">
                            <Briefcase className="w-3 h-3 text-purple-400" />
                            <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">المهندسون</span>
                          </div>
                          {projEngineers.map(m => <MemberCard key={m.id} member={m} indent={1} />)}
                        </div>
                      )}

                      {/* Supervisors */}
                      {projSupervisors.length > 0 && (
                        <div className={cn("space-y-1", projEngineers.length > 0 && "mt-2 pt-2 border-t border-border/50")}>
                          <div className="flex items-center gap-2 px-2 py-1">
                            <Shield className="w-3 h-3 text-primary" />
                            <span className="text-[10px] font-black text-primary uppercase tracking-widest">المشرفون</span>
                          </div>
                          {projSupervisors.map(m => <MemberCard key={m.id} member={m} indent={2} />)}
                        </div>
                      )}

                      {projEngineers.length === 0 && projSupervisors.length === 0 && (
                        <div className="py-8 text-center text-muted-foreground text-xs">
                          <Users className="w-6 h-6 mx-auto mb-2 opacity-40" />
                          <p>لا يوجد أعضاء مخصصون لهذا المشروع</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Members without a project */}
            {(() => {
              const orphans = [...engineers, ...supervisors].filter(m =>
                !visibleProjects.some(p => (m.projectIds ?? []).includes(p.id)) && matchesSearch(m)
              );
              if (orphans.length === 0) return null;
              return (
                <div className="bg-card border border-amber-500/20 rounded-3xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-border bg-amber-500/5 flex items-center gap-3">
                    <AlertIcon className="w-4 h-4 text-amber-400" />
                    <h2 className="font-bold text-sm text-amber-400">بدون مشروع مخصص</h2>
                    <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-black">{orphans.length}</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {orphans.map(m => <MemberCard key={m.id} member={m} />)}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Edit modal — outside dropdown to prevent unmount-on-close */}
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

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" /><path d="M12 17h.01" />
    </svg>
  );
}
