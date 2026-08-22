import { loadKeywordsFromDB, classifyFromKeywordsDB, invalidateKeywordCache, normalizeArabic } from "./keywords.js";
import {
  buildTypeToSpecialtyMap,
  findSupervisorsDB,
  invalidateReferenceCache,
} from "./db-helpers.js";
import { classifyWithGemini, geminiEnabled, isUsingNara, learnFromGeminiResult } from "./gemini.js";
import { classifyWithML, mlServiceAvailable } from "./ml-client.js";

// ML confidence threshold — below this, fall back to Gemini
const ML_CONFIDENCE_THRESHOLD = 0.70;
// Lower threshold for types with limited training data
const LOW_SAMPLE_TYPES = new Set(['cracks', 'structural', 'pumps', 'garage_door']);
const ML_LOW_SAMPLE_THRESHOLD = 0.30;

// Keyword fallback threshold (used when ML service is down)
const MIN_CLASSIFY_SCORE = 2;

// ── bynara Rate Limiter (sliding window) ──────────────────────────────────
// Free plan: 10 requests/minute
const NARA_RPM_LIMIT = 10;
const _naraCallTimestamps: number[] = [];

function naraQuotaAvailable(): boolean {
  const now = Date.now();
  // Remove timestamps older than 60 seconds
  while (_naraCallTimestamps.length > 0 && now - _naraCallTimestamps[0] > 60_000) {
    _naraCallTimestamps.shift();
  }
  return _naraCallTimestamps.length < NARA_RPM_LIMIT;
}

function naraMarkUsed(): void {
  _naraCallTimestamps.push(Date.now());
}

function naraQuotaStatus(): string {
  const now = Date.now();
  const active = _naraCallTimestamps.filter(t => now - t <= 60_000).length;
  return `${active}/${NARA_RPM_LIMIT} req/min`;
}

export interface ClassificationResult {
  primaryType:    string;
  allTypes:       string[];
  typeId:         string | null;
  subType?:       string | null;
  subTypeId?:     string | null;
  allSubTypeIds?: string[];   // one sub-type ID per detected type (from AI per-type matching)
  confidence:     number;
  source:         string;
  reason?:        string;
  suggestedNewType?:    string | null;
  suggestedNewSubType?: string | null;
  alreadyClassified?:  boolean;
}

/**
 * Main classification pipeline:
 * 1. NaraRouter/Gemini AI — primary (best accuracy)
 * 2. ML model (TF-IDF + Logistic Regression) — fallback when Gemini unavailable
 * 3. Keyword matching — last resort
 * 4. unclassified
 */
export async function classifyTicket(
  description: string,
  projectId?: string,
  options?: { forceReclassify?: boolean; skipGemini?: boolean }
): Promise<ClassificationResult> {

  // Load keywords once — used for override check and fallbacks
  const keywords = await loadKeywordsFromDB();

  // ── 1. AI (OpenRouter primary, NaraRouter fallback) ──────────────────────
  // NaraRouter rate-limited to 10 req/min; OpenRouter has no local quota guard
  if (!options?.skipGemini && geminiEnabled()) {
    const useNara = isUsingNara();
    const canCall = !useNara || naraQuotaAvailable();

    if (canCall) {
      if (useNara) naraMarkUsed();
      try {
        const geminiResult = await classifyWithGemini(description);
        if (geminiResult && geminiResult.primaryType !== "unclassified") {
          console.log(`[classify] ✅ gemini → types=${geminiResult.allTypes.join(',')} conf=${geminiResult.confidence} | "${description.slice(0,80)}"`);
          learnFromGeminiResult(description, geminiResult.allTypes).catch(() => {});
          return {
            primaryType:  geminiResult.primaryType,
            allTypes:     geminiResult.allTypes,
            typeId:       null,
            subType:      geminiResult.subTypeNameAr ?? null,
            subTypeId:    geminiResult.subTypeId ?? null,
            allSubTypeIds: geminiResult.allSubTypeIds,
            confidence:   geminiResult.confidence,
            source:       "gemini",
            reason:       geminiResult.reason,
          };
        } else {
          console.log(`[classify] gemini returned unclassified | "${description.slice(0,80)}"`);
        }
      } catch (err: any) {
        if (err.message?.includes('429') || err.message?.includes('rate')) {
          if (useNara) _naraCallTimestamps.pop();
          console.warn("[classify] AI 429 — rate limited, falling back to ML");
        } else {
          console.error("[classify] AI primary error:", err.message);
        }
      }
    } else {
      console.log(`[classify] NaraRouter quota full (${naraQuotaStatus()}) — using ML`);
    }
  }

  // ── 2. ML model — fallback when Gemini unavailable/failed ──────────────
  const mlResult = await classifyWithML(description);

  if (mlResult && mlResult.primaryType !== "unclassified") {
    const threshold = LOW_SAMPLE_TYPES.has(mlResult.primaryType)
      ? ML_LOW_SAMPLE_THRESHOLD
      : ML_CONFIDENCE_THRESHOLD;

    console.log(`[classify] ML → type=${mlResult.primaryType} conf=${mlResult.confidence.toFixed(2)} threshold=${threshold} | "${description.slice(0,80)}"`);

    if (mlResult.confidence >= threshold) {
      // Keyword override: if keywords strongly signal a DIFFERENT type (score >= 7),
      // prefer keywords over the ML result. Catches cases where ML was trained on
      // mislabeled data (e.g., "تشققات" → paints, "رطوبة" → paints).
      const KEYWORD_OVERRIDE_SCORE = 7;
      const kwCheck = classifyFromKeywordsDB(description, keywords);
      if (
        kwCheck.primaryType !== "unclassified" &&
        kwCheck.primaryType !== mlResult.primaryType &&
        kwCheck.confidence >= KEYWORD_OVERRIDE_SCORE
      ) {
        console.log(`[classify] ✅ keywords_override → ${mlResult.primaryType} → ${kwCheck.primaryType} (kw_score=${kwCheck.confidence}) | "${description.slice(0,80)}"`);
        return {
          primaryType: kwCheck.primaryType,
          allTypes:    kwCheck.allTypes,
          typeId:      kwCheck.typeId,
          subType:     kwCheck.subType,
          subTypeId:   kwCheck.subTypeId,
          confidence:  kwCheck.confidence,
          source:      "keywords_override",
        };
      }

      // ML service now returns subType directly — use it, then resolve IDs
      console.log(`[classify] ✅ ml → type=${mlResult.primaryType} allTypes=${mlResult.allTypes.join(',')} conf=${mlResult.confidence.toFixed(2)}`);
      const [typeId, subTypeId] = await Promise.all([
        resolveTypeId(mlResult.primaryType),
        mlResult.subType ? resolveSubTypeId(mlResult.subType, mlResult.primaryType) : Promise.resolve(null),
      ]);
      return {
        primaryType: mlResult.primaryType,
        allTypes:    mlResult.allTypes,
        typeId,
        subType:     mlResult.subType ?? null,
        subTypeId,
        confidence:  mlResult.confidence,
        source:      "ml",
      };
    }

    // ML not confident enough → try keywords before accepting low-confidence ML
    const kwFallback = classifyFromKeywordsDB(description, keywords);
    if (kwFallback.primaryType !== "unclassified" && kwFallback.confidence >= MIN_CLASSIFY_SCORE) {
      console.log(`[classify] ✅ keywords (ML low-conf) → type=${kwFallback.primaryType} kw_score=${kwFallback.confidence} | "${description.slice(0,80)}"`);
      return {
        primaryType: kwFallback.primaryType,
        allTypes:    kwFallback.allTypes,
        typeId:      kwFallback.typeId,
        subType:     kwFallback.subType,
        subTypeId:   kwFallback.subTypeId,
        confidence:  kwFallback.confidence,
        source:      "keywords",
      };
    }

    // Last resort: return low-confidence ML result
    console.log(`[classify] ✅ ml_low_confidence → type=${mlResult.primaryType} conf=${mlResult.confidence.toFixed(2)} | "${description.slice(0,80)}"`);
    const [typeId, subTypeId] = await Promise.all([
      resolveTypeId(mlResult.primaryType),
      mlResult.subType ? resolveSubTypeId(mlResult.subType, mlResult.primaryType) : Promise.resolve(null),
    ]);
    return {
      primaryType: mlResult.primaryType,
      allTypes:    mlResult.allTypes,
      typeId,
      subType:     mlResult.subType ?? null,
      subTypeId,
      confidence:  mlResult.confidence,
      source:      "ml_low_confidence",
    };
  }

  // ── 3. Keyword matching — last resort ───────────────────────────────────
  const kwResult = classifyFromKeywordsDB(description, keywords);

  if (kwResult.primaryType !== "unclassified" && kwResult.confidence >= MIN_CLASSIFY_SCORE) {
    console.log(`[classify] ✅ keywords → type=${kwResult.primaryType} kw_score=${kwResult.confidence} | "${description.slice(0,80)}"`);
    return {
      primaryType: kwResult.primaryType,
      allTypes:    kwResult.allTypes,
      typeId:      kwResult.typeId,
      subType:     kwResult.subType,
      subTypeId:   kwResult.subTypeId,
      confidence:  kwResult.confidence,
      source:      "keywords",
    };
  }

  // ── 4. Unclassified ─────────────────────────────────────────────────────
  console.log(`[classify] ❌ unclassified | "${description.slice(0,80)}"`);
  return {
    primaryType: "unclassified",
    allTypes:    [],
    typeId:      null,
    confidence:  0,
    source:      "none",
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
import prisma from "../db.js";

const _typeIdCache: Record<string, string> = {};

async function resolveTypeId(typeKey: string): Promise<string | null> {
  if (_typeIdCache[typeKey]) return _typeIdCache[typeKey];
  const t = await prisma.ticketType.findUnique({ where: { key: typeKey }, select: { id: true } });
  if (t) _typeIdCache[typeKey] = t.id;
  return t?.id ?? null;
}

/** Resolve a sub-type nameAr → DB id for a given parent type key */
async function resolveSubTypeId(nameAr: string, typeKey: string): Promise<string | null> {
  const typeId = await resolveTypeId(typeKey);
  if (!typeId) return null;
  const sub = await prisma.ticketSubType.findFirst({
    where: { nameAr, parentTypeId: typeId },
    select: { id: true },
  });
  return sub?.id ?? null;
}

/** Call ML service for sub-type (used as fallback when Gemini classifies) */
async function resolveSubTypeFromML(description: string, typeKey: string): Promise<[string | null, string | null]> {
  try {
    const mlResult = await classifyWithML(description);
    if (mlResult?.subType && mlResult.primaryType === typeKey) {
      const subTypeId = await resolveSubTypeId(mlResult.subType, typeKey);
      return [mlResult.subType, subTypeId];
    }
  } catch { /* non-fatal */ }
  return [null, null];
}

/**
 * Keyword-based sub-type detection (legacy fallback when ML service is down).
 * Only looks at keywords that belong to the given typeKey.
 */
async function detectSubType(
  description: string,
  typeKey: string
): Promise<{ subType: string | null; subTypeId: string | null }> {
  try {
    const keywords = await loadKeywordsFromDB();
    // Only sub-type keywords for this specific type
    const subKws = keywords.filter(kw => kw.typeKey === typeKey && kw.subType && kw.subTypeId);
    if (subKws.length === 0) return { subType: null, subTypeId: null };

    // Use the same normalizeArabic as loadKeywordsFromDB to ensure consistent matching
    const normDesc = normalizeArabic(description);

    // Score each sub-type
    const scores: Record<string, number> = {};
    const idMap: Record<string, string> = {};

    for (const kw of subKws) {
      if (!normDesc.includes(kw.keyword)) continue;
      scores[kw.subType!] = (scores[kw.subType!] || 0) + kw.weight;
      idMap[kw.subType!] = kw.subTypeId!;
    }

    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    // Require minimum score of 3 — avoids sub-type from a single generic low-weight keyword
    if (!best || best[1] < 3) return { subType: null, subTypeId: null };

    return { subType: best[0], subTypeId: idMap[best[0]] };
  } catch {
    return { subType: null, subTypeId: null };
  }
}

export { invalidateKeywordCache, invalidateReferenceCache };
export { buildTypeToSpecialtyMap, findSupervisorsDB };
