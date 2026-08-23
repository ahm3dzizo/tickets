/**
 * Client-side wrapper for server-side classification and supervisor matching.
 * The heavy logic (keyword scoring, supervisor lookup) now runs
 * on the server via a single API call, instead of bloating the frontend bundle.
 */

import type { TicketType, Specialty } from '@/types';
import { authStorage } from '@/lib/api';

// ── Auth helper ──────────────────────────────────────────────────────────────
export function getAuthHeaders(): Record<string, string> {
  const token = authStorage.getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ── Shared error handler ────────────────────────────────────────────────────
async function handleResponse(res: Response): Promise<any> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface ClassificationApiParams {
  description: string;
  projectId: string;
}

export interface ClassificationApiResult {
  primaryType: TicketType;
  allTypes: TicketType[];
  subType?: string;
  requiredSpecialties: Specialty[];
  confidence: number;
  source?: string;
  reason?: string;
  supervisors: { id: string; name: string; specialties: Specialty[] }[];
}

/**
 * Classify a ticket description and find matching supervisors in one server round-trip.
 */
export async function classifyOnServer(
  params: ClassificationApiParams
): Promise<ClassificationApiResult> {
  const res = await fetch('/api/classify', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });

  return handleResponse(res);
}

/**
 * Classify multiple tickets in bulk and get supervisors for each.
 */
export interface BulkClassifyItem {
  description: string;
  projectId: string;
}

export async function bulkClassifyOnServer(
  items: BulkClassifyItem[]
): Promise<ClassificationApiResult[]> {
  const res = await fetch('/api/classify/bulk', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ items }),
  });

  return handleResponse(res);
}

/**
 * Import tickets entirely on the server (classify + match + create).
 */
export interface ServerImportParams {
  projectId: string;
  tickets: {
    ticketId?: string;
    refNumber?: string;
    clientId?: string;
    clientName?: string;
    unitNumber?: string;
    description?: string;
    type?: string;
    priority?: number | string;
    issuedAt?: string;
  }[];
}

export interface ServerImportResult {
  imported: number;
  skipped: number;
  errors: { index: number; reason: string }[];
}

export async function importTicketsOnServer(
  params: ServerImportParams
): Promise<ServerImportResult> {
  const res = await fetch('/api/tickets/import', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });

  return handleResponse(res);
}

/**
 * Report a supervisor's type correction so the server can learn from it.
 */
export async function learnFromCorrection(
  description: string,
  correctTypeKey: string
): Promise<{ learned: number; message: string }> {
  const res = await fetch('/api/classify/learn', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ description, correctTypeKey }),
  });

  return handleResponse(res);
}
