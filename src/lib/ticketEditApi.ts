import { authStorage } from '@/lib/api';

export interface ProjectSupervisorOption {
  uid: string;
  displayName: string;
  specialties?: string[];
}

export interface UploadedTicketAttachment {
  name: string;
  size: number;
  mimeType: string;
  url: string;
}

function authHeaders(): Record<string, string> {
  const token = authStorage.getToken();
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

async function parseError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return new Error(payload?.error || `HTTP ${response.status}`);
}

export const ticketEditApi = {
  async getProjectSupervisors(projectId: string): Promise<ProjectSupervisorOption[]> {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/supervisors`, {
      headers: authHeaders(),
    });
    if (!response.ok) throw await parseError(response);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  },

  async uploadAttachments(ticketId: string, files: File[]): Promise<UploadedTicketAttachment[]> {
    if (!files.length) return [];

    const form = new FormData();
    files.forEach(file => form.append('files', file));

    const response = await fetch(`/api/ticket-attachments/${encodeURIComponent(ticketId)}`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
    if (!response.ok) throw await parseError(response);

    const data = await response.json() as { files?: UploadedTicketAttachment[] };
    return Array.isArray(data.files) ? data.files : [];
  },
};
