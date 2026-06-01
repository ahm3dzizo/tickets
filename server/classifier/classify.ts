import { loadKeywordsFromDB, classifyFromKeywordsDB, invalidateKeywordCache } from "./keywords.js";
import {
  buildTypeToSpecialtyMap,
  findSupervisorsDB,
  invalidateReferenceCache,
} from "./db-helpers.js";
import { classifyWithGemini, geminiEnabled, learnFromGeminiResult } from "./gemini.js";

const MIN_CLASSIFY_SCORE = 3;

export interface ClassificationResult {
  primaryType: string;
  allTypes: string[];
  typeId: string | null;
  subType?: string | null;
  subTypeId?: string | null;
  confidence: number;
  source: string;
  reason?: string;
  suggestedNewType?: string | null;
  suggestedNewSubType?: string | null;
  alreadyClassified?: boolean;
}

/**
 * Main classification function.
 * Strategy: Keywords first (fast/free) → Gemini fallback (smart/free) → unclassified.
 */
export async function classifyTicket(
  description: string,
  projectId?: string,
  options?: { forceReclassify?: boolean; skipGemini?: boolean }
): Promise<ClassificationResult> {
  const keywords = await loadKeywordsFromDB();
  const kwResult = classifyFromKeywordsDB(description, keywords);

  // Keywords gave confident result → use it directly
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

  // Fallback to Gemini when enabled and not explicitly skipped (e.g. bulk import)
  if (!options?.skipGemini && geminiEnabled()) {
    try {
      const geminiResult = await classifyWithGemini(description);
      if (geminiResult && geminiResult.primaryType !== "unclassified") {
        // Auto-learn in background — don't block the response
        learnFromGeminiResult(description, geminiResult.allTypes).catch(() => {});

        return {
          primaryType: geminiResult.primaryType,
          allTypes:    geminiResult.allTypes,
          typeId:      null, // Gemini doesn't resolve DB ids — will be resolved later
          subType:     null,
          subTypeId:   null,
          confidence:  geminiResult.confidence,
          source:      "gemini",
          reason:      geminiResult.reason,
        };
      }
    } catch (err: any) {
      console.error("[classify] Gemini fallback error:", err.message);
    }
  }

  // Nothing matched — return unclassified
  return {
    primaryType: "unclassified",
    allTypes:    [],
    typeId:      null,
    subType:     null,
    subTypeId:   null,
    confidence:  kwResult.confidence,
    source:      "keywords",
  };
}

export { invalidateKeywordCache, invalidateReferenceCache };
export { buildTypeToSpecialtyMap, findSupervisorsDB };