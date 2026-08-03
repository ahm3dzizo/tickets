import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { UserForm } from '@/components/team/UserForm';
import { TicketTable } from '@/components/tickets/TicketTable';
import { usersApi, projectsApi, ticketsApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Shield, Mail, Phone, Hash, Calendar,
  Ticket as TicketIcon, CheckCircle2, Clock, AlertCircle,
  Loader2, UserX, UserCheck, Edit2, ArrowRight,
  ClipboardList, ChevronRight, Trash2
} from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

const roleLabel: Record<string, string> = {
  admin: 'مدير النظام',
  engineer: 'مهندس مشروع',
  supervisor: 'مشرف',
};
const roleColor: Record<string, string> = {
  admin: 'bg-red-500/10 text-red-400 border-red-500/20',
  engineer: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  supervisor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
};
const specialtyLabel: Record<string, string> = {
  mechanics: 'ميكانيكا',
  electricity: 'كهرباء',
  general: 'عام',
};
const specialtyColor: Record<string, string> = {
  mechanics: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  electricity: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  general: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

// ─── component ────────────────────────────────────────────────────────────────

export default function TeamMemberDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [member, setMember] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Fetch member
  const loadData = async () => {
    if (!id) return;
    try {
      const [memberData, allProjects, allTickets] = await Promise.all([
        usersApi.get(id),
        projectsApi.getAll(),
        ticketsApi.getAll(),
      ]);
      setMember(memberData ?? null);
      const map: Record<string, string> = {};
      (allProjects as any[]).forEach(p => { map[p.id] = p.name; });
      setProjects(map);
      setTickets((allTickets as any[]).filter(t =>
        Array.isArray(t.assignedSupervisorIds) && t.assignedSupervisorIds.includes(id)
      ));
    } catch { setMember(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [id]);

  const handleToggleStatus = async () => {
    if (!member) return;
    try {
      await usersApi.update(member.id, { disabled: !member.disabled });
      toast.success(member.disabled ? 'تم تفعيل الحساب' : 'تم تعطيل الحساب');
      loadData();
    } catch { toast.error('فشل تحديث الحساب'); }
  };

  const handleDelete = async () => {
    if (!member) return;
    if (!window.confirm(`هل أنت متأكد من حذف العضو "${member.displayName}"؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setDeleting(true);
    try {
      await usersApi.delete(member.id);
      toast.success('تم حذف العضو بنجاح');
      navigate('/team');
    } catch {
      toast.error('حدث خطأ أثناء الحذف');
      setDeleting(false);
    }
  };

  // ── derived stats ──────────────────────────────────────────────────────────
  const totalTickets   = tickets.length;
  const openTickets    = tickets.filter(t => t.status === 'open').length;
  const activeTickets  = tickets.filter(t => t.status === 'in-progress' || t.status === 'pending').length;
  const closedTickets  = tickets.filter(t => t.status === 'closed' || t.status === 'completed').length;

  const memberProjects = member
    ? (member.projectIds ?? []).map((pid: string) => ({ id: pid, name: projects[pid] })).filter((p: any) => p.name)
    : [];

  // Convert projects map to format expected by TicketTable
  const projectsForTable = Object.fromEntries(
    Object.entries(projects).map(([id, name]) => [id, { name }])
  );

  const specialties: string[] = member
    ? (member.specialties?.length ? member.specialties : member.specialty ? [member.specialty] : [])
    : [];

  // ── loading / not found ────────────────────────────────────────────────────
  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        </div>
      </Layout>
    );
  }

  if (!member) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
          <UserX className="w-12 h-12 text-slate-600" />
          <p className="text-slate-400">لم يتم العثور على هذا العضو</p>
          <Button variant="outline" onClick={() => navigate('/team')}>
            <ArrowRight className="w-4 h-4 ml-2" /> العودة للفريق
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8">

        {/* ── header ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* breadcrumb + title */}
          <div className="text-right space-y-2 order-2 md:order-1">
            <button
              onClick={() => navigate('/team')}
              className="flex items-center gap-1.5 text-slate-500 hover:text-white text-xs transition-colors"
            >
              <span>الفريق</span>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-white">{member.displayName}</span>
            </button>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-extrabold text-white">{member.displayName}</h1>
              <span className={cn('px-3 py-1 rounded-full text-[11px] font-bold border', roleColor[member.role] ?? roleColor.supervisor)}>
                {roleLabel[member.role] ?? member.role}
              </span>
              <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold',
                member.disabled ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
              )}>
                {member.disabled ? 'معطّل' : 'نشط'}
              </span>
            </div>
            {member.employeeId && (
              <p className="text-slate-500 font-mono text-xs">ID: {member.employeeId}</p>
            )}
          </div>

          {/* action buttons */}
          <div className="flex gap-2 order-1 md:order-2 flex-wrap justify-end">
            <UserForm
              user={member}
              nativeButton={true}
              trigger={
                <Button variant="outline" className="gap-2 border-border text-slate-300 hover:text-white">
                  <Edit2 className="w-4 h-4" /> تعديل البيانات
                </Button>
              }
            />
            <Button
              variant="outline"
              className={cn('gap-2 border-border', member.disabled
                ? 'text-emerald-400 hover:text-emerald-300'
                : 'text-amber-400 hover:text-amber-300'
              )}
              onClick={handleToggleStatus}
            >
              {member.disabled ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
              {member.disabled ? 'تفعيل الحساب' : 'تعطيل الحساب'}
            </Button>
            {isAdmin && currentUser?.uid !== member.id && (
              <Button
                variant="outline"
                disabled={deleting}
                className="gap-2 border-red-500/30 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={handleDelete}
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                حذف العضو
              </Button>
            )}
          </div>
        </div>

        {/* ── stats row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'إجمالي التذاكر', value: totalTickets,  icon: ClipboardList, color: 'text-blue-400',    bg: 'bg-blue-500/10'   },
            { label: 'مفتوحة',          value: openTickets,   icon: AlertCircle,   color: 'text-red-400',     bg: 'bg-red-500/10'    },
            { label: 'جارية / معلقة',   value: activeTickets, icon: Clock,         color: 'text-amber-400',   bg: 'bg-amber-500/10'  },
            { label: 'مكتملة / مغلقة',  value: closedTickets, icon: CheckCircle2,  color: 'text-emerald-400', bg: 'bg-emerald-500/10'},
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4 justify-between">
              <div className="text-right">
                <div className="text-3xl font-black text-white">{s.value}</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
              </div>
              <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', s.bg)}>
                <s.icon className={cn('w-5 h-5', s.color)} />
              </div>
            </div>
          ))}
        </div>

        {/* ── profile + info grid ── */}
        <div className="grid md:grid-cols-3 gap-6">

          {/* contact card */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">بيانات التواصل</h2>
            <InfoRow icon={Mail}  label="البريد الإلكتروني" value={member.email} />
            <InfoRow icon={Phone} label="رقم الجوال"         value={member.phoneNumber || '—'} />
            <InfoRow icon={Hash}  label="الرقم الوظيفي"      value={member.employeeId || '—'} />
            <InfoRow icon={Calendar} label="تاريخ الإضافة"   value={
              member.createdAt
                ? new Date(member.createdAt).toLocaleDateString('ar-SA')
                : '—'
            } />
          </div>

          {/* specialties card */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">التخصصات</h2>
            {specialties.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {specialties.map((sp: string) => (
                  <span key={sp} className={cn('px-3 py-1.5 rounded-xl text-sm font-bold border', specialtyColor[sp] ?? specialtyColor.general)}>
                    {specialtyLabel[sp] ?? sp}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-slate-600 text-sm">لا توجد تخصصات مسجلة</p>
            )}
          </div>

          {/* projects card */}
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
              المشاريع ({memberProjects.length})
            </h2>
            {memberProjects.length > 0 ? (
              <div className="space-y-2">
                {memberProjects.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="w-full flex items-center justify-between text-right px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-border transition-colors text-sm"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                    <span className="font-medium text-slate-300">{p.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-slate-600 text-sm">لا توجد مشاريع مخصصة</p>
            )}
          </div>
        </div>

        {/* ── tickets table ── */}
        <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-border bg-white/5 flex items-center justify-between">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">{totalTickets} تذكرة</span>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <TicketIcon className="w-5 h-5 text-blue-400" />
              التذاكر المسندة
            </h2>
          </div>
          <TicketTable
            tickets={tickets as any}
            projects={projectsForTable}
            hideSupervisorColumn={true}
            showInlineFilters={tickets.length > 5}
            maxHeight="600px"
            emptyMessage="لا توجد تذاكر مسندة لهذا العضو"
            onRefresh={loadData}
          />
        </div>

      </div>
    </Layout>
  );
}

// ─── small helpers ─────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 justify-end">
      <div className="text-right">
        <div className="text-[10px] text-slate-500">{label}</div>
        <div className="text-sm text-slate-200 font-medium">{value}</div>
      </div>
      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-border shrink-0">
        <Icon className="w-3.5 h-3.5 text-slate-500" />
      </div>
    </div>
  );
}

