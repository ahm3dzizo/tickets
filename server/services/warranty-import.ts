const ARABIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

function westernDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, digit => ARABIC_DIGITS[digit] || digit);
}

/**
 * Build a project-scoped unit key. A bare unit number is qualified by the
 * selected project's abbreviation; an explicit, different prefix is rejected.
 */
export function normalizeWarrantyUnitReference(raw: unknown, projectAbbreviation: string): string | null {
  const value = westernDigits(String(raw ?? "")).trim();
  const abbreviation = westernDigits(projectAbbreviation || "").trim();
  if (!value || !abbreviation) return null;

  let unitPart = value;
  const escapedAbbreviation = abbreviation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ownPrefix = new RegExp(`^${escapedAbbreviation}[-_/\\s]+(.+)$`, "i");
  const ownMatch = value.match(ownPrefix);

  if (ownMatch) {
    unitPart = ownMatch[1].trim();
  } else if (/^[A-Za-z0-9]+[-_/\\s]+.+$/.test(value)) {
    // An explicit prefix is meaningful. Never silently replace another project's prefix.
    return null;
  } else {
    // Unprefixed values are interpreted in the selected project namespace:
    // ${abbreviation}-${value}
    unitPart = value;
  }

  unitPart = unitPart
    .replace(/^(?:villa|unit|الوحدة|فيلا)\\s*[-:/#]?\\s*/i, "")
    .trim();

  if (/^\\d+$/.test(unitPart)) return String(Number(unitPart));
  const trailingNumber = unitPart.match(/[-_/\\s]+(\\d+)$/);
  if (trailingNumber) return String(Number(trailingNumber[1]));
  return unitPart.toLocaleUpperCase("en-US");
}

export function normalizeWarrantyColumn(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^a-z0-9\\u0600-\\u06ff]+/g, "");
}

export function parseWarrantyDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;

  let date: Date | null = null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    date = new Date(Date.UTC(raw.getFullYear(), raw.getMonth(), raw.getDate()));
  } else if (typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw < 100000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    date = new Date(excelEpoch + Math.round(raw) * 86400000);
  } else {
    const value = westernDigits(String(raw)).trim();
    const dmy = value.match(/^(\\d{1,2})[/-](\\d{1,2})[/-](\\d{2,4})$/);
    if (dmy) {
      const day = Number(dmy[1]);
      const month = Number(dmy[2]);
      let year = Number(dmy[3]);
      if (year < 100) year += 2000;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const candidate = new Date(Date.UTC(year, month - 1, day));
        if (candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day) {
          date = candidate;
        }
      }
    } else {
      const iso = value.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})/);
      if (iso) {
        const year = Number(iso[1]), month = Number(iso[2]), day = Number(iso[3]);
        const candidate = new Date(Date.UTC(year, month - 1, day));
        if (candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day) {
          date = candidate;
        }
      }
    }
  }

  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function addOneWarrantyYear(dateOnly: string): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const targetDay = Math.min(day, new Date(Date.UTC(year + 1, month, 0)).getUTCDate());
  return new Date(Date.UTC(year + 1, month - 1, targetDay)).toISOString().slice(0, 10);
}
