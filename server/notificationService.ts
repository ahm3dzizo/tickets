import prisma from './db.js';

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
  const io = (global as any).__io;
  if (io) io.to(`user:${uid}`).emit('notification', notif);
  return notif;
}
