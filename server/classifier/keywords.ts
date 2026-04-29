import prisma from "../db.js";
import { CONFLICTING_PAIRS } from "../config.js";

// ── Cache ───────────────────────────────────────────────────────────────────
let _kwCache: { keyword: string; typeKey: string; weight: number }[] = [];
let _kwCacheTime = 0;
const KW_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function loadKeywordsFromDB(force = false) {
  if (!force && _kwCache.length > 0 && Date.now() - _kwCacheTime < KW_CACHE_TTL) {
    return _kwCache;
  }
  const rows = await prisma.ticketTypeKeyword.findMany({
    where: { typeId: { not: null }, ticketType: { isActive: true } },
    include: { ticketType: { select: { key: true } } },
  });
  _kwCache = rows
    .filter((r: any) => r.ticketType?.key)
    .map((r: any) => ({
      keyword: r.keyword,
      typeKey: r.ticketType.key,
      weight: r.weight,
    }));
  _kwCacheTime = Date.now();
  return _kwCache;
}

export function invalidateKeywordCache() {
  _kwCache = [];
  _kwCacheTime = 0;
}

// ── Classification from Keywords ────────────────────────────────────────────

export function classifyFromKeywordsDB(
  description: string,
  keywords: { keyword: string; typeKey: string; weight: number }[]
): { primaryType: string; allTypes: string[]; confidence: number } {
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
  const threshold = Math.max(3, maxScore * 0.5);

  // Filter candidates by threshold
  let candidates = sorted.filter(([, s]) => s >= threshold).map(([t]) => t);

  // Reduce electricity false positives
  if (candidates.includes("electricity") && candidates.length > 1) {
    const elecScore = scores["electricity"] || 0;
    if (elecScore < maxScore * 0.7) {
      candidates = candidates.filter((t) => t !== "electricity");
    }
  }

  // Limit candidates if one type dominates
  if (candidates.length > 3) {
    const secondScore = sorted[1]?.[1] || 0;
    if (maxScore > secondScore * 2.5) {
      candidates = [candidates[0]];
    } else if (maxScore > secondScore * 1.8) {
      candidates = candidates.slice(0, 2);
    }
  }

  // Remove conflicting pairs
  const conflictSet = new Set(
    CONFLICTING_PAIRS.filter(
      ([a, b]) => candidates.includes(a) && candidates.includes(b)
    ).flat()
  );
  if (conflictSet.size > 0) {
    const keep = new Map<string, number>();
    for (const c of candidates) {
      keep.set(c, scores[c] || 0);
    }
    for (const [a, b] of CONFLICTING_PAIRS) {
      if (keep.has(a) && keep.has(b)) {
        const [loser] = (keep.get(a) || 0) >= (keep.get(b) || 0) ? [b] : [a];
        keep.delete(loser);
      }
    }
    candidates = [...keep.keys()];
  }

  if (candidates.length === 0) candidates = [sorted[0][0]];
  return { primaryType: candidates[0], allTypes: candidates, confidence: maxScore };
}
