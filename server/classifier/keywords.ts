import prisma from "../db.js";
import { CONFLICTING_PAIRS } from "../config.js";

interface KeywordData {
  keyword: string;
  typeKey: string;
  typeDbId: string;        // TicketType.id (DB uuid)
  subType: string | null;  // TicketSubType.nameAr  (للعرض)
  subTypeId: string | null; // TicketSubType.id (DB uuid)
  weight: number;
}

// ── Cache ───────────────────────────────────────────────────────────────────
let _kwCache: KeywordData[] = [];
let _kwCacheTime = 0;
const KW_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

let _kwCachePromise: Promise<KeywordData[]> | null = null;

export async function loadKeywordsFromDB(force = false): Promise<KeywordData[]> {
  if (!force && _kwCache.length > 0 && Date.now() - _kwCacheTime < KW_CACHE_TTL) {
    return _kwCache;
  }

  if (_kwCachePromise && !force) {
    return _kwCachePromise;
  }

  _kwCachePromise = (async () => {
    const rows = await prisma.ticketTypeKeyword.findMany({
      where: { typeId: { not: null }, ticketType: { isActive: true } },
      include: {
        ticketType: { select: { id: true, key: true } },
        subType:    { select: { id: true, nameAr: true } },
      },
    });

    _kwCache = rows
      .filter((r: any) => r.ticketType?.key)
      .map((r: any) => ({
        keyword:    normalizeArabic(r.keyword),
        typeKey:    r.ticketType.key,
        typeDbId:   r.typeId!,
        subType:    r.subType?.nameAr  || null,
        subTypeId:  r.subType?.id      || null,
        weight:     r.weight,
      }));
    _kwCacheTime = Date.now();
    return _kwCache;
  })();

  try {
    return await _kwCachePromise;
  } finally {
    _kwCachePromise = null;
  }
}

export function invalidateKeywordCache() {
  _kwCache = [];
  _kwCacheTime = 0;
}

// ── Arabic Text Normalization ───────────────────────────────────────────────
export function normalizeArabic(text: string): string {
  if (!text) return "";
  let normalized = text.toLowerCase();

  // Remove diacritics (tashkeel)
  normalized = normalized.replace(/[ؗ-ًؚ-ْ]/g, "");

  // Normalize Alef variants → ا
  normalized = normalized.replace(/[أإآ]/g, "ا");

  // Normalize Ta-Marbuta → ه
  normalized = normalized.replace(/ة/g, "ه");

  // Normalize Ya / Alif-Maksura → ي
  normalized = normalized.replace(/[ىي]/g, "ي");

  // Strip Waw-al-jama3a / Ya-al-nisbah suffixes for better conjugation matching
  normalized = normalized.replace(/ون(s|$)/g, " ");
  normalized = normalized.replace(/ين(s|$)/g, " ");

  // Clean punctuation — keep Arabic letters + spaces + alphanumeric
  normalized = normalized.replace(/[^ws؀-ۿ]/g, " ");
  normalized = normalized.replace(/s+/g, " ").trim();

  // Strip Arabic definite article and common preposition+article combos (word by word)
  normalized = normalized
    .split(" ")
    .map((word) => {
      if (word.length <= 2) return word;
      if (word.length > 5 && (word.startsWith("بال") || word.startsWith("وال") || word.startsWith("فال") || word.startsWith("كال")))
        return word.slice(3);
      if (word.length > 4 && word.startsWith("لل")) return word.slice(2);
      if (word.length > 4 && word.startsWith("ال")) return word.slice(2);
      return word;
    })
    .join(" ");

  return normalized.replace(/s+/g, " ").trim();
}

// ── Classification from Keywords ────────────────────────────────────────────
export function classifyFromKeywordsDB(
  description: string,
  keywords: KeywordData[]
): {
  primaryType: string;
  allTypes: string[];
  typeId: string | null;
  subType: string | null;
  subTypeId: string | null;
  confidence: number;
} {
  const normalizedDesc = normalizeArabic(description);

  const typeScores:   Record<string, number> = {};
  // subTypeScores[typeKey][subTypeNameAr] = score
  const subTypeScores: Record<string, Record<string, number>> = {};
  // typeDbIdMap[typeKey] = DB uuid
  const typeDbIdMap:  Record<string, string> = {};
  // subTypeIdMap[typeKey][subTypeNameAr] = DB uuid
  const subTypeIdMap: Record<string, Record<string, string>> = {};

  for (const kw of keywords) {
    // Keep a map of typeKey → typeDbId for later lookup
    if (!typeDbIdMap[kw.typeKey]) typeDbIdMap[kw.typeKey] = kw.typeDbId;

    if (kw.subType && kw.subTypeId) {
      if (!subTypeIdMap[kw.typeKey]) subTypeIdMap[kw.typeKey] = {};
      if (!subTypeIdMap[kw.typeKey][kw.subType])
        subTypeIdMap[kw.typeKey][kw.subType] = kw.subTypeId;
    }

    const isPhrase = kw.keyword.includes(" ");
    let matchCount = 0;

    if (isPhrase) {
      if (normalizedDesc.includes(kw.keyword)) matchCount = 1;
    } else {
      const regex = new RegExp(`(?:^|\\s)${kw.keyword}(?:\\s|$)`, "g");
      const matches = normalizedDesc.match(regex);
      if (matches) {
        matchCount = matches.length;
      } else if (normalizedDesc.includes(kw.keyword) && kw.keyword.length >= 6) {
        matchCount = 0.7;
      } else if (normalizedDesc.includes(kw.keyword) && kw.keyword.length >= 4) {
        matchCount = 0.4;
      }
    }

    if (matchCount > 0) {
      const scoreAddition = kw.weight * matchCount * (isPhrase ? 1.5 : 1);
      typeScores[kw.typeKey] = (typeScores[kw.typeKey] || 0) + scoreAddition;

      if (kw.subType) {
        if (!subTypeScores[kw.typeKey]) subTypeScores[kw.typeKey] = {};
        subTypeScores[kw.typeKey][kw.subType] =
          (subTypeScores[kw.typeKey][kw.subType] || 0) + scoreAddition;
      }
    }
  }

  const MIN_CLASSIFY_SCORE = 1;

  const sortedTypes = Object.entries(typeScores).sort((a, b) => b[1] - a[1]);
  if (sortedTypes.length === 0) {
    return { primaryType: "unclassified", allTypes: [], typeId: null, subType: null, subTypeId: null, confidence: 0 };
  }

  const maxScore = sortedTypes[0][1];
  if (maxScore < MIN_CLASSIFY_SCORE) {
    return { primaryType: "unclassified", allTypes: [], typeId: null, subType: null, subTypeId: null, confidence: maxScore };
  }

  const threshold = Math.max(1, maxScore * 0.5);
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
  const keep = new Map<string, number>(candidates.map((c) => [c, typeScores[c] || 0]));
  for (const [a, b] of CONFLICTING_PAIRS) {
    if (keep.has(a) && keep.has(b)) {
      const loser = (keep.get(a) || 0) >= (keep.get(b) || 0) ? b : a;
      keep.delete(loser);
    }
  }
  candidates = keep.size > 0 ? [...keep.keys()] : [sortedTypes[0][0]];

  const primaryType = candidates[0];

  // ── Determine best sub-type for primary type ──
  let bestSubType:   string | null = null;
  let bestSubTypeId: string | null = null;
  if (subTypeScores[primaryType]) {
    const sortedSubs = Object.entries(subTypeScores[primaryType]).sort((a, b) => b[1] - a[1]);
    if (sortedSubs.length > 0) {
      bestSubType   = sortedSubs[0][0];
      bestSubTypeId = subTypeIdMap[primaryType]?.[bestSubType] ?? null;
    }
  }

  return {
    primaryType,
    allTypes:   candidates,
    typeId:     typeDbIdMap[primaryType] ?? null,
    subType:    bestSubType,
    subTypeId:  bestSubTypeId,
    confidence: maxScore,
  };
}
