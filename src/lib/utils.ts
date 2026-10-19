import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

import {formatAppointmentTime12Ar} from './appointment-time-display';

export function formatAppointmentDayTime(timeStr?: string | null): string {
  if (!timeStr) return 'لم يحدد بعد';
  try {
    const parts = timeStr.split(' ');
    const d = new Date(parts[0]);
    if (isNaN(d.getTime())) return timeStr;
    const dayName = d.toLocaleDateString('ar-EG', { weekday: 'long' });
    return `${dayName} ${parts[1] ? formatAppointmentTime12Ar(parts[1]) : ''}`.trim();
  } catch {
    return timeStr;
  }
}

/** Keep the ISO date visible in lists while showing appointment hours in 12h. */
export function formatAppointmentDateTimeAr(timeStr?: string | null): string {
  if (!timeStr) return '';
  const [date, time] = timeStr.trim().split(/\s+/);
  return time ? `${date}، ${formatAppointmentTime12Ar(time)}` : date;
}
