import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import {
  User, Lock, Bell, Shield, LogOut, ChevronDown, ChevronUp,
  Camera, Save, Eye, EyeOff, CheckCircle2, Loader2, Check,
  MessageSquare, RefreshCw, Wifi, WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi, usersApi, whatsappApi } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ── Role / specialty labels ──────────────────────────────────────────────────
const roleLabels: Record<string, string> = {
  admin:      'مدير النظام',
  engineer:   'مهندس',
  supervisor: 'مشرف',
};
const specialtyLabels: Record<string, string> = {
  mechanics:   'ميكانيكا / سباكة',
  electricity: 'كهرباء',
  general:     'عام',
};

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
        checked ? 'bg-blue-500' : 'bg-muted border border-border',
      )}
    >
      <span className={cn(
        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
        checked ? 'translate-x-6' : 'translate-x-1',
      )} />
    </button>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({
  icon: Icon, title, desc, accent = 'blue', open, onToggle, children,
}: {
  icon: React.ElementType; title: string; desc: string; accent?: string;
  open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const accentMap: Record<string, string> = {
    blue:   'bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20',
    amber:  'bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20',
    purple: 'bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20',
    green:  'bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20',
  };
  return (
    <div className={cn(
      'bg-card border rounded-3xl overflow-hidden transition-all',
      open ? 'border-blue-500/30 shadow-lg shadow-blue-500/5' : 'border-border',
    )}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-6 text-right group"
      >
        <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shrink-0', accentMap[accent] ?? accentMap.blue)}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 px-4 text-right">
          <h3 className="font-bold text-foreground text-lg">{title}</h3>
          <p className="text-muted-foreground text-sm mt-0.5">{desc}</p>
        </div>
        {open
          ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-6 pb-6 border-t border-border/40 pt-5 animate-in fade-in slide-in-from-top-2 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function Settings() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [openSection, setOpenSection] = useState<string | null>(null);
  const toggle = (s: string) => setOpenSection(prev => prev === s ? null : s);

  useEffect(() => {
    const section = location.hash.replace('#', '');
    if (section === 'profile') {
      setOpenSection('profile');
    }
  }, [location.hash]);

  // ── Profile ────────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber ?? '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.photoURL ?? null);
  const [savingProfile, setSavingProfile] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayName(user?.displayName ?? '');
    setPhoneNumber(user?.phoneNumber ?? '');
    setPhotoPreview(user?.photoURL ?? null);
  }, [user]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      await usersApi.update(user.uid, {
        displayName: displayName.trim(),
        phoneNumber: phoneNumber.trim(),
        photoURL: photoPreview,
      });

      toast.success('تم حفظ الملف الشخصي');
      setPhotoFile(null);
    } catch (err: any) {
      toast.error(err?.message ?? 'فشل الحفظ');
    } finally {
      setSavingProfile(false);
    }
  };

  // ── Security ───────────────────────────────────────────────────────────────
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  const handleChangePassword = async () => {
    if (newPass.length < 6) { toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    if (newPass !== confirmPass) { toast.error('كلمتا المرور غير متطابقتين'); return; }
    setSavingPass(true);
    try {
      await authApi.changePassword(currentPass, newPass);
      toast.success('تم تغيير كلمة المرور بنجاح');
      setCurrentPass(''); setNewPass(''); setConfirmPass('');
    } catch (err: any) {
      toast.error(err?.message ?? 'فشل تغيير كلمة المرور');
    } finally {
      setSavingPass(false);
    }
  };

  // ── Notifications ──────────────────────────────────────────────────────────
  const defaultNotifs = {
    newTicket:    true,
    ticketClosed: true,
    appointment:  true,
    whatsapp:     true,
  };
  const [notifs, setNotifs] = useState<typeof defaultNotifs>(defaultNotifs);
  const [savingNotifs, setSavingNotifs] = useState(false);

  const handleSaveNotifs = async () => {
    if (!user) return;
    setSavingNotifs(true);
    try {
      await usersApi.update(user.uid, { notifPrefs: notifs });
      toast.success('تم حفظ تفضيلات التنبيهات');
    } catch {
      toast.error('فشل الحفظ');
    } finally {
      setSavingNotifs(false);
    }
  };

  // ── WhatsApp ───────────────────────────────────────────────────────────────
  const [waStatus, setWaStatus] = useState<{
    running: boolean; connected: boolean; state?: string;
  } | null>(null);
  const [waQR, setWaQR] = useState<string | null>(null);
  const [loadingWA, setLoadingWA] = useState(false);
  const [loadingQR, setLoadingQR] = useState(false);
  const [startingWA, setStartingWA] = useState(false);
  const [restartingWA, setRestartingWA] = useState(false);

  const startWAService = async () => {
    setStartingWA(true);
    try {
      const data = await whatsappApi.start();
      toast.success(data.message || 'جاري تشغيل الخدمة...');
      setTimeout(checkWAStatus, 5000);
    } catch (err: any) {
      toast.error(err?.message ?? 'تعذّر تشغيل الخدمة');
    } finally {
      setStartingWA(false);
    }
  };

  const restartWAService = async () => {
    if (!window.confirm('هل أنت متأكد من إعادة تهيئة الجلسة؟ سيؤدي ذلك إلى مسح البيانات الحالية وطلب مسح QR جديد.')) return;
    setRestartingWA(true);
    try {
      const data = await whatsappApi.restart();
      toast.success(data.message || 'تمت إعادة تهيئة الخدمة');
      setWaQR(null);
      setTimeout(checkWAStatus, 5000);
    } catch (err: any) {
      toast.error(err?.message ?? 'تعذّر إعادة تهيئة الخدمة');
    } finally {
      setRestartingWA(false);
    }
  };

  const checkWAStatus = useCallback(async () => {
    setLoadingWA(true);
    try {
      const s = await whatsappApi.getStatus();
      setWaStatus(s);
      if (s.running && !s.connected) setWaQR(null);
    } catch {
      setWaStatus({ running: false, connected: false });
    } finally {
      setLoadingWA(false);
    }
  }, []);

  const fetchQR = async () => {
    setLoadingQR(true);
    try {
      const data = await whatsappApi.getQR();
      const qr = data.qr;
      setWaQR(qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`);
    } catch (err: any) {
      toast.error(err?.message ?? 'تعذّر جلب رمز QR');
    } finally {
      setLoadingQR(false);
    }
  };

  // ── Initials avatar ────────────────────────────────────────────────────────
  const initials = (user?.displayName ?? user?.email ?? 'U')
    .split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('');

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-right">
          <h1 className="text-3xl font-extrabold text-foreground">الإعدادات</h1>
          <p className="text-muted-foreground mt-1">تخصيص حسابك وتفضيلات النظام</p>
        </div>

        {/* ── Profile ─────────────────────────────────────────────────────── */}
        <Section icon={User} title="الملف الشخصي" desc="تعديل اسمك وصورتك الشخصية"
          accent="blue" open={openSection === 'profile'} onToggle={() => toggle('profile')}>
          <div className="space-y-5">
            {/* Avatar row */}
            <div className="flex items-center gap-5 flex-row-reverse">
              <div className="relative group cursor-pointer" onClick={() => photoInputRef.current?.click()}>
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-blue-500/20 flex items-center justify-center text-2xl font-black text-blue-400 border-2 border-blue-500/30">
                  {photoPreview
                    ? <img src={photoPreview} alt="avatar" className="w-full h-full object-cover" />
                    : initials}
                </div>
                <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              </div>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              <div className="text-right">
                <p className="text-foreground font-bold text-base">{user?.displayName || '---'}</p>
                <p className="text-muted-foreground text-sm">{user?.email}</p>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="text-blue-400 text-xs mt-1 hover:text-blue-300 transition-colors"
                >
                  تغيير الصورة
                </button>
              </div>
            </div>

            {/* Fields */}
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs font-bold text-right block">الاسم الكامل</Label>
                <Input
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="الاسم الكامل"
                  className="bg-background/70 border-border rounded-xl h-11 text-foreground text-right"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs font-bold text-right block">رقم الجوال</Label>
                <Input
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  placeholder="+966xxxxxxxxx"
                  dir="ltr"
                  className="bg-background/70 border-border rounded-xl h-11 text-foreground text-left"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 px-6 gap-2 font-bold"
              >
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                حفظ التغييرات
              </Button>
            </div>
          </div>
        </Section>

        {/* ── Security ────────────────────────────────────────────────────── */}
        <Section icon={Lock} title="الأمان" desc="تغيير كلمة المرور وإدارة الجلسات"
          accent="amber" open={openSection === 'security'} onToggle={() => toggle('security')}>
          <div className="space-y-4">
            {/* Current password */}
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-bold text-right block">كلمة المرور الحالية</Label>
              <div className="relative">
                <Input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPass}
                  onChange={e => setCurrentPass(e.target.value)}
                  placeholder="••••••••"
                  dir="ltr"
                  className="bg-background/70 border-border rounded-xl h-11 text-foreground pr-12 text-left"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-bold text-right block">كلمة المرور الجديدة</Label>
              <div className="relative">
                <Input
                  type={showNew ? 'text' : 'password'}
                  value={newPass}
                  onChange={e => setNewPass(e.target.value)}
                  placeholder="••••••••"
                  dir="ltr"
                  className="bg-background/70 border-border rounded-xl h-11 text-foreground pr-12 text-left"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm */}
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-bold text-right block">تأكيد كلمة المرور</Label>
              <div className="relative">
                <Input
                  type="password"
                  value={confirmPass}
                  onChange={e => setConfirmPass(e.target.value)}
                  placeholder="••••••••"
                  dir="ltr"
                  className={cn(
                    'bg-background/70 border-border rounded-xl h-11 text-foreground text-left',
                    confirmPass && newPass && confirmPass === newPass && 'border-emerald-500/50',
                  )}
                />
                {confirmPass && newPass && confirmPass === newPass && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
                )}
              </div>
            </div>

            {newPass.length > 0 && newPass.length < 6 && (
              <p className="text-red-400 text-xs text-right">كلمة المرور يجب أن تكون 6 أحرف على الأقل</p>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handleChangePassword}
                disabled={savingPass || !currentPass || !newPass || !confirmPass}
                className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl h-11 px-6 gap-2 font-bold"
              >
                {savingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                تغيير كلمة المرور
              </Button>
            </div>
          </div>
        </Section>

        {/* ── Notifications ───────────────────────────────────────────────── */}
        <Section icon={Bell} title="التنبيهات" desc="تخصيص تنبيهات الواتساب والتذاكر الجديدة"
          accent="purple" open={openSection === 'notifs'} onToggle={() => toggle('notifs')}>
          <div className="space-y-5">
            {([
              { key: 'newTicket',    label: 'تذكرة جديدة',          sub: 'تنبيه عند إضافة تذكرة لمشروعك' },
              { key: 'ticketClosed', label: 'إغلاق تذكرة',           sub: 'تنبيه عند إقفال أي تذكرة' },
              { key: 'appointment',  label: 'موعد صيانة',            sub: 'تذكير قبل موعد الصيانة' },
              { key: 'whatsapp',     label: 'رسائل الواتساب التلقائية', sub: 'السماح بالإرسال التلقائي' },
            ] as { key: keyof typeof defaultNotifs; label: string; sub: string }[]).map(({ key, label, sub }) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <Toggle checked={notifs[key]} onChange={v => setNotifs(p => ({ ...p, [key]: v }))} />
                <div className="text-right flex-1">
                  <p className="text-foreground font-bold text-sm">{label}</p>
                  <p className="text-muted-foreground text-xs">{sub}</p>
                </div>
              </div>
            ))}

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSaveNotifs}
                disabled={savingNotifs}
                className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-11 px-6 gap-2 font-bold"
              >
                {savingNotifs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                حفظ التفضيلات
              </Button>
            </div>
          </div>
        </Section>

        {/* ── Permissions ─────────────────────────────────────────────────── */}
        <Section icon={Shield} title="الصلاحيات" desc="عرض صلاحيات الوصول الخاصة بك"
          accent="green" open={openSection === 'perms'} onToggle={() => toggle('perms')}>
          <div className="space-y-4">
            {/* Role */}
            <div className="flex items-center justify-between bg-muted/70 rounded-2xl px-5 py-4 border border-border/60">
              <span className="font-bold text-emerald-400 text-sm px-3 py-1 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                {roleLabels[user?.role ?? ''] ?? user?.role ?? '---'}
              </span>
              <span className="text-muted-foreground text-sm font-bold">الدور الوظيفي</span>
            </div>

            {/* Specialties */}
            {(user?.specialties?.length || user?.specialty) && (
              <div className="flex items-center justify-between bg-muted/70 rounded-2xl px-5 py-4 border border-border/60">
                <div className="flex gap-2 flex-wrap justify-end">
                  {(user?.specialties?.length ? user.specialties : [user.specialty!]).map(s => (
                    <span key={s} className="text-xs font-bold px-3 py-1 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                      {specialtyLabels[s] ?? s}
                    </span>
                  ))}
                </div>
                <span className="text-muted-foreground text-sm font-bold shrink-0 mr-4">التخصصات</span>
              </div>
            )}

            {/* Projects */}
            <div className="flex items-center justify-between bg-muted/70 rounded-2xl px-5 py-4 border border-border/60">
              <span className="font-bold text-blue-300 text-sm">
                {user?.role === 'admin'
                  ? 'جميع المشاريع'
                  : user?.projectIds?.length
                    ? `${user.projectIds.length} مشروع`
                    : 'لا توجد مشاريع'}
              </span>
              <span className="text-muted-foreground text-sm font-bold">المشاريع</span>
            </div>

            {/* Employee ID */}
            {user?.employeeId && (
              <div className="flex items-center justify-between bg-muted/70 rounded-2xl px-5 py-4 border border-border/60">
                <span className="font-mono text-foreground text-sm">{user.employeeId}</span>
                <span className="text-muted-foreground text-sm font-bold">رقم الموظف</span>
              </div>
            )}

            <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl px-5 py-3 justify-end">
              <span className="text-xs font-bold">وصولك مؤمَّن عبر PostgreSQL + JWT</span>
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            </div>
          </div>
        </Section>

        {/* ── WhatsApp ────────────────────────────────────────────────────── */}
        <Section
          icon={MessageSquare}
          title="واتساب تلقائي"
          desc="اربط واتسابك لإرسال رسائل الافتتاح والإغلاق أوتوماتيك"
          accent="green"
          open={openSection === 'whatsapp'}
          onToggle={() => {
            toggle('whatsapp');
            if (openSection !== 'whatsapp') checkWAStatus();
          }}
        >
          <div className="space-y-5">
            {loadingWA && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              </div>
            )}

            {!loadingWA && waStatus && !waStatus.running && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-4 justify-end">
                  <div className="text-right">
                    <p className="text-amber-400 font-bold text-sm">خدمة الواتساب التلقائي متوقفة</p>
                    <p className="text-muted-foreground text-xs mt-0.5">يمكنك تشغيل الخدمة مباشرة من هنا أو فحص حالتها</p>
                  </div>
                  <WifiOff className="w-5 h-5 text-amber-400 shrink-0" />
                </div>
                
                <div className="flex gap-3">
                  <Button
                    onClick={checkWAStatus}
                    variant="outline"
                    className="flex-1 rounded-xl h-10 gap-2 text-sm"
                    disabled={startingWA}
                  >
                    <RefreshCw className="w-4 h-4" />
                    إعادة الفحص
                  </Button>
                  <Button
                    onClick={startWAService}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 gap-2 text-sm font-bold"
                    disabled={startingWA}
                  >
                    {startingWA ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Wifi className="w-4 h-4" />
                    )}
                    تشغيل الخدمة
                  </Button>
                </div>
              </div>
            )}

            {!loadingWA && waStatus?.running && waStatus.connected && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-4 justify-end">
                  <div className="text-right">
                    <p className="text-emerald-400 font-bold text-sm">مرتبط ونشط</p>
                    <p className="text-muted-foreground text-xs mt-0.5">الرسائل التلقائية تعمل من واتسابك</p>
                  </div>
                  <Wifi className="w-5 h-5 text-emerald-400 shrink-0" />
                </div>
                
                <div className="flex gap-3">
                  <Button
                    onClick={checkWAStatus}
                    variant="outline"
                    className="flex-1 rounded-xl h-10 gap-2 text-sm"
                    disabled={restartingWA}
                  >
                    <RefreshCw className="w-4 h-4" />
                    تحديث الحالة
                  </Button>
                  <Button
                    onClick={restartWAService}
                    variant="destructive"
                    className="flex-1 rounded-xl h-10 gap-2 text-sm font-bold"
                    disabled={restartingWA}
                  >
                    {restartingWA ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <WifiOff className="w-4 h-4" />
                    )}
                    قطع الاتصال / إعادة ضبط
                  </Button>
                </div>
              </div>
            )}

            {!loadingWA && waStatus?.running && !waStatus.connected && (
              <div className="space-y-5">
                <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl px-5 py-4 justify-end">
                  <div className="text-right">
                    <p className="text-blue-400 font-bold text-sm">في انتظار الربط</p>
                    <p className="text-muted-foreground text-xs mt-0.5">امسح رمز QR من واتساب على هاتفك</p>
                  </div>
                  <MessageSquare className="w-5 h-5 text-blue-400 shrink-0" />
                </div>

                {waQR ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="bg-white p-3 rounded-2xl shadow-lg">
                      <img src={waQR} alt="QR Code" className="w-48 h-48 object-contain" />
                    </div>
                    <p className="text-muted-foreground text-xs text-center">
                      افتح واتساب ← الأجهزة المرتبطة ← ربط جهاز ← امسح الرمز
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="w-48 h-48 bg-muted/60 rounded-2xl border border-border flex items-center justify-center">
                      <MessageSquare className="w-12 h-12 text-muted-foreground/40" />
                    </div>
                    <p className="text-muted-foreground text-xs text-center">اضغط الزر لتوليد رمز QR</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={checkWAStatus}
                    variant="outline"
                    className="flex-1 rounded-xl h-10 gap-2 text-sm"
                    disabled={loadingQR || restartingWA}
                  >
                    <RefreshCw className="w-4 h-4" />
                    فحص الاتصال
                  </Button>
                  <Button
                    onClick={fetchQR}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 gap-2 text-sm font-bold"
                    disabled={loadingQR || restartingWA}
                  >
                    {loadingQR
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <MessageSquare className="w-4 h-4" />}
                    {waQR ? 'تحديث الرمز' : 'توليد QR'}
                  </Button>
                </div>
                
                <Button
                  onClick={restartWAService}
                  variant="ghost"
                  className="w-full text-xs text-red-400 hover:text-red-300 hover:bg-red-500/5 rounded-xl h-8 mt-1"
                  disabled={loadingQR || restartingWA}
                >
                  إعادة تهيئة الجلسة بالكامل
                </Button>
              </div>
            )}
          </div>
        </Section>

        {/* ── Logout ──────────────────────────────────────────────────────── */}
        <div className="bg-red-500/5 border border-red-500/10 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-right">
            <h3 className="text-red-400 font-bold text-lg">تسجيل الخروج</h3>
            <p className="text-muted-foreground text-sm mt-0.5">سيتم الخروج من الجلسة الحالية على هذا المتصفح.</p>
          </div>
          <Button
            variant="destructive"
            className="rounded-2xl h-12 px-8 font-black gap-3 w-full sm:w-auto shrink-0"
            onClick={() => logout()}
          >
            <LogOut className="w-5 h-5" />
            خروج من الحساب
          </Button>
        </div>

        {/* ── Build info ──────────────────────────────────────────────────── */}
        <p className="text-center text-muted-foreground/70 text-[10px] font-bold uppercase tracking-[0.3em] pb-4">
          Retal Maintenance System Build 2026.4.17
        </p>
      </div>
    </Layout>
  );
}
