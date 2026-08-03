import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'react-router-dom';
import {
  User, Lock, Bell, Shield, LogOut, X,
  Camera, Save, Eye, EyeOff, CheckCircle2, Loader2, Check,
  MessageSquare, RefreshCw, Wifi, WifiOff, Download, Clock,
  Bot, Link2, ScrollText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { authApi, usersApi, whatsappApi, whatsappBotApi, settingsApi, projectsApi } from '@/lib/api';
import type { WorkHoursConfig, WorkHoursSettings } from '@/lib/api';
import type { Project } from '@/types';
import { toast } from 'sonner';
import { io } from 'socket.io-client';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';

// ── Static data outside component ────────────────────────────────────────────
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

const DEFAULT_WH_CONFIG: WorkHoursConfig = {
  enabled:      true,
  hasMorning:   true,
  morning:      { start: '08:00', end: '12:00' },
  hasBreak:     true,
  break:        { start: '12:00', end: '13:00' },
  hasAfternoon: true,
  afternoon:    { start: '13:00', end: '16:00' },
};

type SectionMeta = { key: string; title: string; desc: string; icon: React.ElementType; accent: string };

// Full class strings so Tailwind v4 scanner picks them up
const ACCENT: Record<string, {
  iconBg: string; iconText: string; border: string;
  shadow: string; headerGrad: string; dotColor: string;
}> = {
  blue: {
    iconBg:     'bg-blue-500/15',
    iconText:   'text-blue-400',
    border:     'border-blue-500/30',
    shadow:     'shadow-blue-500/10',
    headerGrad: 'from-blue-500/8',
    dotColor:   'bg-blue-400',
  },
  amber: {
    iconBg:     'bg-amber-500/15',
    iconText:   'text-amber-400',
    border:     'border-amber-500/30',
    shadow:     'shadow-amber-500/10',
    headerGrad: 'from-amber-500/8',
    dotColor:   'bg-amber-400',
  },
  purple: {
    iconBg:     'bg-purple-500/15',
    iconText:   'text-purple-400',
    border:     'border-purple-500/30',
    shadow:     'shadow-purple-500/10',
    headerGrad: 'from-purple-500/8',
    dotColor:   'bg-purple-400',
  },
  green: {
    iconBg:     'bg-emerald-500/15',
    iconText:   'text-emerald-400',
    border:     'border-emerald-500/30',
    shadow:     'shadow-emerald-500/10',
    headerGrad: 'from-emerald-500/8',
    dotColor:   'bg-emerald-400',
  },
};

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none',
        checked ? 'bg-blue-500' : 'bg-muted border border-border',
      )}
    >
      <span className={cn(
        'absolute top-1 left-0 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200',
        checked ? 'translate-x-6' : 'translate-x-1',
      )} />
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════════════
export default function Settings() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [openSection, setOpenSection] = useState<string | null>(null);

  useEffect(() => {
    const section = location.hash.replace('#', '');
    if (section) setOpenSection(section);
  }, [location.hash]);

  // ── Profile ────────────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber ?? '');
  const [photoFile, setPhotoFile]     = useState<File | null>(null);
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
      await usersApi.update(user.uid, { displayName: displayName.trim(), phoneNumber: phoneNumber.trim(), photoURL: photoPreview });
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
  const [newPass,     setNewPass]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [savingPass,  setSavingPass]  = useState(false);

  const handleChangePassword = async () => {
    if (newPass.length < 6)         { toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
    if (newPass !== confirmPass)     { toast.error('كلمتا المرور غير متطابقتين'); return; }
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
  const defaultNotifs = { newTicket: true, ticketClosed: true, appointment: true, whatsapp: true };
  const [notifs, setNotifs]           = useState<typeof defaultNotifs>(defaultNotifs);
  const [savingNotifs, setSavingNotifs] = useState(false);

  const handleSaveNotifs = async () => {
    if (!user) return;
    setSavingNotifs(true);
    try {
      await usersApi.update(user.uid, { notifPrefs: notifs });
      toast.success('تم حفظ تفضيلات التنبيهات');
    } catch { toast.error('فشل الحفظ'); }
    finally { setSavingNotifs(false); }
  };

  // ── WhatsApp ───────────────────────────────────────────────────────────────
  const [waStatus, setWaStatus] = useState<{
    running: boolean; connected: boolean; state?: string; linkedPhone?: string | null;
  } | null>(null);
  const [waQR,          setWaQR]          = useState<string | null>(null);
  const [loadingWA,     setLoadingWA]     = useState(false);
  const [loadingQR,     setLoadingQR]     = useState(false);
  const [startingWA,    setStartingWA]    = useState(false);
  const [restartingWA,  setRestartingWA]  = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const socket = io(window.location.origin, { auth: { token: localStorage.getItem('retal_auth_token') } });
    socket.on(`wa-status-${user.uid}`, (s: any) => {
      setWaStatus(prev => ({ ...prev, running: s.running, connected: s.connected, state: s.state, linkedPhone: s.linkedPhone }));
      if (s?.qr && typeof s.qr === 'string') {
        setWaQR(s.qr.startsWith('data:') ? s.qr : `data:image/png;base64,${s.qr}`);
      } else if (s?.connected) {
        setWaQR(null);
        toast.success('تم ربط واتساب بنجاح ✅');
      }
    });
    return () => { socket.disconnect(); };
  }, [user?.uid]);

  const startWAService = async () => {
    setStartingWA(true);
    try {
      const d = await whatsappApi.start();
      toast.success(d.message || 'جاري تشغيل الخدمة...');
      setTimeout(checkWAStatus, 5000);
    } catch (err: any) { toast.error(err?.message ?? 'تعذّر تشغيل الخدمة'); }
    finally { setStartingWA(false); }
  };

  const restartWAService = async () => {
    if (!window.confirm('هل أنت متأكد من إعادة تهيئة الجلسة؟ سيؤدي ذلك إلى مسح البيانات الحالية.')) return;
    setRestartingWA(true);
    try {
      const d = await whatsappApi.restart();
      toast.success(d.message || 'تمت إعادة تهيئة الخدمة');
      setWaQR(null);
      setTimeout(checkWAStatus, 5000);
    } catch (err: any) { toast.error(err?.message ?? 'تعذّر إعادة تهيئة الخدمة'); }
    finally { setRestartingWA(false); }
  };

  const checkWAStatus = useCallback(async () => {
    setLoadingWA(true);
    try {
      const s = await whatsappApi.getStatus();
      setWaStatus(s);
      if (s.running && !s.connected) setWaQR(null);
    } catch { setWaStatus({ running: false, connected: false }); }
    finally { setLoadingWA(false); }
  }, []);

  const fetchQR = async () => {
    setLoadingQR(true);
    try {
      const d = await whatsappApi.getQR();
      if (d?.qr && typeof d.qr === 'string') {
        setWaQR(d.qr.startsWith('data:') ? d.qr : `data:image/png;base64,${d.qr}`);
      } else {
        setWaQR(null);
        let attempts = 0;
        const timer = setInterval(async () => {
          attempts++;
          try {
            const res = await whatsappApi.getQR();
            if (res?.qr && typeof res.qr === 'string') {
              setWaQR(res.qr.startsWith('data:') ? res.qr : `data:image/png;base64,${res.qr}`);
              clearInterval(timer);
            }
          } catch {}
          if (attempts >= 10) clearInterval(timer);
        }, 1500);
      }
    } catch (err: any) { toast.error(err?.message ?? 'تعذّر جلب رمز QR'); }
    finally { setLoadingQR(false); }
  };

  // ── WhatsApp Bot (أدمن فقط) ─────────────────────────────────────────────────
  const [botStatus, setBotStatus] = useState<{
    running: boolean; connected: boolean; state?: string; linkedPhone?: string | null; enabled: boolean;
  } | null>(null);
  const [botQR,        setBotQR]        = useState<string | null>(null);
  const [loadingBot,   setLoadingBot]   = useState(false);
  const [loadingBotQR, setLoadingBotQR] = useState(false);
  const [startingBot,  setStartingBot]  = useState(false);
  const [stoppingBot,  setStoppingBot]  = useState(false);
  const [togglingBot,  setTogglingBot]  = useState(false);
  const [botGroup,     setBotGroup]     = useState<{ jid: string; subject: string | null } | null>(null);
  const [groupLink,    setGroupLink]    = useState('');
  const [joiningGroup, setJoiningGroup] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    const socket = io(window.location.origin, { auth: { token: localStorage.getItem('retal_auth_token') } });
    socket.on('wa-status-whatsapp-bot', (s: any) => {
      setBotStatus(prev => ({ ...(prev ?? { enabled: true }), running: s.running, connected: s.connected, state: s.state, linkedPhone: s.linkedPhone }));
      if (s?.qr && typeof s.qr === 'string') {
        setBotQR(s.qr.startsWith('data:') ? s.qr : `data:image/png;base64,${s.qr}`);
      } else if (s?.connected) {
        setBotQR(null);
        toast.success('تم ربط رقم بوت الأوامر بنجاح ✅');
      }
    });
    return () => { socket.disconnect(); };
  }, [user?.role]);

  const checkBotStatus = useCallback(async () => {
    setLoadingBot(true);
    try {
      const s = await whatsappBotApi.getStatus();
      setBotStatus(s);
      if (s.running && !s.connected) setBotQR(null);
      const g = await whatsappBotApi.getGroup();
      setBotGroup(g.group);
    } catch { setBotStatus({ running: false, connected: false, enabled: true }); }
    finally { setLoadingBot(false); }
  }, []);

  const startBotService = async () => {
    setStartingBot(true);
    try {
      await whatsappBotApi.start();
      toast.success('جاري تشغيل جلسة البوت...');
      setTimeout(checkBotStatus, 5000);
    } catch (err: any) { toast.error(err?.message ?? 'تعذّر تشغيل الجلسة'); }
    finally { setStartingBot(false); }
  };

  const stopBotService = async () => {
    if (!window.confirm('هل أنت متأكد من قطع/إعادة تهيئة جلسة البوت؟ سيؤدي ذلك إلى مسح البيانات الحالية.')) return;
    setStoppingBot(true);
    try {
      await whatsappBotApi.stop(true);
      toast.success('تم إعادة تهيئة الجلسة');
      setBotQR(null);
      setTimeout(checkBotStatus, 5000);
    } catch (err: any) { toast.error(err?.message ?? 'تعذّر إعادة التهيئة'); }
    finally { setStoppingBot(false); }
  };

  const fetchBotQR = async () => {
    setLoadingBotQR(true);
    try {
      const d = await whatsappBotApi.getQR();
      if (d?.qr && typeof d.qr === 'string') {
        setBotQR(d.qr.startsWith('data:') ? d.qr : `data:image/png;base64,${d.qr}`);
      } else {
        setBotQR(null);
        let attempts = 0;
        const timer = setInterval(async () => {
          attempts++;
          try {
            const res = await whatsappBotApi.getQR();
            if (res?.qr && typeof res.qr === 'string') {
              setBotQR(res.qr.startsWith('data:') ? res.qr : `data:image/png;base64,${res.qr}`);
              clearInterval(timer);
            }
          } catch {}
          if (attempts >= 10) clearInterval(timer);
        }, 1500);
      }
    } catch (err: any) { toast.error(err?.message ?? 'تعذّر جلب رمز QR'); }
    finally { setLoadingBotQR(false); }
  };

  const toggleBotEnabled = async (enabled: boolean) => {
    setTogglingBot(true);
    try {
      await whatsappBotApi.toggle(enabled);
      setBotStatus(prev => prev ? { ...prev, enabled } : prev);
      toast.success(enabled ? 'تم تفعيل البوت' : 'تم إيقاف تنفيذ أوامر البوت');
    } catch (err: any) { toast.error(err?.message ?? 'تعذّر تغيير الحالة'); }
    finally { setTogglingBot(false); }
  };

  const joinBotGroupHandler = async () => {
    if (!groupLink.trim()) { toast.error('الصق رابط دعوة الجروب أولاً'); return; }
    setJoiningGroup(true);
    try {
      const d = await whatsappBotApi.joinGroup(groupLink.trim());
      setBotGroup(d.group);
      setGroupLink('');
      toast.success(`تم ربط جروب "${d.group.subject}" بنجاح`);
    } catch (err: any) { toast.error(err?.message ?? 'تعذّر الانضمام للجروب'); }
    finally { setJoiningGroup(false); }
  };

  const leaveBotGroupHandler = async () => {
    if (!window.confirm('هل أنت متأكد من فصل الجروب؟ البوت هيبطل يرد على أي حد فيه.')) return;
    setLeavingGroup(true);
    try {
      await whatsappBotApi.leaveGroup();
      setBotGroup(null);
      toast.success('تم فصل الجروب');
    } catch (err: any) { toast.error(err?.message ?? 'تعذّر فصل الجروب'); }
    finally { setLeavingGroup(false); }
  };

  const handleCardClick = (key: string) => {
    if (key === 'whatsapp' && openSection !== 'whatsapp') checkWAStatus();
    if (key === 'whatsappbot' && openSection !== 'whatsappbot') checkBotStatus();
    setOpenSection(prev => prev === key ? null : key);
  };

  // ── WA Templates ──────────────────────────────────────────────────────────
  const [openingMsg,      setOpeningMsg]      = useState('');
  const [closingMsg,      setClosingMsg]      = useState('');
  const [absentMsg,       setAbsentMsg]       = useState('');
  const [outOfScopeMsg,   setOutOfScopeMsg]   = useState('');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingTemplates,  setSavingTemplates]  = useState(false);

  useEffect(() => {
    if (user?.role === 'admin' && openSection === 'templates') loadTemplates();
  }, [openSection, user?.role]);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const d = await settingsApi.getWhatsAppTemplates();
      setOpeningMsg(d.openingMsg); setClosingMsg(d.closingMsg);
      setAbsentMsg(d.absentMsg || ''); setOutOfScopeMsg(d.outOfScopeMsg || '');
    } catch { toast.error('تعذر تحميل القوالب'); }
    finally { setLoadingTemplates(false); }
  };

  const saveTemplates = async () => {
    setSavingTemplates(true);
    try {
      await settingsApi.updateWhatsAppTemplates({ openingMsg, closingMsg, absentMsg, outOfScopeMsg });
      toast.success('تم حفظ القوالب بنجاح');
    } catch { toast.error('تعذر حفظ القوالب'); }
    finally { setSavingTemplates(false); }
  };

  const insertVar = (setter: React.Dispatch<React.SetStateAction<string>>, v: string) =>
    setter(prev => prev + v);

  // ── Work Hours ─────────────────────────────────────────────────────────────
  const [whSettings,      setWhSettings]      = useState<WorkHoursSettings>({ default: DEFAULT_WH_CONFIG, byProject: {} });
  const [whProjects,      setWhProjects]      = useState<Project[]>([]);
  const [whProjectId,     setWhProjectId]     = useState<string | null>(null);
  const [loadingWorkHours, setLoadingWorkHours] = useState(false);
  const [savingWorkHours,  setSavingWorkHours]  = useState(false);

  const currentWH: WorkHoursConfig = whProjectId
    ? (whSettings.byProject[whProjectId] ?? whSettings.default ?? DEFAULT_WH_CONFIG)
    : (whSettings.default ?? DEFAULT_WH_CONFIG);
  const hasCustomOverride = whProjectId ? !!whSettings.byProject[whProjectId] : true;

  const setCurrentWH = (cfg: WorkHoursConfig) => {
    if (whProjectId) setWhSettings(prev => ({ ...prev, byProject: { ...prev.byProject, [whProjectId]: cfg } }));
    else             setWhSettings(prev => ({ ...prev, default: cfg }));
  };

  const removeCustomOverride = () => {
    if (!whProjectId) return;
    setWhSettings(prev => { const { [whProjectId]: _, ...rest } = prev.byProject; return { ...prev, byProject: rest }; });
  };

  useEffect(() => {
    if ((user?.role === 'admin' || user?.role === 'engineer') && openSection === 'workhours') {
      loadWorkHours();
      projectsApi.getAll().then(projects => {
        setWhProjects(projects);
        if (user?.role === 'engineer' && projects.length > 0 && !whProjectId) {
          setWhProjectId(projects[0].id);
        }
      }).catch(() => {});
    }
  }, [openSection, user?.role]);

  const loadWorkHours = async () => {
    setLoadingWorkHours(true);
    try {
      const d = await settingsApi.getWorkHours();
      if (d?.default) setWhSettings(d); else setWhSettings({ default: DEFAULT_WH_CONFIG, byProject: {} });
    } catch { toast.error('تعذر تحميل أوقات الدوام'); }
    finally { setLoadingWorkHours(false); }
  };

  const saveWorkHours = async () => {
    setSavingWorkHours(true);
    try {
      await settingsApi.updateWorkHours(whSettings);
      toast.success('تم حفظ أوقات الدوام بنجاح');
    } catch { toast.error('تعذر حفظ أوقات الدوام'); }
    finally { setSavingWorkHours(false); }
  };

  const fmtTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'ص' : 'م'}`;
  };

  // ── Avatar initials ─────────────────────────────────────────────────────────
  const initials = (user?.displayName ?? user?.email ?? 'U')
    .split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('');

  // ── Sorted sections (selected card moves to front) ──────────────────────────
  const sortedSections = useMemo<SectionMeta[]>(() => {
    const sections: SectionMeta[] = [
      { key: 'profile',   title: 'الملف الشخصي',        desc: 'تعديل اسمك وصورتك الشخصية',          icon: User,          accent: 'blue'   },
      { key: 'security',  title: 'الأمان',               desc: 'تغيير كلمة المرور وإدارة الجلسات',    icon: Lock,          accent: 'amber'  },
      { key: 'notifs',    title: 'التنبيهات',             desc: 'تخصيص تنبيهات الواتساب والتذاكر',     icon: Bell,          accent: 'purple' },
      { key: 'perms',     title: 'الصلاحيات',             desc: 'عرض صلاحيات الوصول الخاصة بك',        icon: Shield,        accent: 'green'  },
      { key: 'whatsapp',  title: 'واتساب تلقائي',         desc: 'ربط واتسابك لإرسال الرسائل أوتوماتيك', icon: MessageSquare, accent: 'green'  },
      ...(user?.role === 'admin' ? [
        { key: 'templates', title: 'قوالب الواتساب',     desc: 'تخصيص الرسائل التلقائية للعملاء',     icon: MessageSquare, accent: 'blue'   },
        { key: 'whatsappbot', title: 'بوت الأوامر',      desc: 'رقم بوت يستقبل أوامر من الموظفين',    icon: Bot,           accent: 'purple' },
      ] as SectionMeta[] : []),
      ...((user?.role === 'admin' || user?.role === 'engineer') ? [
        { key: 'workhours', title: 'أوقات الدوام',       desc: 'فترات العمل والمواعيد لكل مشروع',     icon: Clock,         accent: 'amber'  },
      ] as SectionMeta[] : []),
    ];
    if (!openSection) return sections;
    const idx = sections.findIndex(s => s.key === openSection);
    if (idx === -1) return sections;
    return [sections[idx], ...sections.slice(0, idx), ...sections.slice(idx + 1)];
  }, [openSection, user?.role]);

  // ── Section content ──────────────────────────────────────────────────────────
  const renderContent = (key: string): React.ReactNode => {
    switch (key) {

      // ── Profile ──────────────────────────────────────────────────────────────
      case 'profile': return (
        <div className="space-y-5">
          <div className="flex items-center gap-5">
            <div className="relative group cursor-pointer" onClick={() => photoInputRef.current?.click()}>
              <div className="w-20 h-20 rounded-2xl overflow-hidden bg-blue-500/10 flex items-center justify-center text-2xl font-black text-blue-400 border-2 border-blue-500/20">
                {photoPreview
                  ? <img src={photoPreview} alt="avatar" className="w-full h-full object-cover" onError={() => setPhotoPreview(null)} />
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
              <button type="button" onClick={() => photoInputRef.current?.click()}
                className="text-blue-400 text-xs mt-1 hover:text-blue-300 transition-colors">
                تغيير الصورة
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-bold text-right block">الاسم الكامل</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="الاسم الكامل"
                className="bg-muted/50 border-transparent focus:border-blue-500/30 rounded-xl h-11 text-foreground text-right" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-bold text-right block">رقم الجوال</Label>
              <Input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="+966xxxxxxxxx"
                dir="ltr" className="bg-muted/50 border-transparent focus:border-blue-500/30 rounded-xl h-11 text-foreground text-left" />
            </div>
          </div>
          <div className="flex justify-start">
            <Button onClick={handleSaveProfile} disabled={savingProfile}
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 px-6 gap-2 font-bold">
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ التغييرات
            </Button>
          </div>
        </div>
      );

      // ── Security ─────────────────────────────────────────────────────────────
      case 'security': return (
        <form onSubmit={e => { e.preventDefault(); handleChangePassword(); }} className="space-y-4">
          {[
            { label: 'كلمة المرور الحالية', val: currentPass, set: setCurrentPass, show: showCurrent, setShow: setShowCurrent },
            { label: 'كلمة المرور الجديدة',  val: newPass,     set: setNewPass,     show: showNew,     setShow: setShowNew     },
          ].map(({ label, val, set, show, setShow }) => (
            <div key={label} className="space-y-1.5">
              <Label className="text-muted-foreground text-xs font-bold text-right block">{label}</Label>
              <div className="relative">
                <Input type={show ? 'text' : 'password'} value={val} onChange={e => set(e.target.value)}
                  placeholder="••••••••" dir="ltr"
                  className="bg-muted/50 border-transparent focus:border-amber-500/30 rounded-xl h-11 text-foreground pr-12 text-left" />
                <button type="button" onClick={() => setShow(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs font-bold text-right block">تأكيد كلمة المرور</Label>
            <div className="relative">
              <Input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
                placeholder="••••••••" dir="ltr"
                className={cn('bg-muted/50 border-transparent rounded-xl h-11 text-foreground text-left',
                  confirmPass && newPass && confirmPass === newPass && 'border-emerald-500/50')} />
              {confirmPass && newPass && confirmPass === newPass && (
                <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" />
              )}
            </div>
          </div>
          {newPass.length > 0 && newPass.length < 6 && (
            <p className="text-red-400 text-xs text-right">كلمة المرور يجب أن تكون 6 أحرف على الأقل</p>
          )}
          <div className="flex justify-start">
            <Button type="submit" disabled={savingPass || !currentPass || !newPass || !confirmPass}
              className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl h-11 px-6 gap-2 font-bold">
              {savingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              تغيير كلمة المرور
            </Button>
          </div>
        </form>
      );

      // ── Notifications ────────────────────────────────────────────────────────
      case 'notifs': return (
        <div className="space-y-5">
          {([
            { key: 'newTicket',    label: 'تذكرة جديدة',             sub: 'تنبيه عند إضافة تذكرة لمشروعك' },
            { key: 'ticketClosed', label: 'إغلاق تذكرة',              sub: 'تنبيه عند إقفال أي تذكرة' },
            { key: 'appointment',  label: 'موعد صيانة',               sub: 'تذكير قبل موعد الصيانة' },
            { key: 'whatsapp',     label: 'رسائل الواتساب التلقائية',  sub: 'السماح بالإرسال التلقائي' },
          ] as { key: keyof typeof defaultNotifs; label: string; sub: string }[]).map(({ key: k, label, sub }) => (
            <div key={k} className="flex items-center justify-between gap-4">
              <Toggle checked={notifs[k]} onChange={v => setNotifs(p => ({ ...p, [k]: v }))} />
              <div className="text-right flex-1">
                <p className="text-foreground font-bold text-sm">{label}</p>
                <p className="text-muted-foreground text-xs">{sub}</p>
              </div>
            </div>
          ))}
          <div className="flex justify-start pt-2">
            <Button onClick={handleSaveNotifs} disabled={savingNotifs}
              className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-11 px-6 gap-2 font-bold">
              {savingNotifs ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ التفضيلات
            </Button>
          </div>
          <div className="border-t border-border/40 pt-4 space-y-2">
            <p className="text-foreground font-bold text-sm text-right">إعدادات المتصفح</p>
            <Button onClick={async () => {
              if (!('Notification' in window)) { toast.error('المتصفح لا يدعم الإشعارات'); return; }
              if (Notification.permission === 'denied') { toast.error('الإشعارات محظورة — افتح إعدادات المتصفح'); return; }
              const p = await Notification.requestPermission();
              if (p === 'granted') toast.success('تم تفعيل إشعارات المتصفح 🎉');
              else toast.error('تم رفض صلاحية الإشعارات');
            }} variant="outline" className="w-full rounded-xl h-11 justify-between px-4">
              <Bell className="w-4 h-4 ml-2" />
              <span className="flex-1 text-right text-sm">
                طلب صلاحية إشعارات المتصفح
                {typeof window !== 'undefined' && 'Notification' in window && (
                  <span className={cn('mr-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                    Notification.permission === 'granted' ? 'bg-emerald-500/10 text-emerald-500' :
                    Notification.permission === 'denied'  ? 'bg-red-500/10 text-red-500'        : 'bg-amber-500/10 text-amber-500')}>
                    {Notification.permission === 'granted' ? 'مفعّل' : Notification.permission === 'denied' ? 'محظور' : 'غير محدد'}
                  </span>
                )}
              </span>
            </Button>
            <Button onClick={() => { localStorage.removeItem('retal:onboarding-prompt-disabled'); toast.success('تم إعادة تفعيل شاشة التثبيت'); }}
              variant="outline" className="w-full rounded-xl h-11 justify-between px-4">
              <Download className="w-4 h-4 ml-2" />
              <span className="flex-1 text-right text-sm">إعادة إظهار رسالة التثبيت (PWA)</span>
            </Button>
          </div>
        </div>
      );

      // ── Permissions ──────────────────────────────────────────────────────────
      case 'perms': return (
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-muted/50 rounded-2xl px-5 py-4 border border-border/60">
            <span className="font-bold text-emerald-400 text-sm px-3 py-1 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              {roleLabels[user?.role ?? ''] ?? user?.role ?? '---'}
            </span>
            <span className="text-muted-foreground text-sm font-bold">الدور الوظيفي</span>
          </div>
          {(user?.specialties?.length || user?.specialty) && (
            <div className="flex items-center justify-between bg-muted/50 rounded-2xl px-5 py-4 border border-border/60">
              <div className="flex gap-2 flex-wrap justify-start">
                {(user?.specialties?.length ? user.specialties : [user.specialty!]).map(s => (
                  <span key={s} className="text-xs font-bold px-3 py-1 bg-blue-500/10 text-blue-400 rounded-xl border border-blue-500/20">
                    {specialtyLabels[s] ?? s}
                  </span>
                ))}
              </div>
              <span className="text-muted-foreground text-sm font-bold shrink-0 mr-4">التخصصات</span>
            </div>
          )}
          <div className="flex items-center justify-between bg-muted/50 rounded-2xl px-5 py-4 border border-border/60">
            <span className="font-bold text-blue-300 text-sm">
              {user?.role === 'admin' ? 'جميع المشاريع' : user?.projectIds?.length ? `${user.projectIds.length} مشروع` : 'لا توجد مشاريع'}
            </span>
            <span className="text-muted-foreground text-sm font-bold">المشاريع</span>
          </div>
          {user?.employeeId && (
            <div className="flex items-center justify-between bg-muted/50 rounded-2xl px-5 py-4 border border-border/60">
              <span className="font-mono text-foreground text-sm">{user.employeeId}</span>
              <span className="text-muted-foreground text-sm font-bold">رقم الموظف</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl px-5 py-3 justify-start">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="text-xs font-bold">وصولك مؤمَّن عبر PostgreSQL + JWT</span>
          </div>
        </div>
      );

      // ── WhatsApp ─────────────────────────────────────────────────────────────
      case 'whatsapp': return (
        <div className="space-y-5">
          {loadingWA && <div className="flex items-center justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>}

          {!loadingWA && waStatus && !waStatus.running && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-4 justify-start">
                <WifiOff className="w-5 h-5 text-amber-400 shrink-0" />
                <div className="text-right">
                  <p className="text-amber-400 font-bold text-sm">خدمة الواتساب متوقفة</p>
                  <p className="text-muted-foreground text-xs mt-0.5">يمكنك تشغيل الخدمة مباشرة من هنا</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button onClick={checkWAStatus} variant="outline" className="flex-1 rounded-xl h-10 gap-2 text-sm" disabled={startingWA}>
                  <RefreshCw className="w-4 h-4" />إعادة الفحص
                </Button>
                <Button onClick={startWAService} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 gap-2 text-sm font-bold" disabled={startingWA}>
                  {startingWA ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}تشغيل الخدمة
                </Button>
              </div>
            </div>
          )}

          {!loadingWA && waStatus?.running && waStatus.connected && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-4 justify-start">
                <Wifi className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="text-right">
                  <p className="text-emerald-400 font-bold text-sm">مرتبط ونشط</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {waStatus.linkedPhone ? `مربوط برقم: ${waStatus.linkedPhone}` : 'الرسائل التلقائية تعمل من واتسابك'}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button onClick={checkWAStatus} variant="outline" className="flex-1 rounded-xl h-10 gap-2 text-sm" disabled={restartingWA}>
                  <RefreshCw className="w-4 h-4" />تحديث
                </Button>
                <Button onClick={restartWAService} variant="destructive" className="flex-1 rounded-xl h-10 gap-2 text-sm font-bold" disabled={restartingWA}>
                  {restartingWA ? <Loader2 className="w-4 h-4 animate-spin" /> : <WifiOff className="w-4 h-4" />}قطع / إعادة ضبط
                </Button>
              </div>
            </div>
          )}

          {!loadingWA && waStatus?.running && !waStatus.connected && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl px-5 py-4 justify-start">
                <MessageSquare className="w-5 h-5 text-blue-400 shrink-0" />
                <div className="text-right">
                  <p className="text-blue-400 font-bold text-sm">في انتظار الربط</p>
                  <p className="text-muted-foreground text-xs mt-0.5">امسح رمز QR من واتساب على هاتفك</p>
                </div>
              </div>
              {waQR ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-white p-3 rounded-2xl shadow-lg">
                    <img src={waQR} alt="QR Code" className="w-48 h-48 object-contain" />
                  </div>
                  <p className="text-muted-foreground text-xs text-center">افتح واتساب ← الأجهزة المرتبطة ← ربط جهاز ← امسح الرمز</p>
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
                <Button onClick={checkWAStatus} variant="outline" className="flex-1 rounded-xl h-10 gap-2 text-sm" disabled={loadingQR || restartingWA}>
                  <RefreshCw className="w-4 h-4" />فحص
                </Button>
                <Button onClick={fetchQR} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 gap-2 text-sm font-bold" disabled={loadingQR || restartingWA}>
                  {loadingQR ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                  {waQR ? 'تحديث QR' : 'توليد QR'}
                </Button>
              </div>
              <Button onClick={restartWAService} variant="ghost" className="w-full text-xs text-red-400 hover:bg-red-500/5 rounded-xl h-8" disabled={loadingQR || restartingWA}>
                إعادة تهيئة الجلسة بالكامل
              </Button>
            </div>
          )}
        </div>
      );

      // ── WhatsApp Bot (أدمن فقط) ─────────────────────────────────────────────────
      case 'whatsappbot': return user?.role !== 'admin' ? null : (
        <div className="space-y-5">
          {loadingBot && <div className="flex items-center justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-purple-400" /></div>}

          {/* مفتاح الإيقاف السريع */}
          {!loadingBot && botStatus && (
            <div className="flex items-center justify-between gap-4 bg-muted/30 border border-border rounded-2xl px-5 py-3">
              <Toggle checked={botStatus.enabled} onChange={v => toggleBotEnabled(v)} />
              <div className="text-right flex-1">
                <p className="text-foreground font-bold text-sm">تفعيل تنفيذ الأوامر</p>
                <p className="text-muted-foreground text-xs">
                  {togglingBot ? 'جاري التحديث...' : botStatus.enabled ? 'البوت بينفذ الأوامر الآن' : 'البوت متصل بس مش بينفذ أي أمر'}
                </p>
              </div>
            </div>
          )}

          {!loadingBot && botStatus && !botStatus.running && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-4 justify-start">
                <WifiOff className="w-5 h-5 text-amber-400 shrink-0" />
                <div className="text-right">
                  <p className="text-amber-400 font-bold text-sm">جلسة البوت متوقفة</p>
                  <p className="text-muted-foreground text-xs mt-0.5">شغّل الجلسة عشان تربط رقم البوت</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button onClick={checkBotStatus} variant="outline" className="flex-1 rounded-xl h-10 gap-2 text-sm" disabled={startingBot}>
                  <RefreshCw className="w-4 h-4" />إعادة الفحص
                </Button>
                <Button onClick={startBotService} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-10 gap-2 text-sm font-bold" disabled={startingBot}>
                  {startingBot ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}تشغيل الجلسة
                </Button>
              </div>
            </div>
          )}

          {!loadingBot && botStatus?.running && botStatus.connected && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-4 justify-start">
                <Wifi className="w-5 h-5 text-emerald-400 shrink-0" />
                <div className="text-right">
                  <p className="text-emerald-400 font-bold text-sm">رقم البوت مرتبط</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {botStatus.linkedPhone ? `مربوط برقم: ${botStatus.linkedPhone}` : 'الجلسة نشطة'}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Button onClick={checkBotStatus} variant="outline" className="flex-1 rounded-xl h-10 gap-2 text-sm" disabled={stoppingBot}>
                  <RefreshCw className="w-4 h-4" />تحديث
                </Button>
                <Button onClick={stopBotService} variant="destructive" className="flex-1 rounded-xl h-10 gap-2 text-sm font-bold" disabled={stoppingBot}>
                  {stoppingBot ? <Loader2 className="w-4 h-4 animate-spin" /> : <WifiOff className="w-4 h-4" />}قطع / إعادة ضبط
                </Button>
              </div>
            </div>
          )}

          {!loadingBot && botStatus?.running && !botStatus.connected && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/20 rounded-2xl px-5 py-4 justify-start">
                <Bot className="w-5 h-5 text-blue-400 shrink-0" />
                <div className="text-right">
                  <p className="text-blue-400 font-bold text-sm">في انتظار ربط رقم البوت</p>
                  <p className="text-muted-foreground text-xs mt-0.5">امسح رمز QR من واتساب الرقم المخصص للبوت</p>
                </div>
              </div>
              {botQR ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-white p-3 rounded-2xl shadow-lg">
                    <img src={botQR} alt="QR Code" className="w-48 h-48 object-contain" />
                  </div>
                  <p className="text-muted-foreground text-xs text-center">افتح واتساب على رقم البوت ← الأجهزة المرتبطة ← ربط جهاز ← امسح الرمز</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className="w-48 h-48 bg-muted/60 rounded-2xl border border-border flex items-center justify-center">
                    <Bot className="w-12 h-12 text-muted-foreground/40" />
                  </div>
                  <p className="text-muted-foreground text-xs text-center">اضغط الزر لتوليد رمز QR</p>
                </div>
              )}
              <div className="flex gap-3">
                <Button onClick={checkBotStatus} variant="outline" className="flex-1 rounded-xl h-10 gap-2 text-sm" disabled={loadingBotQR || stoppingBot}>
                  <RefreshCw className="w-4 h-4" />فحص
                </Button>
                <Button onClick={fetchBotQR} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-10 gap-2 text-sm font-bold" disabled={loadingBotQR || stoppingBot}>
                  {loadingBotQR ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                  {botQR ? 'تحديث QR' : 'توليد QR'}
                </Button>
              </div>
              <Button onClick={stopBotService} variant="ghost" className="w-full text-xs text-red-400 hover:bg-red-500/5 rounded-xl h-8" disabled={loadingBotQR || stoppingBot}>
                إعادة تهيئة الجلسة بالكامل
              </Button>
            </div>
          )}

          {/* ربط الجروب — اختياري، البوت شغال على الـ DM دايماً */}
          {!loadingBot && botStatus?.connected && (
            <div className="space-y-3 border-t border-border/40 pt-5">
              <div className="text-right">
                <p className="text-foreground font-bold text-sm flex items-center gap-2 justify-end">
                  جروب الأوامر (اختياري) <Link2 className="w-4 h-4 text-muted-foreground" />
                </p>
                <p className="text-muted-foreground text-xs mt-0.5">البوت بيستقبل أوامر من الرسائل الخاصة دايماً — لو عايز يستقبلها من جروب معين كمان، اربطه هنا</p>
              </div>

              {botGroup ? (
                <div className="flex items-center justify-between gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-3">
                  <Button onClick={leaveBotGroupHandler} variant="ghost" size="sm" className="text-red-400 hover:bg-red-500/10 rounded-xl h-8 gap-1.5 text-xs" disabled={leavingGroup}>
                    {leavingGroup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    فصل
                  </Button>
                  <div className="text-right">
                    <p className="text-emerald-400 font-bold text-sm">{botGroup.subject || 'جروب مرتبط'}</p>
                    <p className="text-muted-foreground text-[10px] mt-0.5">مربوط ويستقبل أوامر</p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button onClick={joinBotGroupHandler} disabled={joiningGroup} className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-10 px-4 gap-2 text-sm font-bold shrink-0">
                    {joiningGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    ربط
                  </Button>
                  <Input
                    value={groupLink}
                    onChange={e => setGroupLink(e.target.value)}
                    placeholder="https://chat.whatsapp.com/xxxxxxxx"
                    className="flex-1 rounded-xl h-10 text-sm text-right"
                    dir="ltr"
                  />
                </div>
              )}
            </div>
          )}

          {/* رابط لسجل الأوامر */}
          {!loadingBot && botStatus?.connected && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs justify-end border-t border-border/40 pt-4">
              <span>سجل الأوامر متاح عبر GET /api/whatsapp-bot/logs</span>
              <ScrollText className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
      );

      // ── WA Templates ─────────────────────────────────────────────────────────
      case 'templates': return user?.role !== 'admin' ? null : (
        <div className="space-y-6">
          {loadingTemplates ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-blue-400" /></div>
          ) : (
            <>
              <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 space-y-2">
                <p className="text-sm font-bold text-blue-400 text-right">متغيرات متاحة (اضغط للإدراج):</p>
                <div className="flex flex-wrap gap-2 justify-start">
                  {[
                    { label: 'اسم العميل', val: '{clientName}' },
                    { label: 'رقم التذكرة', val: '{ticketId}' },
                    { label: 'الوصف', val: '{description}' },
                    { label: 'رقم الفيلا', val: '{villaNumber}' },
                    { label: 'ملاحظات الإغلاق', val: '{closureNotes}' },
                    { label: 'التاريخ', val: '{date}' },
                  ].map(v => (
                    <button key={v.val} onClick={() => insertVar(setOpeningMsg, v.val)}
                      className="text-xs font-mono bg-card border border-border px-2 py-1 rounded-lg hover:bg-blue-500/10 transition-colors">
                      {v.label} <span className="text-muted-foreground">{v.val}</span>
                    </button>
                  ))}
                </div>
              </div>
              {[
                { label: 'رسالة الموعد (تنسيق الصيانة)',  val: openingMsg,    set: setOpeningMsg,    color: null  },
                { label: 'رسالة إغلاق التذكرة (عادي)',    val: closingMsg,    set: setClosingMsg,    color: null  },
                { label: 'رسالة عدم التواجد',              val: absentMsg,     set: setAbsentMsg,     color: 'amber', badge: 'حالة: مغلقة', placeholder: 'رسالة تُرسل للعميل عند عدم تواجده...' },
                { label: 'رسالة خارج الاختصاص',           val: outOfScopeMsg, set: setOutOfScopeMsg, color: 'red',   badge: 'حالة: خارج النطاق', placeholder: 'رسالة عند المشكلة خارج نطاق الضمان...' },
              ].map(({ label, val, set, color, badge, placeholder }) => (
                <div key={label} className="space-y-2">
                  <div className="flex items-center gap-2 justify-end">
                    <Label className={cn('text-xs font-bold', color ? `text-${color}-400` : 'text-muted-foreground')}>{label}</Label>
                    {badge && color && (
                      <span className={`text-[10px] bg-${color}-500/10 text-${color}-400 border border-${color}-500/20 px-2 py-0.5 rounded-full`}>{badge}</span>
                    )}
                  </div>
                  <Textarea value={val} onChange={e => set(e.target.value)}
                    className="min-h-[100px] text-right bg-background/70" dir="rtl" placeholder={placeholder} />
                </div>
              ))}
              <div className="flex justify-start pt-2">
                <Button onClick={saveTemplates} disabled={savingTemplates}
                  className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-11 px-6 font-bold gap-2">
                  {savingTemplates ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  حفظ القوالب
                </Button>
              </div>
            </>
          )}
        </div>
      );

      // ── Work Hours ────────────────────────────────────────────────────────────
      case 'workhours': return (user?.role !== 'admin' && user?.role !== 'engineer') ? null : (
        <div className="space-y-5">
          {loadingWorkHours ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-amber-400" /></div>
          ) : (
            <>
              <div className="flex gap-2 flex-wrap" dir="rtl">
                {user?.role === 'admin' && (
                  <button onClick={() => setWhProjectId(null)}
                    className={cn('px-4 py-1.5 rounded-full text-xs font-bold transition-colors border',
                      whProjectId === null ? 'bg-amber-500 text-white border-amber-500' : 'border-border text-muted-foreground hover:border-amber-500/50 hover:text-amber-400')}>
                    الإعداد الافتراضي
                  </button>
                )}
                {whProjects.map(p => (
                  <button key={p.id} onClick={() => setWhProjectId(p.id)}
                    className={cn('px-4 py-1.5 rounded-full text-xs font-bold transition-colors border relative',
                      whProjectId === p.id ? 'bg-amber-500 text-white border-amber-500' : 'border-border text-muted-foreground hover:border-amber-500/50 hover:text-amber-400')}>
                    {p.name}
                    {whSettings.byProject[p.id] && <span className="absolute -top-1 -right-1 w-2 h-2 bg-emerald-400 rounded-full" />}
                  </button>
                ))}
              </div>

              {whProjectId && (
                <div className="flex items-center justify-between bg-muted/40 border border-border/50 rounded-2xl px-4 py-3">
                  <Toggle checked={hasCustomOverride} onChange={v => v ? setCurrentWH({ ...DEFAULT_WH_CONFIG }) : removeCustomOverride()} />
                  <div className="text-right">
                    <p className="text-foreground font-bold text-sm">إعداد مخصص لهذا المشروع</p>
                    <p className="text-muted-foreground text-xs mt-0.5">{hasCustomOverride ? 'يستخدم إعداداته الخاصة' : 'يرث الإعداد الافتراضي'}</p>
                  </div>
                </div>
              )}

              <div className={cn('space-y-4', whProjectId && !hasCustomOverride && 'opacity-40 pointer-events-none')}>
                <div className="flex items-center justify-between bg-amber-500/5 border border-amber-500/15 rounded-2xl px-5 py-4">
                  <Toggle checked={currentWH.enabled} onChange={v => setCurrentWH({ ...currentWH, enabled: v })} />
                  <div className="text-right">
                    <p className="text-foreground font-bold text-sm">تفعيل قيود المواعيد</p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      {currentWH.enabled ? 'المواعيد خارج الدوام تُرفض أو تُصحَّح تلقائياً' : 'لا قيود على وقت المواعيد'}
                    </p>
                  </div>
                </div>

                <div className={cn('space-y-4 transition-opacity', !currentWH.enabled && 'opacity-40 pointer-events-none')}>
                  <div className="relative h-10 rounded-xl bg-muted/50 overflow-hidden border border-border/40 flex items-center" dir="ltr">
                    {(() => {
                      const total = 24 * 60;
                      const p = (t: string) => t ? t.split(':').map(Number).reduce((h,m)=>h*60+m,0) : 0;
                      const hasM = currentWH.hasMorning !== false;
                      const hasB = currentWH.hasBreak !== false;
                      const hasA = currentWH.hasAfternoon !== false;
                      const ms = p(currentWH.morning?.start || '08:00'), me = p(currentWH.morning?.end || '12:00');
                      const bs = p(currentWH.break?.start || '12:00'),   be = p(currentWH.break?.end || '13:00');
                      const as2 = p(currentWH.afternoon?.start || '13:00'), ae = p(currentWH.afternoon?.end || '16:00');
                      return (<>
                        {hasM && <div className="absolute inset-y-0 bg-amber-500/30 border-r border-amber-500/50" style={{ left: `${ms/total*100}%`, width: `${(me-ms)/total*100}%` }} />}
                        {hasB && <div className="absolute inset-y-0 bg-red-500/20 border-x border-red-500/30" style={{ left: `${bs/total*100}%`, width: `${(be-bs)/total*100}%` }} />}
                        {hasA && <div className="absolute inset-y-0 bg-amber-500/30 border-l border-amber-500/50" style={{ left: `${as2/total*100}%`, width: `${(ae-as2)/total*100}%` }} />}
                        <div className="absolute inset-0 flex items-center justify-around px-2 pointer-events-none">
                          {[0,3,6,9,12,15,18,21].map(h => <span key={h} className="text-[9px] text-muted-foreground/50 font-mono">{h}</span>)}
                        </div>
                      </>);
                    })()}
                  </div>

                  {[
                    { label: 'الفترة الصباحية', field: 'morning' as const, toggleField: 'hasMorning' as const, enabled: currentWH.hasMorning !== false, color: 'amber' },
                    { label: 'فترة الراحة (البريك)', field: 'break' as const, toggleField: 'hasBreak' as const, enabled: currentWH.hasBreak !== false, color: 'red' },
                    { label: 'الفترة المسائية', field: 'afternoon' as const, toggleField: 'hasAfternoon' as const, enabled: currentWH.hasAfternoon !== false, color: 'amber' },
                  ].map(({ label, field, toggleField, enabled, color }) => (
                    <div key={field} className={cn("bg-card border rounded-2xl p-4 space-y-3 transition-all", enabled ? "border-border/60" : "border-border/30 opacity-60")}>
                      <div className="flex items-center justify-between">
                        <Toggle
                          checked={enabled}
                          onChange={v => setCurrentWH({ ...currentWH, [toggleField]: v })}
                        />
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-foreground">{label}</p>
                          <span className={cn(
                            "w-3 h-3 rounded-full",
                            color === 'red' ? (enabled ? "bg-red-400/60" : "bg-muted") : (enabled ? "bg-amber-500/70" : "bg-muted")
                          )} />
                        </div>
                      </div>
                      {enabled && (
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          {(['end', 'start'] as const).map(side => (
                            <div key={side} className="space-y-1">
                              <label className="text-muted-foreground text-[10px] font-bold text-right block uppercase tracking-widest">{side === 'end' ? 'إلى' : 'من'}</label>
                              <input type="time" value={currentWH[field]?.[side] || ''}
                                onChange={e => setCurrentWH({ ...currentWH, [field]: { ...(currentWH[field] || {}), [side]: e.target.value } })}
                                className={`w-full bg-muted/50 border border-border rounded-xl h-10 px-3 text-foreground text-center focus:outline-none focus:border-${color}-500/50 font-mono text-sm`} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-3 text-right space-y-1" dir="rtl">
                    <div className="flex items-center gap-2 justify-end mb-1">
                      <p className="text-amber-400 text-xs font-bold">ملخص أوقات الدوام</p>
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    {currentWH.hasMorning !== false && <p className="text-foreground text-sm">🌅 الصباح: {fmtTime(currentWH.morning?.start || '08:00')} — {fmtTime(currentWH.morning?.end || '12:00')}</p>}
                    {currentWH.hasBreak !== false && <p className="text-muted-foreground text-xs">☕ الراحة: {fmtTime(currentWH.break?.start || '12:00')} — {fmtTime(currentWH.break?.end || '13:00')}</p>}
                    {currentWH.hasAfternoon !== false && <p className="text-foreground text-sm">🌆 المساء: {fmtTime(currentWH.afternoon?.start || '13:00')} — {fmtTime(currentWH.afternoon?.end || '16:00')}</p>}
                    {currentWH.hasMorning === false && currentWH.hasAfternoon === false && (
                      <p className="text-muted-foreground text-xs">لا توجد فترات عمل محددة (متاح وقت مخصص فقط)</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-start pt-1">
                <Button onClick={saveWorkHours} disabled={savingWorkHours}
                  className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl h-11 px-6 font-bold gap-2">
                  {savingWorkHours ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  حفظ جميع الإعدادات
                </Button>
              </div>
            </>
          )}
        </div>
      );

      default: return null;
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="page-in">

        {/* Two-column layout on xl+: side panel RIGHT, cards LEFT */}
        <div className="flex gap-6 items-start">

          {/* ── RIGHT side panel (RTL: first = right, sticky near sidebar) ── */}
          <div className="hidden xl:flex flex-col gap-4 w-72 shrink-0 sticky top-6">

            {/* User profile card */}
            <div className="rounded-3xl border border-border bg-card overflow-hidden shadow-sm">
              {/* Header gradient banner */}
              <div className="h-20 bg-gradient-to-br from-primary/20 via-blue-500/10 to-transparent relative">
                <div className="absolute inset-0 bg-gradient-to-tl from-purple-500/10 to-transparent" />
                {/* Avatar */}
                <div className="absolute bottom-0 right-5 translate-y-1/2">
                  <div className="w-16 h-16 rounded-2xl border-4 border-card overflow-hidden bg-muted shadow-lg">
                    {user?.photoURL
                      ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                      : <div className="w-full h-full flex items-center justify-center text-2xl font-extrabold text-primary">
                          {user?.displayName?.slice(0,1) ?? '?'}
                        </div>
                    }
                  </div>
                </div>
              </div>
              {/* Info */}
              <div className="pt-12 px-5 pb-5 text-right">
                <h3 className="font-extrabold text-foreground text-base leading-tight">{user?.displayName}</h3>
                <p className="text-muted-foreground text-xs mt-0.5 truncate">{user?.email}</p>
                <div className="flex items-center justify-end gap-2 mt-3">
                  <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                    {roleLabels[user?.role ?? ''] ?? user?.role}
                  </span>
                  {user?.specialty && (
                    <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-muted text-muted-foreground">
                      {specialtyLabels[user.specialty] ?? user.specialty}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick section nav */}
            <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
              <p className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-[0.18em] mb-3 text-right">
                الأقسام
              </p>
              <div className="space-y-0.5">
                {sortedSections.map(sec => {
                  const isOpen = openSection === sec.key;
                  const a = ACCENT[sec.accent] ?? ACCENT.blue;
                  return (
                    <button
                      key={sec.key}
                      onClick={() => handleCardClick(sec.key)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm transition-all duration-200 text-right',
                        isOpen
                          ? cn('font-bold', a.iconBg, a.iconText)
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 font-medium'
                      )}
                    >
                      <sec.icon className={cn('w-4 h-4 shrink-0', isOpen ? a.iconText : '')} />
                      <span className="flex-1 text-right">{sec.title}</span>
                      {isOpen && <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', a.dotColor)} />}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>

          {/* ── LEFT main content ── */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* Page header */}
            <div className="text-right">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">الإعدادات</h1>
              <p className="text-muted-foreground mt-1 text-sm">تخصيص حسابك وتفضيلات النظام</p>
            </div>

        {/* ── Animated card grid ───────────────────────────────────────────── */}
        <LayoutGroup id="settings">
          <div className="grid grid-cols-2 gap-4">
            {sortedSections.map(sec => {
              const isOpen = openSection === sec.key;
              const a = ACCENT[sec.accent] ?? ACCENT.blue;

              return (
                <motion.div
                  key={sec.key}
                  layoutId={sec.key}
                  layout
                  transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
                  className={cn(
                    'rounded-3xl overflow-hidden border bg-card',
                    isOpen
                      ? cn('col-span-2 shadow-2xl', a.border, a.shadow)
                      : 'border-border cursor-pointer',
                  )}
                  animate={{
                    scale:   openSection && !isOpen ? 0.97 : 1,
                    opacity: openSection && !isOpen ? 0.6  : 1,
                  }}
                  whileHover={!isOpen ? { scale: openSection ? 0.97 : 1.015, transition: { duration: 0.15 } } : undefined}
                  whileTap={!isOpen ? { scale: 0.98 } : undefined}
                  onClick={() => !isOpen && handleCardClick(sec.key)}
                >
                  {/* ── Card header ──────────────────────────────────────── */}
                  <motion.div
                    layout
                    className={cn(
                      'flex items-center gap-4 p-5',
                      isOpen && cn('bg-gradient-to-bl to-transparent', a.headerGrad),
                    )}
                  >
                    {/* Icon */}
                    <motion.div
                      layout
                      className={cn(
                        'rounded-2xl flex items-center justify-center shrink-0 transition-all duration-300',
                        a.iconBg, a.iconText,
                        isOpen ? 'w-14 h-14' : 'w-12 h-12',
                      )}
                    >
                      <sec.icon className={cn('transition-all duration-300', isOpen ? 'w-7 h-7' : 'w-5 h-5')} />
                    </motion.div>

                    {/* Text */}
                    <motion.div layout className="text-right flex-1 min-w-0">
                      <motion.p
                        layout
                        className={cn('font-bold text-foreground transition-all duration-300', isOpen ? 'text-xl' : 'text-base')}
                      >
                        {sec.title}
                      </motion.p>
                      <p className="text-muted-foreground text-xs mt-0.5 truncate">{sec.desc}</p>
                    </motion.div>

                    {/* Action indicator */}
                    <AnimatePresence mode="wait" initial={false}>
                      {isOpen ? (
                        <motion.button
                          key="close"
                          layout
                          initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                          animate={{ opacity: 1, scale: 1, rotate: 0 }}
                          exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
                          transition={{ duration: 0.2, ease: 'easeOut' }}
                          onClick={e => { e.stopPropagation(); setOpenSection(null); }}
                          className="w-9 h-9 rounded-xl bg-muted/60 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </motion.button>
                      ) : (
                        <motion.div
                          key="plus"
                          layout
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          transition={{ duration: 0.15 }}
                          className={cn('w-7 h-7 rounded-xl flex items-center justify-center shrink-0', a.iconBg)}
                        >
                          <span className={cn('text-sm font-bold leading-none', a.iconText)}>+</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  {/* ── Expanded content ─────────────────────────────────── */}
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        key={`content-${sec.key}`}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                        className="overflow-hidden"
                      >
                        <motion.div
                          initial={{ y: 12, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.1, duration: 0.3, ease: 'easeOut' }}
                          className="px-6 pb-6 pt-3 border-t border-border/40"
                        >
                          {renderContent(sec.key)}
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </LayoutGroup>

        {/* ── Logout ──────────────────────────────────────────────────────── */}
        <motion.div
          layout
          className="bg-red-500/5 border border-red-500/10 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4"
        >
          <div className="text-right">
            <h3 className="text-red-400 font-bold text-lg">تسجيل الخروج</h3>
            <p className="text-muted-foreground text-sm mt-0.5">سيتم الخروج من الجلسة الحالية على هذا المتصفح.</p>
          </div>
          <Button variant="destructive" className="rounded-2xl h-12 px-8 font-black gap-3 w-full sm:w-auto shrink-0" onClick={logout}>
            <LogOut className="w-5 h-5" />
            خروج من الحساب
          </Button>
        </motion.div>

        <p className="text-center text-muted-foreground/70 text-[10px] font-bold uppercase tracking-[0.3em] pb-4">
          Retal Maintenance System Build 2026.4.17
        </p>

          </div>{/* end LEFT main content */}
        </div>{/* end two-column flex */}
      </div>
    </Layout>
  );
}
