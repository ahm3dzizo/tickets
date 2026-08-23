import { useCallback } from 'react';

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

/** Stub — in-app notifications are not implemented in the PostgreSQL backend */
export function useNotifications(_userId: string | null) {
  const markAllRead = useCallback(async () => { /* no-op */ }, []);
  const markRead = useCallback(async (_notifId: string) => { /* no-op */ }, []);
  return { notifications: [] as AppNotification[], unreadCount: 0, markAllRead, markRead };
}
