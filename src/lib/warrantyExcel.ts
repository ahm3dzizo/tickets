export const WARRANTY_IMPORT_COLUMNS = [
  "رقم الوحدة",
  "تاريخ التسليم",
  "تاريخ الانتهاء",
] as const;

export const WARRANTY_EXPORT_COLUMNS = [
  "رقم الوحدة",
  "اسم العميل",
  "رقم الجوال",
  "المشروع",
  "تاريخ التسليم",
  "تاريخ الانتهاء",
  "حالة الضمان",
] as const;

export function getWarrantyStatus(expiryValue: string | Date, now = new Date()): string {
  const expiryDate = new Date(expiryValue);
  const nextMonth = new Date(now.getTime() + 30 * 86_400_000);
  if (expiryDate < now) return "منتهي";
  if (expiryDate <= nextMonth) return "ينتهي قريباً";
  return "ساري";
}

export function createWarrantyExportRow(warranty: any, status: string) {
  return {
    "رقم الوحدة": warranty.unitNumber,
    "اسم العميل": warranty.clientName,
    "رقم الجوال": warranty.clientPhone,
    "المشروع": warranty.projectName,
    "تاريخ التسليم": warranty.handoverDate,
    "تاريخ الانتهاء": warranty.warrantyExpiryDate,
    "حالة الضمان": status,
  };
}
