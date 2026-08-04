import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Ticket, Users, Settings, LogOut, Bell,
  Briefcase, UserCheck, HardHat, CalendarClock, ClipboardList,
  CheckCheck, Moon, Sun, Settings2, BarChart3, X, CloudLightning, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useTheme } from 'next-themes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications, AppNotification } from '@/hooks/useNotifications';
import { toast } from 'sonner';

/* ── nav items ─────────────────────────────────────────────────── */
const allNavItems = [
  { icon: LayoutDashboard, label: 'لوحة التحكم', path: '/',              roles: ['admin', 'engineer', 'supervisor'] },
  { icon: Briefcase,       label: 'المشاريع',    path: '/projects',      roles: ['admin', 'engineer', 'supervisor'] },
  { icon: UserCheck,       label: 'العملاء',     path: '/clients',       roles: ['admin', 'engineer', 'supervisor'] },
  { icon: ShieldCheck,     label: 'الضمانات',    path: '/warranties',    roles: ['admin', 'engineer', 'supervisor'] },
  { icon: Ticket,          label: 'التذاكر',     path: '/tickets',       roles: ['admin', 'engineer', 'supervisor'] },
  { icon: HardHat,         label: 'المقاولون',   path: '/contractors',   roles: ['admin', 'engineer', 'supervisor'] },
  { icon: CalendarClock,   label: 'المواعيد',    path: '/appointments',  roles: ['admin', 'supervisor', 'engineer'] },
  { icon: BarChart3,       label: 'التقارير',    path: '/reports',       roles: ['admin', 'engineer'] },
  { icon: HardHat,         label: 'الفنيين',     path: '/technicians',   roles: ['admin', 'supervisor'] },
  { icon: Users,           label: 'الفريق',      path: '/team',          roles: ['admin', 'engineer'] },
  { icon: Settings2,       label: 'أنواع التذاكر', path: '/ticket-types', roles: ['admin'] },

  { icon: Settings,        label: 'الإعدادات',   path: '/settings',      roles: ['admin', 'engineer', 'supervisor'] },
];

/* nav group structure for sidebar */
const NAV_GROUPS = [
  { label: null,        paths: ['/', '/projects', '/clients', '/warranties', '/tickets'] },
  { label: 'العمليات', paths: ['/contractors', '/appointments', '/reports'] },
  { label: 'الفريق',   paths: ['/technicians', '/team', '/ticket-types'] },
  { label: 'النظام',   paths: ['/settings'] },
];

const roleLabel: Record<string, string> = {
  admin: 'مدير النظام',
  engineer: 'مهندس',
  supervisor: 'مشرف',
};

export function Navbar() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user, logout } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications(user?.uid ?? null);
  const isLight = resolvedTheme === 'light';

  const toggleTheme = () => setTheme(isLight ? 'dark' : 'light');

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const filteredNav = allNavItems.filter(item => user && item.roles.includes(user.role));

  /* mobile bottom bar — 4 items */
  const bottomItems = (() => {
    const picks: typeof filteredNav = [];
    const push = (path: string) => {
      const it = filteredNav.find(i => i.path === path);
      if (it) picks.push(it);
    };
    push('/');
    push('/tickets');
    if (user?.role === 'engineer') push('/clients');
    else push('/projects');
    push('/appointments');
    return picks.slice(0, 4);
  })();

  const secondaryItems = filteredNav.filter(i => !bottomItems.some(b => b.path === i.path));

  const [moreOpen, setMoreOpen] = useState(false);

  const initials = user?.displayName
    ?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '??';

  const formatAgo = (ts: any) => {
    if (!ts) return '';
    try {
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      const h = Math.floor((Date.now() - d.getTime()) / 3600000);
      if (h < 1) return 'الآن';
      if (h < 24) return `${h}س`;
      return `${Math.floor(h / 24)}ي`;
    } catch { return ''; }
  };

  const handleNotifClick = async (n: AppNotification) => {
    if (!n.read) await markRead(n.id);
    if (n.ticketDocId) navigate(`/tickets/${n.ticketDocId}`);
  };

  /* ── Notification Dropdown ─────────────────────────────────── */
  const NotifBell = ({ side = 'left' }: { side?: 'left' | 'right' | 'top' | 'bottom' }) => (
    <DropdownMenu onOpenChange={open => { if (open) markAllRead(); }}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl h-9 w-9"
          />
        }
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[14px] h-3.5 bg-red-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side={side as any}
        sideOffset={10}
        align="end"
        className="!w-80 !min-w-0 bg-popover border-border rounded-2xl shadow-2xl shadow-black/20 overflow-hidden p-0"
      >
        <div className="p-4 border-b border-border flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground font-medium">
            {unreadCount > 0 ? `${unreadCount} غير مقروء` : 'كل شيء مقروء'}
          </span>
          <span className="text-sm font-bold text-foreground">الإشعارات</span>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              <Bell className="w-7 h-7 mx-auto mb-2 opacity-20" />
              لا توجد إشعارات بعد
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                onClick={() => handleNotifClick(n)}
                className={cn(
                  'px-4 py-3 border-b border-border/40 cursor-pointer hover:bg-muted/50 flex gap-3 items-start transition-colors',
                  !n.read && 'bg-primary/5'
                )}
              >
                <div className={cn(
                  'mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
                  n.type === 'appointment_reminder'
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-primary/10 text-primary'
                )}>
                  {n.type === 'appointment_reminder'
                    ? <CalendarClock className="w-4 h-4" />
                    : <ClipboardList className="w-4 h-4" />}
                </div>
                <div className="flex-1 text-right min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[10px] text-muted-foreground">{formatAgo(n.createdAt)}</span>
                    <p className="text-[13px] font-semibold text-foreground leading-tight truncate">{n.title}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{n.body}</p>
                </div>
                {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-2" />}
              </div>
            ))
          )}
        </div>

        {notifications.length > 0 && (
          <div className="p-3 border-t border-border">
            <button
              onClick={markAllRead}
              className="w-full text-[11px] text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 transition-colors py-1"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              تحديد الكل كمقروء
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      {/* ═══════════════ MOBILE TOP BAR ═══════════════ */}
      <header className="print:hidden lg:hidden fixed top-0 inset-x-0 z-50 h-14 bg-card/85 backdrop-blur-2xl border-b border-border/60 px-3 flex items-center gap-2">

        {/* Right: User avatar → opens more sheet */}
        <button
          onClick={() => setMoreOpen(true)}
          className="shrink-0 relative"
        >
          <div className={cn(
            'w-8 h-8 rounded-full border-2 overflow-hidden flex items-center justify-center text-[10px] font-bold',
            'bg-primary/10 border-primary/25 text-primary'
          )}>
            {user?.photoURL
              ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
              : <span>{initials}</span>
            }
          </div>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -left-0.5 w-3 h-3 bg-red-500 rounded-full border-2 border-card" />
          )}
        </button>

        {/* Center: Logo */}
        <Link to="/" className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/15 flex items-center justify-center p-1 shrink-0">
            <img src="/icon.png" alt="Tickets" className="w-full h-full object-contain rounded-lg" onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
          </div>
          <div className="min-w-0 leading-none">
            <span className="font-extrabold text-sm text-foreground tracking-tight block">Tickets</span>
            <span className="text-[9px] text-muted-foreground font-medium block">نظام إدارة الصيانة</span>
          </div>
        </Link>

        {/* Left: Theme + Bell */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl h-9 w-9"
          >
            {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </Button>
          <NotifBell side="bottom" />
        </div>
      </header>

      {/* ═══════════════ MOBILE BOTTOM NAV — floating pill ═══════════════ */}
      <nav className="print:hidden lg:hidden fixed bottom-4 inset-x-0 z-50 px-4 pointer-events-none">
        <div className="pointer-events-auto mx-auto max-w-sm bg-card/95 backdrop-blur-xl border border-border/60 rounded-[28px] shadow-xl shadow-black/20 flex items-center h-[58px] px-2 gap-1">
          {bottomItems.map(item => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-all duration-200 py-2"
              >
                <div className={cn(
                  'w-10 h-8 rounded-2xl flex items-center justify-center transition-all duration-200',
                  active ? 'bg-primary/15' : 'hover:bg-muted/60'
                )}>
                  <item.icon
                    className={cn('w-[18px] h-[18px] transition-all', active ? 'text-primary scale-110' : 'text-muted-foreground')}
                    strokeWidth={active ? 2.5 : 1.75}
                  />
                </div>
                <span className={cn(
                  'text-[9px] font-bold leading-none',
                  active ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* Divider */}
          <div className="w-px h-8 bg-border/60 mx-1" />

          {/* More / Profile */}
          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-2 px-2 outline-none"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-[10px] font-bold shrink-0 overflow-hidden">
              {user?.photoURL
                ? <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                : <span>{initials}</span>
              }
            </div>
            <span className="text-[9px] font-bold text-muted-foreground leading-none">أنا</span>
          </button>
        </div>
      </nav>

      {/* ═══════════════ MOBILE MORE SHEET ═══════════════ */}
      {moreOpen && (
        <div className="print:hidden lg:hidden fixed inset-0 z-[200] flex flex-col justify-end" dir="rtl">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          {/* Sheet */}
          <div className="relative bg-card rounded-t-3xl border-t border-border pb-safe max-h-[80vh] flex flex-col overflow-hidden">
            {/* Handle + Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border shrink-0">
              <button
                onClick={() => setMoreOpen(false)}
                className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground">{user?.displayName}</p>
                <p className="text-[10px] text-muted-foreground">{roleLabel[user?.role ?? ''] ?? user?.role}</p>
              </div>
              <Avatar className="w-9 h-9 shrink-0 ring-1 ring-border">
                <AvatarImage src={user?.photoURL} />
                <AvatarFallback className="bg-muted text-muted-foreground text-xs font-bold">{initials}</AvatarFallback>
              </Avatar>
            </div>

            {/* Nav items */}
            <div className="overflow-y-auto flex-1 p-3 space-y-0.5">
              {secondaryItems.map(item => {
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); setMoreOpen(false); }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all text-right',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <item.icon className={cn('w-5 h-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Logout */}
            <div className="p-3 border-t border-border shrink-0">
              <button
                onClick={() => { logout(); setMoreOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium text-red-500 hover:bg-red-500/10 transition-all text-right"
              >
                <LogOut className="w-5 h-5 shrink-0" />
                تسجيل الخروج
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ DESKTOP SIDEBAR ═══════════════ */}
      <aside className="print:hidden hidden lg:flex fixed right-0 top-0 h-full w-60 flex-col z-40 bg-card border-l border-border/50">

        {/* Subtle top color wash */}
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-primary/6 to-transparent pointer-events-none" />

        {/* Logo */}
        <div className="relative px-4 pt-5 pb-4 shrink-0">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/15 flex items-center justify-center p-1.5 shrink-0 shadow-md shadow-primary/10 transition-shadow group-hover:shadow-primary/20">
              <img
                src="/icon.png"
                alt="Tickets"
                className="w-full h-full object-contain rounded-xl"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="font-extrabold text-sm text-foreground tracking-tight">Tickets</div>
              <div className="text-[10px] text-muted-foreground/70 font-medium">نظام إدارة الصيانة</div>
            </div>
          </Link>
        </div>

        {/* Divider */}
        <div className="mx-4 h-px bg-border/50 mb-3" />

        {/* Nav groups */}
        <div className="relative flex-1 overflow-y-auto no-scrollbar px-3 pb-2 space-y-4">
          {NAV_GROUPS.map((group, gi) => {
            const items = filteredNav.filter(i => group.paths.includes(i.path));
            if (!items.length) return null;
            return (
              <div key={gi} className="space-y-0.5">
                {group.label && (
                  <p className="px-3 pb-1 text-[9px] font-bold text-muted-foreground/50 uppercase tracking-[0.18em]">
                    {group.label}
                  </p>
                )}
                {items.map(item => {
                  const active = isActive(item.path);
                  return (
                    <Link key={item.path} to={item.path}>
                      <div className={cn(
                        'relative flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 cursor-pointer',
                        active
                          ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/80'
                      )}>
                        {active && (
                          <div className="absolute inset-0 rounded-2xl bg-gradient-to-l from-white/0 to-white/8 pointer-events-none" />
                        )}
                        <item.icon className="w-4 h-4 shrink-0 relative" strokeWidth={active ? 2.5 : 1.75} />
                        <span className="relative">{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Bottom section */}
        <div className="px-3 pb-4 pt-3 border-t border-border/50 space-y-1 shrink-0">
          {/* Theme + Bell */}
          <div className="flex items-center gap-1 px-1 mb-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="flex-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl h-9"
              title={isLight ? 'الوضع الداكن' : 'الوضع الفاتح'}
            >
              {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </Button>
            <div className="flex-1 flex justify-center">
              <NotifBell side="left" />
            </div>
          </div>

          {/* User card */}
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-muted/80 transition-all duration-200 border border-transparent hover:border-border/40 group">
                <Avatar className="w-8 h-8 shrink-0 ring-2 ring-primary/20 group-hover:ring-primary/35 transition-all">
                  <AvatarImage src={user?.photoURL} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-end min-w-0 flex-1 text-right leading-tight">
                  <span className="font-semibold text-foreground text-sm truncate w-full">
                    {user?.displayName}
                  </span>
                  <span className="text-muted-foreground text-[10px] font-medium">
                    {roleLabel[user?.role ?? ''] ?? user?.role}
                  </span>
                </div>
              </div>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={8}
              className="w-52 mb-1 bg-card border-border rounded-2xl shadow-2xl shadow-black/20"
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-muted-foreground text-right text-xs font-medium px-3 py-2">
                  حسابي
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem
                  className="hover:bg-muted cursor-pointer text-right justify-end rounded-xl mx-1 my-0.5"
                  onClick={() => navigate('/settings#profile')}
                >
                  الملف الشخصي
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="hover:bg-muted cursor-pointer text-right justify-end rounded-xl mx-1 my-0.5"
                  onClick={() => navigate('/settings')}
                >
                  الإعدادات
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                className="text-red-500 hover:bg-red-500/10 cursor-pointer text-right justify-end gap-2 rounded-xl mx-1 my-0.5"
                onClick={() => logout()}
              >
                تسجيل الخروج
                <LogOut className="w-4 h-4" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </>
  );
}
