import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAppointmentDayTime(timeStr?: string | null): string {
  if (!timeStr) return 'لم يحدد بعد';
  try {
    const parts = timeStr.split(' ');
    const d = new Date(parts[0]);
    if (isNaN(d.getTime())) return timeStr;
    const dayName = d.toLocaleDateString('ar-EG', { weekday: 'long' });
    return `${dayName} ${parts[1] || ''}`.trim();
  } catch {
    return timeStr;
  }
}
