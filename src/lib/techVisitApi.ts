import type { TechLocationSample } from './techLocation';

export type TechVisitPhase =
  | 'claimed'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'paused'
  | 'awaiting_duration'
  | 'completed'
  | 'cancelled';

export type TechVisitApiError = Error & {
  code?: string;
  activeAppointmentId?: string | null;
  remainingTicketIds?: string[];
};

function techToken() {
  return localStorage.getItem('tech_token') || '';
}

async function parseTechResponse(res: Response) {
  const body = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) {
    const error = new Error(body.error || `HTTP ${res.status}`) as TechVisitApiError;
    error.code = body.code;
    error.activeAppointmentId = body.activeAppointmentId || null;
    error.remainingTicketIds = body.remainingTicketIds;
    throw error;
  }
  return body;
}

async function postVisit(
  appointmentId: string,
  action: 'travel' | 'arrive' | 'start-work',
  payload?: Partial<TechLocationSample>,
) {
  const res = await fetch(`/api/tech/appointments/${appointmentId}/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${techToken()}`,
    },
    body: JSON.stringify(payload || {}),
  });

  return parseTechResponse(res) as Promise<{
    ok: boolean;
    phase: TechVisitPhase;
    session: any;
    updatedTickets?: number;
  }>;
}

export const techVisitApi = {
  travel: (appointmentId: string) => postVisit(appointmentId, 'travel'),
  arrive: (appointmentId: string, location: TechLocationSample) =>
    postVisit(appointmentId, 'arrive', location),
  startWork: (appointmentId: string, location: TechLocationSample) =>
    postVisit(appointmentId, 'start-work', location),
  confirmDuration: async (appointmentId: string, minutes: number) => {
    const res = await fetch(`/api/tech/appointments/${appointmentId}/confirm-duration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${techToken()}`,
      },
      body: JSON.stringify({ minutes }),
    });
    return parseTechResponse(res) as Promise<{ ok: boolean; session: any; alreadyCompleted?: boolean }>;
  },
};
