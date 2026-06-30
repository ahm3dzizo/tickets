import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const appointmentsToRestore = [
  // من ملف مدني
  { villa: "689", time: "05:00", notes: "بروفايل - باب الكراج مفتوح - عوامة", phone: "966530434313" },
  { villa: "504", time: "07:00", notes: "رقبة خزان", phone: "966559979902" },
  { villa: "557", time: "07:00", notes: "جبس", phone: "966509590710" },
  { villa: "53",  time: "08:00", notes: "باب الكراج - غطاء خزان", phone: "966530000695" },
  { villa: "601", time: "08:00", notes: "ترويبه - لي مغسله", phone: "966505609022" },
  { villa: "592", time: "09:00", notes: "باب جبس", phone: "966505403409" },
  { villa: "623", time: "10:30", notes: "2 مسطرة رخام", phone: "966568856590" },
  { villa: "610", time: "11:00", notes: "ترويبه انترلوك - دهان خارجي - روتانج", phone: "966532229933" },
  { villa: "550", time: "11:00", notes: "الومنيوم", phone: "966566906888" },
  { villa: "580", time: "11:00", notes: "سيراميك", phone: "96653055624" },
  { villa: "452", time: "13:00", "notes": "كسر في البلاط -غطاء خزان", phone: "966508505227" },
  { villa: "12",  time: "13:00", "notes": "ترويبه", phone: "966502803328" },
  { villa: "378", time: "13:00", "notes": "الومنيوم", phone: "966569975633" },
  { villa: "619", time: "13:30", notes: "كراك - دهان", phone: "966569912009" },
  { villa: "50",  time: "14:00", "notes": "ألومنيوم", phone: "966542728284" },
  { villa: "13",  time: "17:00", "notes": "تعديل لياسه - رقبة خزان في انتظار موعد من العميل", phone: "966535955388" },
  
  // من ملف سباكة
  { villa: "386", time: "08:00", notes: "كهربا حوش", phone: "966592827118" },
  { villa: "560", time: "08:00", notes: "ضغط المياه - كرسي معلق", phone: "966508012577" },
  { villa: "650", time: "08:00", notes: "روائح", phone: "966556999887" },
  { villa: "280", time: "09:00", "notes": "اكسسوار الحمام - سيفون لا يعمل", phone: "966558066642" },
  { villa: "429", time: "11:00", notes: "تنظيف مروحة", phone: "966557773040" },
  { villa: "660", time: "13:00", "notes": "افياش مش شغاله", phone: "966504990524" },
  { villa: "559", time: "13:00", "notes": "لي مغسله", phone: "966557772315" },
  { villa: "273", time: "13:00", "notes": "كرسي معلق", phone: "966506744299" },
  { villa: "449", time: "13:30", "notes": "كرسي روائح", phone: "966560363974" }
];

const DATE_PREFIX = "2026-06-30";

function normalizeVilla(v: any): string {
  if (!v) return '';
  return String(v).trim().replace(/^0+/, '') || String(v).trim();
}

async function main() {
  console.log('══════════════════════════════════════════');
  console.log('   استعادة مواعيد 30 يونيو 2026 من الصور');
  console.log('══════════════════════════════════════════\n');

  let successCount = 0;
  let notFoundCount = 0;

  for (const appt of appointmentsToRestore) {
    const fullTime = `${DATE_PREFIX} ${appt.time}`;
    
    // البحث عن التذاكر المفتوحة التي تخص هذه الفيلا
    const tickets = await prisma.ticket.findMany({
      where: {
        status: { notIn: ['closed', 'completed', 'out_of_scope'] }
      }
    });

    // فلترة للفيلا المطلوبة
    const villaTickets = tickets.filter(t => normalizeVilla(t.villaNumber) === appt.villa);

    if (villaTickets.length > 0) {
      // إذا كان هناك أكثر من تذكرة مفتوحة، نختار الأحدث إنشائاً
      const targetTicket = villaTickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      
      try {
        await prisma.ticket.update({
          where: { id: targetTicket.id },
          data: {
            appointmentTime: fullTime,
            appointmentNotes: appt.notes
          }
        });
        console.log(`✅ تم استعادة موعد فيلا ${appt.villa} -> ${fullTime}`);
        successCount++;
      } catch (e: any) {
         console.log(`❌ فشل تحديث فيلا ${appt.villa}: ${e.message}`);
      }
    } else {
      // ربما التذكرة مغلقة؟ نبحث عن أي تذكرة للفيلا
      const anyTickets = await prisma.ticket.findMany({
         where: { villaNumber: { contains: appt.villa } }
      });
      const matchingAny = anyTickets.filter(t => normalizeVilla(t.villaNumber) === appt.villa);
      
      if (matchingAny.length > 0) {
          const targetTicket = matchingAny.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
          try {
            await prisma.ticket.update({
              where: { id: targetTicket.id },
              data: {
                appointmentTime: fullTime,
                appointmentNotes: appt.notes,
                // نفتح التذكرة من جديد إذا كانت مغلقة لأن لها موعد اليوم
                status: targetTicket.status === 'closed' || targetTicket.status === 'completed' ? 'in_progress' : targetTicket.status
              }
            });
            console.log(`✅ تم استعادة موعد فيلا ${appt.villa} (وتم إعادة فتح التذكرة) -> ${fullTime}`);
            successCount++;
          } catch (e: any) {
             console.log(`❌ فشل تحديث فيلا ${appt.villa}: ${e.message}`);
          }
      } else {
          console.log(`⚠️ لم يتم العثور على أي تذكرة للفيلا ${appt.villa} في قاعدة البيانات!`);
          notFoundCount++;
      }
    }
  }

  console.log(`\n🎉 اكتملت العملية! تم استعادة ${successCount} موعد.`);
  if (notFoundCount > 0) {
    console.log(`⚠️ هناك ${notFoundCount} فيلل لم نعثر لها على تذاكر.`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
