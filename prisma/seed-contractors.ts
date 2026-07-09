import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Try to find the Fursan project, or use the first one available
  let project = await prisma.project.findFirst({
    where: {
      OR: [
        { name: { contains: 'الفرسان' } },
        { abbreviation: { contains: 'Fursan', mode: 'insensitive' } }
      ]
    }
  });

  if (!project) {
    console.log('No project found in the database. Creating a default project...');
    project = await prisma.project.create({
      data: {
        name: 'الفرسان',
        abbreviation: 'Fursan',
        location: 'الرياض',
      }
    });
  }

  console.log(`Using project: ${project.name} (${project.id})`);

  // Ensure specialties exist
  const doorsSpecialty = await prisma.specialty.upsert({
    where: { key: 'doors' },
    update: {},
    create: {
      key: 'doors',
      nameAr: 'أبواب',
    }
  });

  const aluminumSpecialty = await prisma.specialty.upsert({
    where: { key: 'aluminum' },
    update: {},
    create: {
      key: 'aluminum',
      nameAr: 'ألمنيوم',
    }
  });

  const contractorsData = [
    {
      name: 'درغام', // Dargham
      specialties: ['aluminum'],
      assignments: [
        { blockNumber: '20' },
        { blockNumber: '23' },
        { blockNumber: '24' },
        { blockNumber: '25' },
        { blockNumber: '28' },
        { blockNumber: '29', villaNumber: '1, 2, 3, 4' }, // Assume 1,2,3,4 belong to Dargham from the crossed out note
      ]
    },
    {
      name: 'شركة أقفال العربية المحدودة', // Arab Locksmith Company Limited
      specialties: ['doors'],
      assignments: [
        { blockNumber: '5' },
        { blockNumber: '6' },
        { blockNumber: '7' },
        { blockNumber: '9' },
        { blockNumber: '10' },
        { blockNumber: '14' },
      ]
    },
    {
      name: 'شركة أبواب اليمامة المحدودة', // Yamamah Doors Company LTD
      specialties: ['doors'],
      assignments: [
        { blockNumber: '34', fromVilla: '713', toVilla: '721' },
        { blockNumber: '33', fromVilla: '705', toVilla: '712' },
        { blockNumber: '25', fromVilla: '564', toVilla: '571' },
        { blockNumber: '24', fromVilla: '544', toVilla: '563' },
        { blockNumber: '23', fromVilla: '522', toVilla: '543' },
        { blockNumber: '19', fromVilla: '450', toVilla: '460' },
        { blockNumber: '18', fromVilla: '430', toVilla: '439' },
        { blockNumber: '17', fromVilla: '401', toVilla: '423' },
        { blockNumber: '7', fromVilla: '199', toVilla: '218' },
        { blockNumber: '6', fromVilla: '183', toVilla: '198' },
        { blockNumber: '5', fromVilla: '163', toVilla: '182' },
      ]
    },
    {
      name: 'شركة مصنع الرائد الذهبي للأبواب الأتوماتيكية', // masna alraed aldhahabi lilabwab
      specialties: ['doors'],
      assignments: [
        { blockNumber: '2', fromVilla: '45', toVilla: '61' },
        { blockNumber: '3', fromVilla: '79', toVilla: '93' },
        { blockNumber: '9', fromVilla: '245', toVilla: '272' },
        { blockNumber: '13', villaNumber: '338' },
      ]
    },
    {
      name: 'ابو حمزه', // Abu Hamza
      specialties: ['aluminum'],
      assignments: [
        { blockNumber: '14' },
        { blockNumber: '10' },
        { blockNumber: '9' },
        { blockNumber: '8' },
        { blockNumber: '7' },
        { blockNumber: '6' },
        { blockNumber: '29' }, // Full block handwritten at bottom
        { blockNumber: '21', villaNumber: '483, 484' },
        { villaNumber: '495, 496, 497, 498, 499, 500' }, // Second party
        { blockNumber: '27', villaNumber: '596, 597, 598, 599, 600, 601, 602, 603, 604' },
        { villaNumber: '611, 612, 613, 614, 615, 616, 617, 618, 619' }, // Second party
      ]
    },
    {
      name: 'لقمان', // Luqman
      specialties: ['aluminum'],
      assignments: [
        { blockNumber: '1' },
        { blockNumber: '2' },
        { blockNumber: '3' },
        { blockNumber: '4' },
        { blockNumber: '5' },
        { blockNumber: '11' },
        { blockNumber: '12' },
        { blockNumber: '13' },
        { blockNumber: '15' },
        { blockNumber: '16' },
        { blockNumber: '17' },
        { blockNumber: '18' },
        { blockNumber: '19' },
        { blockNumber: '22' },
        { blockNumber: '26' },
        { blockNumber: '30' },
        { blockNumber: '31' },
        { blockNumber: '32' },
        { blockNumber: '33' },
        { blockNumber: '34' },
        { blockNumber: '35' },
      ]
    }
  ];

  for (const c of contractorsData) {
    const existing = await prisma.contractor.findFirst({
      where: { name: c.name }
    });

    if (existing) {
      console.log(`Contractor already exists: ${c.name}, skipping...`);
      continue;
    }

    const contractor = await prisma.contractor.create({
      data: {
        name: c.name,
        specialties: {
          create: c.specialties.map(key => ({ specialtyKey: key }))
        },
        assignments: {
          create: c.assignments.map(a => ({
            projectId: project!.id,
            blockNumber: a.blockNumber || null,
            villaNumber: a.villaNumber || null,
            fromVilla: a.fromVilla || null,
            toVilla: a.toVilla || null,
          }))
        }
      }
    });
    console.log(`Created contractor: ${contractor.name}`);
  }

  console.log('Finished seeding contractors');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
