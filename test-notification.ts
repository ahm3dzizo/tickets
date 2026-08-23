import prisma from './server/db.js';
import { createNotification } from './server/notificationService.js';

async function main() {
  const users = await prisma.user.findMany({ select: { uid: true, displayName: true, role: true } });
  if (users.length === 0) {
    console.log('❌ No users found in DB');
    process.exit(1);
  }
  console.log(`📤 Sending test notification to ${users.length} users...`);

  for (const user of users) {
    const notif = await createNotification(
      user.uid,
      'test',
      '🔔 إشعار اختبار',
      'هذا إشعار تجريبي للتأكد من أن نظام الإشعارات يعمل بشكل صحيح',
      undefined,
    );
    console.log(`✅ ${user.displayName} (${user.role}) → ${notif.id}`);
  }

  console.log('🎉 Done!');
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
