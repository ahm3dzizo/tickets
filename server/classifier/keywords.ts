import prisma from "../db.js";
import { CONFLICTING_PAIRS } from "../config.js";

interface KeywordData {
  keyword: string;
  typeKey: string;
  subType?: string | null;
  weight: number;
}

// ── Cache ───────────────────────────────────────────────────────────────────
let _kwCache: KeywordData[] = [];
let _kwCacheTime = 0;
const KW_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function loadKeywordsFromDB(force = false): Promise<KeywordData[]> {
  if (!force && _kwCache.length > 0 && Date.now() - _kwCacheTime < KW_CACHE_TTL) {
    return _kwCache;
  }
  const rows = await prisma.ticketTypeKeyword.findMany({
    where: { typeId: { not: null }, ticketType: { isActive: true } },
    include: { 
      ticketType: { select: { key: true } },
      subType: { select: { nameAr: true } }
    },
  });
  
  _kwCache = rows
    .filter((r: any) => r.ticketType?.key)
    .map((r: any) => ({
      keyword: normalizeArabic(r.keyword),
      typeKey: r.ticketType.key,
      subType: r.subType?.nameAr || null,
      weight: r.weight,
    }));
  _kwCacheTime = Date.now();
  return _kwCache;
}

export function invalidateKeywordCache() {
  _kwCache = [];
  _kwCacheTime = 0;
}

// ── Arabic Text Normalization ───────────────────────────────────────────────
export function normalizeArabic(text: string): string {
  if (!text) return "";
  let normalized = text.toLowerCase();
  
  // Remove diacritics
  normalized = normalized.replace(/[\u0617-\u061A\u064B-\u0652]/g, "");
  
  // Normalize Alef
  normalized = normalized.replace(/[أإآ]/g, "ا");
  
  // Normalize Ta-Marbuta to Ha
  normalized = normalized.replace(/ة/g, "ه");
  
  // Normalize Ya/Alif-Maksura
  normalized = normalized.replace(/[ىي]/g, "ي");
  
  // Clean punctuations and extra spaces
  normalized = normalized.replace(/[^\w\s\u0600-\u06FF]/g, " ");
  normalized = normalized.replace(/\s+/g, " ").trim();
  
  return normalized;
}

// ── Classification from Keywords ────────────────────────────────────────────
export function classifyFromKeywordsDB(
  description: string,
  keywords: KeywordData[]
): { primaryType: string; allTypes: string[]; subType: string | null; confidence: number } {
  const normalizedDesc = normalizeArabic(description);
  
  const typeScores: Record<string, number> = {};
  const subTypeScores: Record<string, Record<string, number>> = {}; // { typeKey: { subType: score } }
  
  // Tokenize description to check exact word boundaries for single words
  // But also allow phrase matching
  
  for (const kw of keywords) {
    const isPhrase = kw.keyword.includes(" ");
    let matchCount = 0;

    if (isPhrase) {
      // Phrase matching
      if (normalizedDesc.includes(kw.keyword)) {
        matchCount = 1; // Count once for the whole phrase
      }
    } else {
      // Word boundary matching for single words
      const regex = new RegExp(`(?:^|\\s)${kw.keyword}(?:\\s|$)`, 'g');
      const matches = normalizedDesc.match(regex);
      if (matches) {
        matchCount = matches.length;
      } else if (normalizedDesc.includes(kw.keyword) && kw.keyword.length >= 4) {
        // Fallback for long words that might be conjugated
        matchCount = 0.5;
      }
    }

    if (matchCount > 0) {
      const scoreAddition = kw.weight * matchCount * (isPhrase ? 1.5 : 1); // Boost phrases
      typeScores[kw.typeKey] = (typeScores[kw.typeKey] || 0) + scoreAddition;
      
      if (kw.subType) {
        if (!subTypeScores[kw.typeKey]) subTypeScores[kw.typeKey] = {};
        subTypeScores[kw.typeKey][kw.subType] = (subTypeScores[kw.typeKey][kw.subType] || 0) + scoreAddition;
      }
    }
  }

  const sortedTypes = Object.entries(typeScores).sort((a, b) => b[1] - a[1]);
  if (sortedTypes.length === 0) {
    return { primaryType: "plumbing", allTypes: ["plumbing"], subType: null, confidence: 0 };
  }

  const maxScore = sortedTypes[0][1];
  const threshold = Math.max(3, maxScore * 0.5);

  let candidates = sortedTypes.filter(([, s]) => s >= threshold).map(([t]) => t);

  // Reduce electricity false positives
  if (candidates.includes("electricity") && candidates.length > 1) {
    const elecScore = typeScores["electricity"] || 0;
    if (elecScore < maxScore * 0.7) {
      candidates = candidates.filter((t) => t !== "electricity");
    }
  }

  if (candidates.length > 3) {
    const secondScore = sortedTypes[1]?.[1] || 0;
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
      keep.set(c, typeScores[c] || 0);
    }
    for (const [a, b] of CONFLICTING_PAIRS) {
      if (keep.has(a) && keep.has(b)) {
        const [loser] = (keep.get(a) || 0) >= (keep.get(b) || 0) ? [b] : [a];
        keep.delete(loser);
      }
    }
    candidates = [...keep.keys()];
  }

  if (candidates.length === 0) candidates = [sortedTypes[0][0]];
  const primaryType = candidates[0];
  
  // Determine subType
  let bestSubType: string | null = null;
  if (subTypeScores[primaryType]) {
    const sortedSubs = Object.entries(subTypeScores[primaryType]).sort((a, b) => b[1] - a[1]);
    if (sortedSubs.length > 0) {
      bestSubType = sortedSubs[0][0];
    }
  }

  return { 
    primaryType, 
    allTypes: candidates, 
    subType: bestSubType,
    confidence: maxScore 
  };
}
