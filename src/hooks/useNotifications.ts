import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationsApi } from '@/lib/api';
import { useSocket } from '@/contexts/SocketContext';

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
  const fetchedRef = useRef(false);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await notificationsApi.getAll();
      setNotifications(data.map((n: any) => ({
        ...n,
        ticketDocId: n.ticketId ?? n.ticketDocId,
      })));
    } catch {
      // silently ignore — not critical
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      fetchedRef.current = false;
      return;
    }
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchNotifications();
    }
  }, [userId, fetchNotifications]);

  useEffect(() => {
    if (!socket || !userId) return;
    const handler = (notif: AppNotification) => {
      setNotifications(prev => [{ ...notif, ticketDocId: (notif as any).ticketId ?? notif.ticketDocId }, ...prev].slice(0, 50));
    };
    socket.on('notification', handler);
    return () => { socket.off('notification', handler); };
  }, [socket, userId]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    try {
      await notificationsApi.readAll();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  }, [userId]);

  const markRead = useCallback(async (id: string) => {
    if (!userId) return;
    try {
      await notificationsApi.read(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {}
  }, [userId]);

  return { notifications, unreadCount, markAllRead, markRead };
}
