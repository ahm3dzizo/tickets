import { loadKeywordsFromDB, classifyFromKeywordsDB, invalidateKeywordCache } from "./keywords.js";
import {
  buildTypeToSpecialtyMap,
  findSupervisorsDB,
  invalidateReferenceCache,
} from "./db-helpers.js";
import { classifyWithGemini, geminiEnabled, learnFromGeminiResult } from "./gemini.js";
import { classifyWithML, mlServiceAvailable } from "./ml-client.js";

// ML confidence threshold — below this, fall back to Gemini
const ML_CONFIDENCE_THRESHOLD = 0.70;

// Keyword fallback threshold (used when ML service is down)
const MIN_CLASSIFY_SCORE = 2;

export interface ClassificationResult {
  primaryType: string;
  allTypes:    string[];
  typeId:      string | null;
  subType?:    string | null;
  subTypeId?:  string | null;
  confidence:  number;
  source:      string;
  reason?:     string;
  suggestedNewType?:    string | null;
  suggestedNewSubType?: string | null;
  alreadyClassified?:  boolean;
}

/**
 * Main classification pipeline:
 * 1. ML model (TF-IDF + Logistic Regression) — primary
 * 2. Gemini AI — fallback when ML confidence < 70%
 * 3. Keyword matching — last resort when ML service is down
 * 4. unclassified
 */
export async function classifyTicket(
  description: string,
  projectId?: string,
  options?: { forceReclassify?: boolean; skipGemini?: boolean }
): Promise<ClassificationResult> {

  // ── 1. ML model ────────────────────────────────────────────────────────
  const mlResult = await classifyWithML(description);

  if (mlResult && mlResult.primaryType !== "unclassified") {
    if (mlResult.confidence >= ML_CONFIDENCE_THRESHOLD) {
      const [typeId, { subType, subTypeId }] = await Promise.all([
        resolveTypeId(mlResult.primaryType),
        detectSubType(description, mlResult.primaryType),
      ]);
      return {
        primaryType: mlResult.primaryType,
        allTypes:    mlResult.allTypes,
        typeId,
        subType,
        subTypeId,
        confidence:  mlResult.confidence,
        source:      "ml",
      };
    }

    // ML not confident enough → try Gemini
    if (!options?.skipGemini && geminiEnabled()) {
      try {
        const geminiResult = await classifyWithGemini(description);
        if (geminiResult && geminiResult.primaryType !== "unclassified") {
          learnFromGeminiResult(description, geminiResult.allTypes).catch(() => {});
          const { subType, subTypeId } = await detectSubType(description, geminiResult.primaryType);
          return {
            primaryType: geminiResult.primaryType,
            allTypes:    geminiResult.allTypes,
            typeId:      null,
            subType,
            subTypeId,
            confidence:  geminiResult.confidence,
            source:      "gemini",
            reason:      geminiResult.reason,
          };
        }
      } catch (err: any) {
        console.error("[classify] Gemini fallback error:", err.message);
      }
    }

    // Gemini not available/failed → return low-confidence ML result
    const [typeId, { subType, subTypeId }] = await Promise.all([
      resolveTypeId(mlResult.primaryType),
      detectSubType(description, mlResult.primaryType),
    ]);
    return {
      primaryType: mlResult.primaryType,
      allTypes:    mlResult.allTypes,
      typeId,
      subType,
      subTypeId,
      confidence:  mlResult.confidence,
      source:      "ml_low_confidence",
    };
  }

  // ── 2. ML service is down → keyword fallback ────────────────────────────
  const keywords = await loadKeywordsFromDB();
  const kwResult = classifyFromKeywordsDB(description, keywords);

  if (kwResult.primaryType !== "unclassified" && kwResult.confidence >= MIN_CLASSIFY_SCORE) {
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

  // ── 3. Gemini last resort ───────────────────────────────────────────────
  if (!options?.skipGemini && geminiEnabled()) {
    try {
      const geminiResult = await classifyWithGemini(description);
      if (geminiResult && geminiResult.primaryType !== "unclassified") {
        learnFromGeminiResult(description, geminiResult.allTypes).catch(() => {});
        return {
          primaryType: geminiResult.primaryType,
          allTypes:    geminiResult.allTypes,
          typeId:      null,
          confidence:  geminiResult.confidence,
          source:      "gemini",
          reason:      geminiResult.reason,
        };
      }
    } catch (err: any) {
      console.error("[classify] Gemini error:", err.message);
    }
  }

  // ── 4. Unclassified ─────────────────────────────────────────────────────
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

/**
 * After ML gives us the main type, use keyword scoring to detect the best sub-type.
 * Only looks at keywords that belong to the given typeKey — avoids cross-type contamination.
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

    const normDesc = description
      .replace(/[ً-ِْ-ٰٟ]/g, "")
      .replace(/[أإآ]/g, "ا")
      .replace(/ة/g, "ه")
      .replace(/[ىي]/g, "ي")
      .toLowerCase();

    // Score each sub-type
    const scores: Record<string, number> = {};
    const idMap: Record<string, string> = {};

    for (const kw of subKws) {
      if (!normDesc.includes(kw.keyword)) continue;
      scores[kw.subType!] = (scores[kw.subType!] || 0) + kw.weight;
      idMap[kw.subType!] = kw.subTypeId!;
    }

    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    if (!best) return { subType: null, subTypeId: null };

    return { subType: best[0], subTypeId: idMap[best[0]] };
  } catch {
    return { subType: null, subTypeId: null };
  }
}

export { invalidateKeywordCache, invalidateReferenceCache };
export { buildTypeToSpecialtyMap, findSupervisorsDB };
