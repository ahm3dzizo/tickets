import { loadKeywordsFromDB, classifyFromKeywordsDB, invalidateKeywordCache } from "./keywords.js";
import {
  buildTypeToSpecialtyMap,
  findSupervisorsDB,
  invalidateReferenceCache,
} from "./db-helpers.js";

export interface ClassificationResult {
  primaryType: string;
  allTypes: string[];
  subType?: string | null;
  confidence: number;
  source: string;
  reason?: string;
  suggestedNewType?: string | null;
  suggestedNewSubType?: string | null;
  alreadyClassified?: boolean;
}

/**
 * Main classification function — pure local NLP.
 */
export async function classifyTicket(
  description: string,
  projectId?: string,
  options?: { forceReclassify?: boolean }
): Promise<ClassificationResult> {
  const keywords = await loadKeywordsFromDB();
  const kwResult = classifyFromKeywordsDB(description, keywords);
  
  return {
    primaryType: kwResult.primaryType,
    allTypes: kwResult.allTypes,
    subType: kwResult.subType,
    confidence: kwResult.confidence,
    source: "keywords",
  };
}

export { invalidateKeywordCache, invalidateReferenceCache };
export { buildTypeToSpecialtyMap, findSupervisorsDB };