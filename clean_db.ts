import prisma from "./server/db.js";

async function run() {
  const badWords = [
      "في","من","الى","على","عن","مع","هذا","هذه","ذلك","تلك","التي","الذي",
      "كان","كانت","يكون","هو","هي","هم","انا","نحن","انت","انتم","يوجد",
      "لا","لم","لن","ما","قد","كل","بعض","غير","وقت","يوم","ساعة","الان",
      "اليوم","جدا","فقط","حتى","ايضا","او","و","ثم","لكن","اما","اذا",
      "لان","بسبب","حيث","بين","خلال","دون","قبل","بعد","تحت","فوق",
      "السلام","عليكم","ورحمة","الله","وبركاته","شكرا","تحياتي","نرجو","برجاء",
      "ارجو","الرجاء","لدي","عندي","مشكلة","صيانة","تعمل","يعمل","بشكل","جيد",
      "تحتاج","يحتاج","تغيير","تعديل","اصلاح","فضلا","نامل","صورة","مرفق",
      "عاجل","للضرورة","جميع","احد","احدى","عدم","تعليق"
  ];

  try {
    const deleted = await prisma.ticketTypeKeyword.deleteMany({
      where: {
        keyword: {
          in: badWords
        }
      }
    });

    console.log(`Deleted ${deleted.count} bad keywords.`);

    // Also delete any keyword with length < 3
    const deletedShort = await prisma.ticketTypeKeyword.deleteMany({
      where: {
        keyword: {
          // This isn't strictly correct for length in Prisma, so we'll just fetch and delete
        }
      }
    });

    const allKw = await prisma.ticketTypeKeyword.findMany();
    let dCount = 0;
    for (const kw of allKw) {
      if (kw.keyword.length < 3) {
        await prisma.ticketTypeKeyword.delete({ where: { id: kw.id } });
        dCount++;
      }
    }
    console.log(`Deleted ${dCount} short keywords.`);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
