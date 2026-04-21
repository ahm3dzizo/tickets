/**
 * Background AI enrichment for imported tickets.
 *
 * After bulk import (which uses fast rule-based classification), this service
 * runs classifyTicketSmart + findMatchingSupervisors on each ticket sequentially
 * with a delay between calls to stay within Gemini rate limits (15 RPM free tier).
 *
 * Called without `await` — intentional fire-and-forget.
 */

import { ticketsApi } from '@/lib/api';
import { classifyTicketSmart } from './ticketClassifier';
import { findMatchingSupervisors } from './supervisorAssignment';

export interface EnrichJob {
  ticketId: string;
  description: string;
  projectId: string;
}

export interface EnrichProgress {
  done: number;
  total: number;
  failed: number;
  finished: boolean;
}

/** ms to wait between each Gemini call — 7s = ~8 RPM, safely under the 15 RPM free tier limit */
const DELAY_MS = 7000;

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

/**
 * Process jobs one-by-one with a delay.
 * Updates each ticket doc with AI-detected type + matched supervisors.
 * Safe to call without await.
 */
export async function scheduleAiEnrichment(
  jobs: EnrichJob[],
  onProgress?: (p: EnrichProgress) => void
): Promise<void> {
  let done = 0;
  let failed = 0;
  const total = jobs.length;

  for (const job of jobs) {
    try {
      await sleep(DELAY_MS);

      const classification = await classifyTicketSmart(job.description);

      const supervisors = job.projectId
        ? await findMatchingSupervisors(job.projectId, classification.requiredSpecialties)
        : [];
      const primary = supervisors[0];

      await ticketsApi.update(job.ticketId, {
        type:                  classification.primaryType,
        detectedTypes:         classification.allTypes,
        aiConfidence:          classification.confidence,
        assignedSupervisorId:  primary?.id  || '',
        assignedSupervisorIds: supervisors.map(s => s.id),
        assignedSupervisors:   supervisors,
        ...(primary?.name ? { assigneeName: primary.name } : {}),
        aiEnriched: true,
      });

      done++;
    } catch {
      failed++;
      done++; // count as processed even if failed
    }

    onProgress?.({ done, total, failed, finished: done === total });
  }
}
