import prisma from "./server/db.js";

async function cleanInvalidAppointments() {
  console.log("Fetching tickets with appointmentTime...");
  const tickets = await prisma.ticket.findMany({
    where: { appointmentTime: { not: null } },
  });

  console.log(`Found ${tickets.length} tickets with an appointmentTime.`);

  const greetingsRegex = /^(صباح الخير|مساء الخير|السلام عليكم|هلا|مرحبا|شكرا|يعطيك العافية|تمام|اوكي|طيب)[\s]*$/i;
  
  let clearedCount = 0;

  for (const t of tickets) {
    const text = t.appointmentTime?.trim() || "";
    
    // Check if it looks like a valid ISO date
    const isIsoDate = /^\d{4}-\d{2}-\d{2}/.test(text);
    
    // If it's an ISO date, skip it
    if (isIsoDate) continue;

    // Check if it's purely a number (like excel epoch), let it be
    if (!isNaN(Number(text))) continue;

    let shouldClear = false;

    // Condition 1: Pure greeting
    if (greetingsRegex.test(text)) {
      shouldClear = true;
    }
    
    // Condition 2: Too long (more than 50 chars)
    if (text.length > 50) {
      shouldClear = true;
    }

    if (shouldClear) {
      console.log(`Clearing invalid appointmentTime from ticket ${t.ticketId}: "${text}"`);
      await prisma.ticket.update({
        where: { id: t.id },
        data: { 
          appointmentTime: null,
          // We can optionally set appointmentAwaitingReply back to true so the bot can ask again
          // but we will just clear it for now to fix the dashboard
        }
      });
      clearedCount++;
    }
  }

  console.log(`Finished. Cleared ${clearedCount} invalid appointments.`);
}

cleanInvalidAppointments().catch(console.error).finally(() => prisma.$disconnect());
