import xlsx from 'xlsx';

const file = 'd:\\APP\\tickets-main\\tickets\\src\\NTF Maintenance Cases by Contractor-2026-06-27-15-18-38.xlsx';
const workbook = xlsx.readFile(file);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
for (let i = 10; i < 20; i++) {
  console.log(`Row ${i}:`, data[i]);
}
