import { useEffect, useState, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  writeBatch,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface AppNotification {
  id: string;
  type: 'appointment_reminder' | 'ticket_assigned';
  title: string;
  body: string;
  ticketDocId?: string;
  ticketRef?: string;
  read: boolean;
  createdAt: any;
  appointmentTime?: string;
}

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, `notifications/${userId}/items`),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    return onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
        setNotifications(items);
        setUnreadCount(items.filter(n => !n.read).length);
      },
      (err) => {
        // Silently ignore permission errors (rules not yet deployed, or user has no notifications)
        if (err.code !== 'permission-denied') console.warn('[useNotifications]', err);
      }
    );
  }, [userId]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const unread = notifications.filter(n => !n.read);
    if (!unread.length) return;
    const batch = writeBatch(db);
    unread.forEach(n =>
      batch.update(doc(db, `notifications/${userId}/items`, n.id), { read: true })
    );
    await batch.commit();
  }, [userId, notifications]);

  const markRead = useCallback(
    async (notifId: string) => {
      if (!userId) return;
      await updateDoc(doc(db, `notifications/${userId}/items`, notifId), { read: true });
    },
    [userId]
  );

  return { notifications, unreadCount, markAllRead, markRead };
}
