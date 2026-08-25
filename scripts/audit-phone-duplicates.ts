import prisma from '../server/db.js';
import { normalizePhoneNumber } from '../server/auth.js';

type PhoneOwner = {
  kind: 'user' | 'technician';
  id: string;
  name: string;
  storedPhone: string;
};

async function main() {
  const [users, technicians] = await Promise.all([
    prisma.user.findMany({
      where: { phoneNumber: { not: null } },
      select: { uid: true, displayName: true, phoneNumber: true },
    }),
    prisma.technician.findMany({
      where: { phoneNumber: { not: null } },
      select: { id: true, name: true, phoneNumber: true },
    }),
  ]);

  const ownersByPhone = new Map<string, PhoneOwner[]>();
  const add = (phone: string | null, owner: PhoneOwner) => {
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return;
    const owners = ownersByPhone.get(normalized) ?? [];
    owners.push(owner);
    ownersByPhone.set(normalized, owners);
  };

  for (const user of users) {
    add(user.phoneNumber, {
      kind: 'user',
      id: user.uid,
      name: user.displayName,
      storedPhone: user.phoneNumber!,
    });
  }
  for (const technician of technicians) {
    add(technician.phoneNumber, {
      kind: 'technician',
      id: technician.id,
      name: technician.name,
      storedPhone: technician.phoneNumber!,
    });
  }

  const duplicates = [...ownersByPhone.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([phoneNumber, owners]) => ({ phoneNumber, owners }));

  console.log(JSON.stringify({
    checked: {
      users: users.length,
      technicians: technicians.length,
    },
    duplicatePhoneNumbers: duplicates.length,
    duplicates,
  }, null, 2));

  if (duplicates.length > 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
