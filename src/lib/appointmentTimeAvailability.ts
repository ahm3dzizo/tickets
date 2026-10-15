import type { WorkHoursConfig } from './api';

export function timeToMinutes(time: string): number {
  if (!/^\d{1,2}:\d{2}$/.test(time)) return -1;
  const [hours, minutes] = time.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
    ? hours * 60 + minutes : -1;
}

export function isWithinBreak(mins: number, config: WorkHoursConfig): boolean {
  if (!config.enabled || config.hasBreak === false) return false;
  const start = timeToMinutes(config.break?.start || '');
  const end = timeToMinutes(config.break?.end || '');
  return start >= 0 && end > start && mins >= start && mins < end;
}

export function isWithinWorkHours(mins: number, config: WorkHoursConfig): boolean {
  if (!config.enabled) return true;
  if (mins < 0 || isWithinBreak(mins, config)) return false;
  return [
    config.hasMorning !== false && config.morning,
    config.hasAfternoon !== false && config.afternoon,
  ].some(period => {
    if (!period) return false;
    const start = timeToMinutes(period.start);
    const end = timeToMinutes(period.end);
    return start >= 0 && end >= start && mins >= start && mins <= end;
  });
}

export function availableTimes(config: WorkHoursConfig): string[] {
  if (!config.enabled) return [];
  const times = new Set<number>();
  const periods = [
    config.hasMorning !== false && config.morning,
    config.hasAfternoon !== false && config.afternoon,
  ];
  for (const period of periods) {
    if (!period) continue;
    const start = timeToMinutes(period.start);
    const end = timeToMinutes(period.end);
    if (start < 0 || end < start) continue;
    if (isWithinWorkHours(start, config)) times.add(start);
    // Half-hour choices, while preserving custom minutes through the time input.
    for (let mins = Math.ceil(start / 30) * 30; mins <= end; mins += 30) {
      if (isWithinWorkHours(mins, config)) times.add(mins);
    }
  }
  return [...times].sort((a, b) => a - b).map(mins => {
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  });
}

export function firstAvailableTimeInPeriod(
  period: { start: string; end: string }, config: WorkHoursConfig,
): string | null {
  const start = timeToMinutes(period.start);
  const end = timeToMinutes(period.end);
  return availableTimes(config).find(value => {
    const mins = timeToMinutes(value);
    return mins >= start && mins <= end;
  }) || null;
}
