import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Ticket, 
  Users, 
  Settings, 
  LogOut,
  Bell,
  Wrench,
  Menu,
  X,
  Briefcase,
  UserCheck,
  HardHat,
  CalendarClock,
  ClipboardList,
  CheckCheck,
  Moon,
  Sun,
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

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications(user?.uid ?? null);
  const isLight = resolvedTheme === 'light';

  const navigateToSettings = (hash?: 'profile') => {
    navigate(hash ? `/settings#${hash}` : '/settings');
    setIsOpen(false);
  };

  const toggleTheme = () => {
    setTheme(isLight ? 'dark' : 'light');
  };

  const formatTimeAgo = (ts: any): string => {
    if (!ts) return '';
    try {
      const d: Date = ts.toDate ? ts.toDate() : new Date(ts);
      const diffH = Math.floor((Date.now() - d.getTime()) / 3600000);
      if (diffH < 1) return 'الآن';
      if (diffH < 24) return `منذ ${diffH} س`;
      return `منذ ${Math.floor(diffH / 24)} يوم`;
    } catch { return ''; }
  };

  const handleNotifClick = async (n: AppNotification) => {
    if (!n.read) await markRead(n.id);
    if (n.ticketDocId) navigate(`/tickets/${n.ticketDocId}`);
    setIsOpen(false);
  };

  const navItems = [
    { icon: LayoutDashboard, label: 'لوحة التحكم', path: '/', roles: ['admin', 'engineer', 'supervisor'] },
    { icon: Briefcase, label: 'المشاريع', path: '/projects', roles: ['admin', 'engineer', 'supervisor'] },
    { icon: UserCheck, label: 'العملاء', path: '/clients', roles: ['admin', 'engineer', 'supervisor'] },
    { icon: Ticket, label: 'التذاكر', path: '/tickets', roles: ['admin', 'engineer', 'supervisor'] },
    { icon: HardHat, label: 'الفنيين', path: '/technicians', roles: ['admin', 'supervisor'] },
    { icon: Users, label: 'الفريق', path: '/team', roles: ['admin', 'engineer'] },
    { icon: Settings, label: 'الإعدادات', path: '/settings', roles: ['admin', 'engineer', 'supervisor'] },
  ];

  const filteredNavItems = navItems.filter(item => user && item.roles.includes(user.role));

  const NavContent = () => (
    <>
      <div className="flex items-center gap-3 mb-12">
        <img src="/logo.jpg" alt="Retal" className="w-9 h-9 object-contain" />
        <span className="font-extrabold text-lg tracking-tight text-foreground">Retal Maintenance System</span>
      </div>

      <div className="flex-1 space-y-2">
        {filteredNavItems.map((item) => (
          <Link key={item.path} to={item.path} onClick={() => setIsOpen(false)}>
            <Button
              variant="ghost"
              className={cn(
                'w-full justify-start gap-3 px-4 py-6 text-muted-foreground hover:text-foreground hover:bg-muted transition-all font-medium',
                location.pathname === item.path && 'text-blue-500 bg-blue-500/10 hover:bg-blue-500/15'
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Button>
          </Link>
        ))}
      </div>

      <div className="mt-auto pt-6 border-t border-border">
          <div className="flex items-center justify-between mb-4 px-2 gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              onClick={toggleTheme}
              aria-label={isLight ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح'}
              title={isLight ? 'الوضع الداكن' : 'الوضع الفاتح'}
            >
              {isLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </Button>
            {/* ── Notification Bell ── */}
            <DropdownMenu onOpenChange={(open) => { if (open) markAllRead(); }}>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground relative"
                  />
                }
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 left-1 min-w-[16px] h-4 bg-red-500 rounded-full border-2 border-card flex items-center justify-center text-[9px] font-bold text-white px-0.5 leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="left"
                sideOffset={12}
                align="end"
                className="!w-80 !min-w-0 bg-popover border-border text-popover-foreground rounded-2xl shadow-2xl shadow-black/20 overflow-hidden p-0"
              >
                {/* Header */}
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground font-bold">
                    {unreadCount > 0 ? `${unreadCount} غير مقروء` : 'لا يوجد جديد'}
                  </span>
                  <span className="text-sm font-bold text-foreground">الإشعارات</span>
                </div>

                {/* Notification list */}
                <div className="max-h-[340px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      <Bell className="w-8 h-8 mx-auto mb-3 opacity-20" />
                      لا توجد إشعارات
                    </div>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        className={cn(
                          'px-4 py-3 border-b border-border/40 cursor-pointer hover:bg-muted transition-colors flex gap-3 items-start',
                          !n.read && 'bg-blue-500/5'
                        )}
                        onClick={() => handleNotifClick(n)}
                      >
                        {/* Icon */}
                        <div
                          className={cn(
                            'mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
                            n.type === 'appointment_reminder'
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-blue-500/10 text-blue-400'
                          )}
                        >
                          {n.type === 'appointment_reminder'
                            ? <CalendarClock className="w-4 h-4" />
                            : <ClipboardList className="w-4 h-4" />}
                        </div>

                        {/* Content */}
                        <div className="flex-1 text-right min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <div className="flex items-center gap-1">
                              {!n.read && (
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                              )}
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {formatTimeAgo(n.createdAt)}
                              </span>
                            </div>
                            <p className="text-[13px] font-semibold text-foreground leading-tight truncate">
                              {n.title}
                            </p>
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-2 text-right">
                            {n.body}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer */}
                {notifications.length > 0 && (
                  <div className="p-3 border-t border-border">
                    <button
                      onClick={markAllRead}
                      className="w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      تحديد الكل كمقروء
                    </button>
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" className="w-full justify-start gap-3 px-2 h-14 hover:bg-muted" />}>
            <Avatar className="w-9 h-9 border border-border">
              <AvatarImage src={user?.photoURL} />
              <AvatarFallback className="bg-muted text-muted-foreground">
                {user?.displayName?.slice(0, 2).toUpperCase() || '??'}
              </AvatarFallback>
            </Avatar>
              <div className="flex flex-col items-end text-xs">
              <span className="font-semibold text-foreground truncate max-w-[110px]">{user?.displayName}</span>
              <span className="text-muted-foreground uppercase tracking-widest text-[9px] font-bold">
                {user?.role === 'admin' ? 'مدير النظام' : user?.role === 'engineer' ? 'مهندس مشروع' : 'مشرف'}
              </span>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-card border-border text-card-foreground">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground text-right">حسابي</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem
                className="hover:bg-muted cursor-pointer text-right justify-end"
                onClick={() => navigateToSettings('profile')}
              >
                الملف الشخصي
              </DropdownMenuItem>
              <DropdownMenuItem
                className="hover:bg-muted cursor-pointer text-right justify-end"
                onClick={() => navigateToSettings()}
              >
                الإعدادات
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem 
              className="text-red-400 hover:bg-red-500/10 cursor-pointer text-right justify-end"
              onClick={() => logout()}
            >
              تسجيل الخروج
              <LogOut className="w-4 h-4 mr-2" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 border-b border-border bg-card px-4 flex items-center justify-between z-50">
        <div className="flex items-center gap-2">
          <img src="/logo.jpg" alt="Retal" className="w-7 h-7 object-contain" />
          <span className="font-bold text-foreground">Retal Maintenance System</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={isLight ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح'}
            title={isLight ? 'الوضع الداكن' : 'الوضع الفاتح'}
          >
            {isLight ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </Button>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <nav className="hidden lg:flex fixed right-0 top-0 h-full w-[240px] border-l border-border bg-card p-6 flex-col z-40">
        <NavContent />
      </nav>

      {/* Mobile Sidebar Overlay */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <nav className={cn(
        "lg:hidden fixed right-0 top-0 h-full w-[280px] bg-card p-6 flex flex-col z-50 transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <NavContent />
      </nav>
    </>
  );
}
