/**
 * classifierService.ts
 * ──────────────────────
 * خدمة التصنيف الجديدة — بتقرأ الكلمات المفتاحية وأنواع التذاكر
 * من قاعدة البيانات بدل ما تكون Hardcoded في السيرفر.
 * 
 * استخدم بدل classifyTicketSrv القديمة في server.ts
 */

import type { Specialty, TicketType } from "@/types";

export interface ClassificationResult {
  primaryType: string;
  allTypes: string[];
  confidence: number;
}

export interface SupervisorMatch {
  id: string;
  name: string;
  specialties: string[];
}

// ── التخصص الافتراضي لكل نوع (fallback لو مفيش علاقة في DB) ──
const FALLBACK_SPECIALTY_MAP: Record<string, string> = {
  plumbing: "mechanics",
  drainage: "mechanics",
  ac_ventilation: "mechanics",
  pumps: "mechanics",
  electricity: "electricity",
  tank_insulation: "general",
  doors: "general",
  doors_windows: "general",
  cracks: "general",
  paints: "general",
  painting: "general",
  ceramics: "general",
  tiles: "general",
  waterproofing: "general",
  grading: "general",
  pest_control: "general",
  cleaning: "general",
  structural: "general",
};

/**
 * يُنفذ التصنيف بناءً على جدول الكلمات من قاعدة البيانات
 * بدلTYPE_KEYWORDS_SRV اللي كان Hardcoded في server.ts
 */
export function classifyFromKeywords(
  description: string,
  keywords: { keyword: string; typeKey: string; weight: number }[]
): ClassificationResult {
  const text = description.toLowerCase();
  const scores: Record<string, number> = {};

  for (const kw of keywords) {
    if (text.includes(kw.keyword)) {
      scores[kw.typeKey] = (scores[kw.typeKey] || 0) + kw.weight;
    }
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) {
    return { primaryType: "plumbing", allTypes: ["plumbing"], confidence: 0 };
  }

  const maxScore = sorted[0][1];
  const allTypes = sorted.filter(([, s]) => s >= maxScore * 0.4).map(([t]) => t);
  return { primaryType: allTypes[0], allTypes, confidence: maxScore };
}

/**
 * إرجاع التخصصات المطلوبة من types المستخرجة
 */
export function getRequiredSpecialties(
  types: string[],
  typeToSpecialtyMap?: Record<string, string>
): string[] {
  const map = typeToSpecialtyMap || FALLBACK_SPECIALTY_MAP;
  return [...new Set(types.map((t) => map[t] || "general"))];
}

/**
 * تطابق المشرفين حسب التخصصات المطلوبة والمشروع
 */
export function matchSupervisors(
  supervisors: { id: string; name: string; specialties: string[] }[],
  requiredSpecialties: string[]
): { id: string; name: string; specialties: string[] }[] {
  const getSpecs = (u: { id: string; name: string; specialties: string[] }): string[] => {
    if (Array.isArray(u.specialties) && u.specialties.length > 0) return u.specialties;
    return ["general"];
  };

  const matched = supervisors.filter((s) =>
    getSpecs(s).some((sp) => requiredSpecialties.includes(sp))
  );
  if (matched.length > 0) return matched;

  // Fallback للمشرفين اللي تخصصهم general
  const fallback = supervisors.filter((s) => getSpecs(s).includes("general"));
  return fallback.length > 0 ? fallback : supervisors;
}
