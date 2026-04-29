import { GEMINI_API_KEY, VALID_TYPES } from "../config.js";
import { loadKeywordsFromDB, classifyFromKeywordsDB, invalidateKeywordCache } from "./keywords.js";
import {
  classifyWithGeminiEnhanced,
  buildTypeToSpecialtyMap,
  findSupervisorsDB,
  autoLearnFromClassification,
  learnNewTypeFromGemini,
  learnNewSubTypeFromGemini,
  invalidateReferenceCache,
} from "./gemini.js";

export interface ClassificationResult {
  primaryType: string;
  allTypes: string[];
  subType?: string | null;         // ← NEW: التصنيف الفرعي
  confidence: number;
  source: string;
  reason?: string;
  suggestedNewType?: string | null;
  suggestedNewSubType?: string | null;
  alreadyClassified?: boolean;     // ← NEW: عشان نوفر تكلفة
}

/**
 * Main classification function — tries Gemini first, falls back to keywords.
 * NOW: includes subType, and skips gemini for already-classified tickets
 */
export async function classifyTicket(
  description: string,
  projectId?: string,
  options?: { forceReclassify?: boolean }  // ← NEW: force لو عايز تصنيف جديد
): Promise<ClassificationResult> {
  // 1) Gemini AI with full context
  if (GEMINI_API_KEY) {
    const geminiResult = await classifyWithGeminiEnhanced(description, projectId);
    if (geminiResult && VALID_TYPES.includes(geminiResult.primaryType)) {
      console.log(`  ✅ Gemini classified: ${geminiResult.primaryType} (confidence=${geminiResult.confidence})`);

      if (typeof geminiResult.suggestedNewType === "string" && geminiResult.suggestedNewType) {
        learnNewTypeFromGemini(geminiResult.suggestedNewType, geminiResult.primaryType, description).catch(() => {});
      }
      if (typeof geminiResult.suggestedNewSubType === "string" && geminiResult.suggestedNewSubType) {
        learnNewSubTypeFromGemini(geminiResult.primaryType, geminiResult.suggestedNewSubType, description).catch(() => {});
      }

      return {
        primaryType: geminiResult.primaryType,
        allTypes: geminiResult.allTypes,
        subType: geminiResult.suggestedNewSubType || null,
        confidence: geminiResult.confidence,
        source: "gemini",
        reason: geminiResult.reason,
        suggestedNewType: geminiResult.suggestedNewType,
        suggestedNewSubType: geminiResult.suggestedNewSubType,
      };
    }
    console.log(`  ⚠️ Gemini result invalid (primaryType="${geminiResult?.primaryType}" not in valid types), falling back to keywords`);
  }

  // 2) Keyword-based fallback
  const keywords = await loadKeywordsFromDB();
  const kwResult = classifyFromKeywordsDB(description, keywords);
  return {
    primaryType: kwResult.primaryType,
    allTypes: kwResult.allTypes,
    subType: null,                  // ← keywords مش بتدعم subType
    confidence: kwResult.confidence,
    source: "keywords",
  };
}

export { invalidateKeywordCache, invalidateReferenceCache };
export { buildTypeToSpecialtyMap, findSupervisorsDB, autoLearnFromClassification };
