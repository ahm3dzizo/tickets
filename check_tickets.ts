import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
async function main() {
  const t = await prisma.ticket.findMany({ where: { ticketId: { in: ['192639', '193297', '192816', '193126', '193522'] } }, select: { ticketId: true, appointmentTime: true } })
  console.log(t)
}
main()
