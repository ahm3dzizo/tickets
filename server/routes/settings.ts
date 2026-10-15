import { Router } from 'express';
import { AuthRequest, requireAuth, requireAdmin, getRequesterRole } from '../auth.js';
import prisma from '../db.js';

const router = Router();

export interface TimePeriod {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface DailyWorkHours {
  hasMorning?:   boolean;
  morning:       TimePeriod;
  hasBreak?:     boolean;
  break:         TimePeriod;
  hasAfternoon?: boolean;
  afternoon:     TimePeriod;
}

export interface WorkHoursConfig extends DailyWorkHours {
  enabled: boolean;
  // 0 = Sunday, 5 = Friday, 6 = Saturday. Missing means legacy default.
  workingDays?: number[];
  // Optional per-day hours, inherited from the main hours when absent.
  dayOverrides?: Record<string, DailyWorkHours>;
}

export const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4, 6];

export interface WorkHoursSettings {
  default:   WorkHoursConfig;
  byProject: Record<string, WorkHoursConfig>;
}

const DEFAULT_WH_CONFIG: WorkHoursConfig = {
  enabled:      true,
  workingDays:  [...DEFAULT_WORKING_DAYS],
  hasMorning:   true,
  morning:      { start: '08:00', end: '12:00' },
  hasBreak:     true,
  break:        { start: '12:00', end: '13:00' },
  hasAfternoon: true,
  afternoon:    { start: '13:00', end: '16:00' },
};

export const DEFAULT_WORK_HOURS: WorkHoursSettings = {
  default:   DEFAULT_WH_CONFIG,
  byProject: {},
};

// ── helpers ──────────────────────────────────────────────────────────────────
export function toMins(hhmm: string): number {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function inPeriod(mins: number, p: TimePeriod): boolean {
  if (!p || !p.start || !p.end) return false;
  return mins >= toMins(p.start) && mins <= toMins(p.end);
}

export function inWorkHours(mins: number, cfg: WorkHoursConfig): boolean {
  if (!cfg.enabled) return true;
  const hasMorning = cfg.hasMorning !== false;
  const hasBreak = cfg.hasBreak !== false;
  const hasAfternoon = cfg.hasAfternoon !== false;

  // If time falls in break interval, it is not within work hours
  if (hasBreak && cfg.break && cfg.break.start && cfg.break.end) {
    const bs = toMins(cfg.break.start);
    const be = toMins(cfg.break.end);
    if (mins >= bs && mins < be) return false;
  }

  if (hasMorning && cfg.morning && inPeriod(mins, cfg.morning)) return true;
  if (hasAfternoon && cfg.afternoon && inPeriod(mins, cfg.afternoon)) return true;
  return false;
}

// UTC weekday prevents date-only appointments from changing day with the server timezone.
export function weekdayOf(dateStr: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return -1;
  const parsed = new Date(dateStr + 'T12:00:00Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateStr) return -1;
  return parsed.getUTCDay();
}

export function isWorkingDay(dateStr: string, cfg: WorkHoursConfig): boolean {
  const day = weekdayOf(dateStr);
  if (day === -1) return false;
  return !cfg.enabled || (cfg.workingDays ?? DEFAULT_WORKING_DAYS).includes(day);
}

export function getDateWorkHours(dateStr: string, cfg: WorkHoursConfig): WorkHoursConfig {
  const day = weekdayOf(dateStr);
  const override = day < 0 ? undefined : cfg.dayOverrides?.[String(day)];
  return override ? { ...cfg, ...override } : cfg;
}

export function autoCorrectMins(mins: number, cfg: WorkHoursConfig): number | null {
  if (inWorkHours(mins, cfg)) return mins;
  const hour = Math.floor(mins / 60);
  if (hour >= 1 && hour <= 11) {
    const pm = mins + 12 * 60;
    if (inWorkHours(pm, cfg)) return pm;
  } else if (hour >= 13 && hour <= 23) {
    const am = mins - 12 * 60;
    if (inWorkHours(am, cfg)) return am;
  }
  return null;
}

const DEFAULTS = {
  openingMsg:     `السلام عليكم، بخصوص بلاغ الصيانة رقم {ticketId} لوحدتكم {unitNumber}، نرجو إفادتنا بمواعيد تواجدكم في الفيلا لتنسيق موعد الصيانة. شكراً لتعاونكم.`,
  closingMsg:     `السلام عليكم، بخصوص بلاغ الصيانة رقم {ticketId} لوحدتكم رقم {unitNumber}، تم الانتهاء من الصيانة المطلوبة. نرجو التفضل بالتوقيع على نموذج الإغلاق المرفق.\nشكراً لتعاونكم.`,
  absentMsg:      `السلام عليكم،\nتم زيارة وحدتكم رقم {unitNumber} بخصوص بلاغ الصيانة #{ticketId}، ولم يتمكن الفريق من الدخول نظراً لعدم التواجد.\nيرجى رفع تذكرة جديدة عند تواجدكم لإعادة جدولة الزيارة.\nشكراً لتفهمكم.`,
  outOfScopeMsg:  `السلام عليكم،\nبخصوص بلاغ الصيانة #{ticketId} لوحدتكم رقم {unitNumber}، بعد المعاينة تبيّن أن المشكلة خارج نطاق الضمان.\nشكراً لتفهمكم.`,
};

// ─── GET /api/settings/whatsapp-templates ────────────────────────────────────
router.get('/whatsapp-templates', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'whatsapp_templates' } });
    const saved = (setting?.value ?? {}) as Record<string, string>;
    res.json({
      openingMsg:    saved.openingMsg    || DEFAULTS.openingMsg,
      closingMsg:    saved.closingMsg    || DEFAULTS.closingMsg,
      absentMsg:     saved.absentMsg     || DEFAULTS.absentMsg,
      outOfScopeMsg: saved.outOfScopeMsg || DEFAULTS.outOfScopeMsg,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/settings/whatsapp-templates ────────────────────────────────────
router.put('/whatsapp-templates', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { openingMsg, closingMsg, absentMsg, outOfScopeMsg } = req.body;
    if (!openingMsg || !closingMsg) {
      res.status(400).json({ error: 'openingMsg و closingMsg مطلوبان' });
      return;
    }
    const value = {
      openingMsg,
      closingMsg,
      absentMsg:     absentMsg     || DEFAULTS.absentMsg,
      outOfScopeMsg: outOfScopeMsg || DEFAULTS.outOfScopeMsg,
    };
    const updated = await prisma.systemSetting.upsert({
      where:  { key: 'whatsapp_templates' },
      update: { value },
      create: { key: 'whatsapp_templates', value },
    });
    res.json(updated.value);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/settings/work-hours ────────────────────────────────────────────
router.get('/work-hours', requireAuth, async (_req: AuthRequest, res) => {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'work_hours' } });
    res.json((setting?.value as unknown as WorkHoursSettings | undefined) || DEFAULT_WORK_HOURS);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/settings/work-hours ────────────────────────────────────────────
router.put('/work-hours', requireAuth, async (req: AuthRequest, res) => {
  try {
    const role = await getRequesterRole(req.uid!);
    const body = req.body as WorkHoursSettings;
    if (!body?.default || typeof body.byProject !== 'object' || body.byProject === null) {
      res.status(400).json({ error: 'بيانات أوقات الدوام غير صحيحة' });
      return;
    }
    const configs = [body.default, ...Object.values(body.byProject)];
    const validDays = (days?: number[]) => days === undefined || (
      Array.isArray(days) && days.every(d => Number.isInteger(d) && d >= 0 && d <= 6) &&
      new Set(days).size === days.length
    );
    const validOverrides = (days?: Record<string, DailyWorkHours>) => days === undefined || (
      !!days && !Array.isArray(days) && Object.entries(days).every(([key, val]) =>
        /^[0-6]$/.test(key) && !!val && typeof val === 'object'
      )
    );
    if (!configs.every(cfg => !!cfg && validDays(cfg.workingDays) && validOverrides(cfg.dayOverrides))) {
      res.status(400).json({ error: 'أيام العمل يجب أن تكون بين الأحد والسبت دون تكرار' });
      return;
    }

    const currentSetting = await prisma.systemSetting.findUnique({ where: { key: 'work_hours' } });
    const currentWH = (currentSetting?.value as unknown as WorkHoursSettings) || DEFAULT_WORK_HOURS;

    let finalValue = body;

    if (role !== 'admin') {
      const currentUser = await prisma.user.findUnique({
        where: { uid: req.uid! },
        select: { projects: { select: { id: true } } }
      });
      const myProjectIds = currentUser?.projects.map(p => p.id) || [];

      const newByProject = { ...(currentWH.byProject || {}) };
      for (const [pid, config] of Object.entries(body.byProject || {})) {
        if (myProjectIds.includes(pid)) {
          newByProject[pid] = config;
        }
      }
      for (const pid of myProjectIds) {
        if (!body.byProject || !body.byProject[pid]) {
          delete newByProject[pid];
        }
      }

      finalValue = {
        default: currentWH.default,
        byProject: newByProject
      };
    }

    const updated = await prisma.systemSetting.upsert({
      where:  { key: 'work_hours' },
      update: { value: finalValue as any },
      create: { key: 'work_hours', value: finalValue as any },
    });
    res.json(updated.value);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
