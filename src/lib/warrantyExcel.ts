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
