import type { WorkHoursConfig } from './api';

// JavaScript weekday numbers: Sunday = 0 ... Friday = 5 ... Saturday = 6.
export const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4, 6];
export const WEEKDAYS_AR = [
  { id: 6, label: 'السبت' },
  { id: 0, label: 'الأحد' },
  { id: 1, label: 'الإثنين' },
  { id: 2, label: 'الثلاثاء' },
  { id: 3, label: 'الأربعاء' },
  { id: 4, label: 'الخميس' },
  { id: 5, label: 'الجمعة' },
];

function parsedDate(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(dateStr + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dateStr ? d : null;
}

export function weekdayOf(dateStr: string): number {
  return parsedDate(dateStr)?.getUTCDay() ?? -1;
}

export function isWorkingDate(dateStr: string, config: WorkHoursConfig): boolean {
  const day = weekdayOf(dateStr);
  if (day === -1) return false;
  return !config.enabled || (config.workingDays ?? DEFAULT_WORKING_DAYS).includes(day);
}

export function dateWorkHours(dateStr: string, config: WorkHoursConfig): WorkHoursConfig {
  const day = weekdayOf(dateStr);
  const override = day === -1 ? undefined : config.dayOverrides?.[String(day)];
  return override ? { ...config, ...override } : config;
}

// Finds the next enabled weekday without silently changing an existing appointment.
export function nextWorkingDate(dateStr: string, config: WorkHoursConfig, includeToday = false): string | null {
  const d = parsedDate(dateStr);
  if (!d) return null;
  for (let offset = includeToday ? 0 : 1; offset <= 7; offset++) {
    const candidate = new Date(d.getTime());
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    const result = candidate.toISOString().slice(0, 10);
    if (isWorkingDate(result, config)) return result;
  }
  return null;
}

// Inclusive period: n = 1 ends on the start date, skipping configured days off.
export function addWorkingDays(dateStr: string, additionalDays: number, config: WorkHoursConfig): string {
  const d = parsedDate(dateStr);
  if (!d) return dateStr;
  let remaining = Math.max(0, additionalDays);
  let checked = 0;
  while (remaining > 0 && checked < 366) {
    d.setUTCDate(d.getUTCDate() + 1);
    checked++;
    if (isWorkingDate(d.toISOString().slice(0, 10), config)) remaining--;
  }
  return d.toISOString().slice(0, 10);
}
