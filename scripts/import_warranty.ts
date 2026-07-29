import { PrismaClient } from '@prisma/client';
import xlsx from 'xlsx';
import path from 'path';

const prisma = new PrismaClient();

function excelDateToJSDate(serial: number) {
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return date;
}

async function main() {
  const filePath = path.join(process.cwd(), 'Book1 (1).xlsx');
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

  let updated = 0;
  for (let i = 1; i < data.length; i++) {
    const row = data[i] as any[];
    if (!row || row.length < 5) continue;
    let unitNumber = String(row[2]).trim();
    if (unitNumber.toUpperCase().startsWith('NTF-')) {
      unitNumber = unitNumber.substring(4);
    }
    const handoverSerial = row[4];
    
    if (unitNumber && handoverSerial) {
      const handoverDateObj = excelDateToJSDate(handoverSerial);
      // Format as YYYY-MM-DD
      const handoverDateStr = handoverDateObj.toISOString().split('T')[0];
      
      const warrantyEndDateObj = new Date(handoverDateObj);
      warrantyEndDateObj.setFullYear(warrantyEndDateObj.getFullYear() + 1);
      const warrantyEndDateStr = warrantyEndDateObj.toISOString().split('T')[0];

      // Update unit
      const result = await prisma.unit.updateMany({
        where: { unitNumber },
        data: {
          handoverDate: handoverDateStr,
          warrantyExpiryDate: warrantyEndDateStr
        }
      });
      if (result.count > 0) updated += result.count;
    }
  }
  console.log(`Updated ${updated} units with warranty dates.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
