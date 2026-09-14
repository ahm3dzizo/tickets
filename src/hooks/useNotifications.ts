import { useState, useEffect, useCallback, useRef } from 'react';
import { authStorage, notificationsApi } from '@/lib/api';
import { useSocket } from '@/contexts/SocketContext';
import { getPushPermission, isPushSupported, registerPush } from '@/lib/pushNotifications';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  ticketDocId?: string;
  ticketRef?: string;
  read: boolean;
  createdAt: string;
  appointmentTime?: string;
}

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const socket = useSocket();
  const fetchedUserRef = useRef<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await notificationsApi.getAll();
      setNotifications(data.map((n: any) => ({
        ...n,
        ticketDocId: n.ticketId ?? n.ticketDocId,
      })));
    } catch {
      // Notifications are non-blocking; keep the rest of the app usable.
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      fetchedUserRef.current = null;
      return;
    }

    if (fetchedUserRef.current !== userId) {
      fetchedUserRef.current = userId;
      void fetchNotifications();
    }
  }, [userId, fetchNotifications]);

  // Make sure push is actually subscribed whenever permission was already
  // granted. If permission is still "default", request the real browser
  // permission dialog on the user's first interaction. Chrome/Android requires
  // a user activation for a reliable native permission prompt, so asking during
  // page load is intentionally avoided.
  useEffect(() => {
    if (!userId || typeof window === 'undefined' || !isPushSupported()) return;

    const token = authStorage.getToken();
    if (!token) return;

    const permission = getPushPermission();
    if (permission === 'granted') {
      void registerPush(`Bearer ${token}`).catch(() => {});
      return;
    }
    if (permission !== 'default') return;

    const attemptKey = `retal:push-permission-attempt:${userId}`;
    try {
      if (sessionStorage.getItem(attemptKey) === '1') return;
    } catch {}

    let active = true;
    const cleanup = () => {
      window.removeEventListener('pointerdown', requestPermissionFromGesture, true);
      window.removeEventListener('keydown', requestPermissionFromGesture, true);
    };

    const requestPermissionFromGesture = () => {
      if (!active) return;
      active = false;
      cleanup();
      try { sessionStorage.setItem(attemptKey, '1'); } catch {}

      // registerPush calls Notification.requestPermission() before its first
      // await, so the request remains inside this trusted user gesture.
      void registerPush(`Bearer ${token}`).catch(() => {});
    };

    window.addEventListener('pointerdown', requestPermissionFromGesture, true);
    window.addEventListener('keydown', requestPermissionFromGesture, true);

    return () => {
      active = false;
      cleanup();
    };
  }, [userId]);

  useEffect(() => {
    if (!socket || !userId) return;
    const handler = (notif: AppNotification) => {
      setNotifications(prev => [
        { ...notif, ticketDocId: (notif as any).ticketId ?? notif.ticketDocId },
        ...prev,
      ].slice(0, 50));
    };
    socket.on('notification', handler);
    return () => { socket.off('notification', handler); };
  }, [socket, userId]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    try {
      await notificationsApi.readAll();

      // Navbar currently marks all read from DropdownMenu.onOpenChange. A React
      // state update here remounts the nested bell component and immediately
      // closes the menu again. Mutate the existing records without forcing that
      // parent render; the next normal render/navigation will reflect count=0.
      for (const notification of notifications) notification.read = true;
    } catch {}
  }, [userId, notifications]);

  const markRead = useCallback(async (id: string) => {
    if (!userId) return;
    try {
      await notificationsApi.read(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {}
  }, [userId]);

  return { notifications, unreadCount, markAllRead, markRead, refresh: fetchNotifications };
}
