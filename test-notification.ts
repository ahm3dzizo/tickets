import prisma from './server/db.js';
import { createNotification } from './server/notificationService.js';

async function main() {
  // Get the first user
  const user = await prisma.user.findFirst({ select: { uid: true, displayName: true, role: true } });
  if (!user) {
    console.log('❌ No users found in DB');
    process.exit(1);
  }
  console.log(`📤 Sending test notification to: ${user.displayName} (${user.uid}) [${user.role}]`);

  const notif = await createNotification(
    user.uid,
    'test',
    '🔔 إشعار اختبار',
    'هذا إشعار تجريبي للتأكد من أن نظام الإشعارات يعمل بشكل صحيح',
    undefined,
  );

  console.log('✅ Notification created:', notif);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
