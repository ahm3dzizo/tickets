import prisma from './db.js';
import { sendPushToUser } from './pushService.js';

export async function createNotification(
  uid: string,
  type: string,
  title: string,
  body: string,
  ticketId?: string,
) {
  const notif = await prisma.appNotification.create({
    data: { uid, type, title, body, ticketId: ticketId ?? null },
  });

  // In-app: emit to open browser tab via socket
  const io = (global as any).__io;
  if (io) io.to(`user:${uid}`).emit('notification', notif);

  // Push: send to phone/background browser
  sendPushToUser(uid, {
    title,
    body,
    tag: type,
    url: ticketId ? `/tickets/${ticketId}` : '/',
  }).catch(() => {});

  return notif;
}
