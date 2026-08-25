/**
 * API client wrapper.
 * Attaches the local app JWT as a Bearer header on authenticated requests.
 */

const BASE = '/api';
const TOKEN_KEY = 'retal_auth_token';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('token');
}

export const authStorage = {
  getToken,
  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  },
  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  },
};

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: { auth?: boolean },
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options?.auth !== false) {
    const token = getToken();
    if (!token) throw new Error('Not authenticated');
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

const get  = <T>(path: string)                 => request<T>('GET', path);
const post = <T>(path: string, body: unknown) => request<T>('POST', path, body);
const put  = <T>(path: string, body: unknown) => request<T>('PUT', path, body);
const del  = <T>(path: string)                 => request<T>('DELETE', path);
const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body);

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (identifier: string, password: string) =>
    request<{ token: string; user: any; requiresProfileCompletion?: boolean; isFirstLogin?: boolean }>(
      'POST',
      '/auth/login',
      { identifier, password },
      { auth: false }
    ),
  register: (data: { displayName: string; email: string; password: string }) =>
    request<{ token: string; user: any }>('POST', '/auth/register', data, { auth: false }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>('POST', '/auth/change-password', { currentPassword, newPassword }),
  forgotPassword: (identifier: string) =>
    request<{ success: boolean; message: string }>('POST', '/auth/forgot-password', { identifier }, { auth: false }),
  resetPassword: (identifier: string, code: string, newPassword: string) =>
    request<{ success: boolean; message: string }>('POST', '/auth/reset-password', { identifier, code, newPassword }, { auth: false }),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersApi = {
  getAll: ()                         => get<any[]>('/users'),
  getMe:  ()                         => get<any>('/users/me'),
  get:    (uid: string)              => get<any>(`/users/${uid}`),
  upsert: (data: any)                => post<any>('/users', data),
  claimPending: (data: { displayName: string; employeeId?: string; phoneNumber?: string }) => post<any>("/users/claim-pending", data),

  update: (uid: string, data: any) => put<any>(`/users/${uid}`, data),
  delete: (uid: string)              => del<any>(`/users/${uid}`),
  findByEmployee: (params: { employeeId?: string; phoneNumber?: string }) => {
    const q = params.employeeId
      ? `?employeeId=${encodeURIComponent(params.employeeId)}`
      : `?phoneNumber=${encodeURIComponent(params.phoneNumber ?? '')}`;
    return get<any | null>(`/users/find/by-employee${q}`);
  },
  // Complete pending user profile.
  // Uses multipart/form-data when a profile photo is supplied.
  completeProfile: async (data: {
    displayName: string;
    phoneNumber: string;
    employeeId: string;
    idNumber: string;
    clothingSize: string;
    shoeSize: string;
    email?: string;
    photo?: File | null;
  }) => {
    const token =
      localStorage.getItem('retal_auth_token') ||
      localStorage.getItem('token') ||
      '';

    if (!token) {
      throw new Error('Not authenticated');
    }

    const form = new FormData();

    form.append('displayName', data.displayName);
    form.append('phoneNumber', data.phoneNumber);
    form.append('employeeId', data.employeeId);
    form.append('idNumber', data.idNumber);
    form.append('clothingSize', data.clothingSize);
    form.append('shoeSize', data.shoeSize);

    if (data.email) {
      form.append('email', data.email);
    }

    if (data.photo) {
      form.append('photo', data.photo);
    }

    const response = await fetch('/api/users/complete-profile', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({
        error: response.statusText,
      }));

      throw new Error(
        err.error || `HTTP ${response.status}`
      );
    }

    return response.json() as Promise<{
      token?: string;
      user: any;
    }>;
  },

};

// ── Projects ─────────────────────────────────────────────────────────────────
export const projectsApi = {
  getAll: ()                         => get<any[]>('/projects'),
  get:    (id: string)               => get<any>(`/projects/${id}`),
  create: (data: any)                => post<any>('/projects', data),
  update: (id: string, data: any)    => put<any>(`/projects/${id}`, data),
  delete: (id: string)               => del<any>(`/projects/${id}`),
  getBlocks: (projectId: string) => get<any[]>(`/projects/${projectId}/blocks`),
  getUnits: (projectId: string) => get<any[]>(`/projects/${projectId}/units`),
  getUnitDetails: (unitId: string) => get<any>(`/projects/unit-details/${unitId}`),
};

// ── Clients ───────────────────────────────────────────────────────────────────
export const clientsApi = {
  getAll:          ()                              => get<any[]>('/clients'),
  get:             (id: string)                    => get<any>(`/clients/${id}`),
  getByProject:    (projectId: string)             => get<any[]>(`/projects/${projectId}/clients`),
  create:          (projectId: string, data: any)  => post<any>(`/projects/${projectId}/clients`, data),
  update:          (id: string, data: any)         => put<any>(`/clients/${id}`, data),
  delete:          (id: string)                    => del<any>(`/clients/${id}`),
};

// ── Tickets ───────────────────────────────────────────────────────────────────
export const ticketsApi = {
  getAll: (params?: {
    projectId?: string;
    projectIds?: string[];
    supervisorId?: string;
    status?: string;
    clientId?: string;
    unitId?: string;
    contractorId?: string;
    includeDirectAppts?: boolean;
  }) => {
    const q = new URLSearchParams();
    if (params?.projectId)    q.set('projectId', params.projectId);
    if (params?.projectIds?.length) q.set('projectIds', params.projectIds.join(','));
    if (params?.supervisorId) q.set('supervisorId', params.supervisorId);
    if (params?.status)       q.set('status', params.status);
    if (params?.clientId)     q.set('clientId', params.clientId);
    if (params?.unitId)       q.set('unitId', params.unitId);
    if (params?.contractorId) q.set('contractorId', params.contractorId);
    if (params?.includeDirectAppts) q.set('includeDirectAppts', 'true');
    const qs = q.toString();
    return get<any[]>(`/tickets${qs ? `?${qs}` : ''}`);
  },
  get:          (id: string)                           => get<any>(`/tickets/${id}`),
  create:       (data: any)                            => post<any>('/tickets', data),
  bulkCreate:   (tickets: any[])                       => post<{ count: number }>('/tickets/bulk', { tickets }),
  update:       (id: string, data: any)                => put<any>(`/tickets/${id}`, data),
  bulkStatus:   (ids: string[], status: string)        => patch<{count: number}>('/tickets/bulk-status', { ids, status }),
  bulkUpdateImported: (updates: { id: string; status: string; closedAt?: string | null }[]) =>
    post<{count: number}>('/tickets/bulk-update-imported', { updates }),
  delete:       (id: string)                           => del<any>(`/tickets/${id}`),
  deleteAll:    ()                                     => del<any>('/tickets'),
  getNextId:    (projectId: string)                    => get<{ nextId: string }>(`/tickets/next-id?projectId=${projectId}`).then(res => res.nextId),
  getTicketIds: (projectId: string)                    => get<{ ticketId: string; id: string; type: string; status: string; closedAt: string | null }[]>(`/tickets/ticketids?projectId=${projectId}`),
  autoLink:     ()                                     => post<{ count: number; message: string }>('/tickets/auto-link', {}),
  importExcel: async (file: File, projectId: string, closeMissingTickets: boolean = false, onProgress?: (p: number) => void, skipDateFilter: boolean = false) => {
    const form = new FormData();
    form.append('file', file);
    form.append('projectId', projectId);
    if (closeMissingTickets) {
      form.append('closeMissingTickets', 'true');
    }
    if (skipDateFilter) {
      form.append('skipDateFilter', 'true');
    }
    const token = localStorage.getItem('retal_auth_token') || localStorage.getItem('token') || '';

    const response = await fetch('/api/import-excel', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });

    if (!response.body) throw new Error('لا يوجد استجابة من السيرفر');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = null;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        let data: any = null;
        try {
          data = JSON.parse(line);
          if (data.error) throw new Error(data.error);
          if (data.progress && onProgress) onProgress(data.progress);
          if (data.done) result = data.result;
        } catch (e: any) {
          throw new Error(data?.error || e.message);
        }
      }
    }

    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);
        if (data.error) throw new Error(data.error);
        if (data.progress && onProgress) onProgress(data.progress);
        if (data.done) result = data.result;
      } catch (e) {
        // Ignore trailing garbage
      }
    }

    if (!result) throw new Error('اكتمل الطلب ولكن لم يتم إرجاع نتيجة');
    return result as { ok: boolean; added: number; updated: number; closedMissing: number; missingNotClosed: number; skippedByDateFilter: number; skippedInFile: number; skippedInDB: number; failed: number; classified: number; unclassified: number; errors: string[] };
  },
};

// ── WhatsApp ──────────────────────────────────────────────────────────────────
export const whatsappApi = {
  getStatus: () =>
    get<{ running: boolean; connected: boolean; state?: string; linkedPhone?: string | null }>('/whatsapp/status'),
  getQR: () =>
    get<{ qr: string }>('/whatsapp/qr'),
  pairByPhone: (phone: string) =>
    post<{ code: string }>('/whatsapp/pair', { phone }),
  send: (phone: string, message: string, ticketId?: string) =>
    post<{ sent: boolean; fallback: boolean }>('/whatsapp/send', { phone, message, ticketId }),
  verify: () =>
    post<{ connected: boolean }>('/whatsapp/verify', {}),
  start: () =>
    post<{ success: boolean; message: string }>('/whatsapp/start', {}),
  restart: () =>
    post<{ success: boolean; message: string }>('/whatsapp/restart', {}),
  sendAppointmentRange: (ticketId: string, data: {
    startDate: string; endDate: string; preferredTime: string;
    notes?: string; phone: string; clientName: string; unitNumber: string;
  }) => post<{ sent: boolean; fallback: boolean }>(`/whatsapp/appointment-range/${ticketId}`, data),
  previewAppointmentRange: (ticketId: string, data: {
    startDate: string; endDate: string; preferredTime: string;
    notes?: string; phone: string; clientName: string; unitNumber: string;
  }) => post<{ text: string }>(`/whatsapp/preview-appointment-range/${ticketId}`, data),
};

// ── WhatsApp Bot (admin-only) ───────────────────────────────────────────────
export const whatsappBotApi = {
  getStatus: () =>
    get<{ running: boolean; connected: boolean; state?: string; linkedPhone?: string | null; enabled: boolean }>('/whatsapp-bot/status'),
  getQR: () =>
    get<{ qr: string | null; state?: string }>('/whatsapp-bot/qr'),
  pairByPhone: (phone: string) =>
    post<{ code: string }>('/whatsapp-bot/pair', { phone }),
  start: () =>
    post<{ ok: boolean }>('/whatsapp-bot/start', {}),
  stop: (cleanSession?: boolean) =>
    post<{ ok: boolean }>('/whatsapp-bot/stop', { cleanSession }),
  toggle: (enabled: boolean) =>
    post<{ ok: boolean; enabled: boolean }>('/whatsapp-bot/toggle', { enabled }),
  getGroup: () =>
    get<{ group: { jid: string; subject: string | null } | null }>('/whatsapp-bot/group'),
  joinGroup: (inviteLink: string) =>
    post<{ ok: boolean; group: { jid: string; subject: string } }>('/whatsapp-bot/group/join', { inviteLink }),
  leaveGroup: () =>
    post<{ ok: boolean }>('/whatsapp-bot/group/leave', {}),
  getLogs: (limit = 50) =>
    get<{ id: string; senderUid: string; jid: string; rawText: string; intent: string | null; success: boolean; reply: string; createdAt: string }[]>(`/whatsapp-bot/logs?limit=${limit}`),
};

// ── Settings ──────────────────────────────────────────────────────────────────
type WaTemplates = { openingMsg: string; closingMsg: string; absentMsg?: string; outOfScopeMsg?: string };
export type TimePeriod = { start: string; end: string };
export type WorkHoursConfig = {
  enabled:       boolean;
  hasMorning?:   boolean;
  morning:       TimePeriod;
  hasBreak?:     boolean;
  break:         TimePeriod;
  hasAfternoon?: boolean;
  afternoon:     TimePeriod;
};
export type WorkHoursSettings = {
  default:   WorkHoursConfig;
  byProject: Record<string, WorkHoursConfig>;
};
export const settingsApi = {
  getWhatsAppTemplates: () =>
    get<WaTemplates>('/settings/whatsapp-templates'),
  updateWhatsAppTemplates: (data: WaTemplates) =>
    put<WaTemplates>('/settings/whatsapp-templates', data),
  getWorkHours: () =>
    get<WorkHoursSettings>('/settings/work-hours'),
  updateWorkHours: (data: WorkHoursSettings) =>
    put<WorkHoursSettings>('/settings/work-hours', data),
};

// ── Reports ───────────────────────────────────────────────────────────────────
export const reportsApi = {
  getStats: (params?: { projectId?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.projectId) q.set('projectId', params.projectId);
    if (params?.from)      q.set('from', params.from);
    if (params?.to)        q.set('to', params.to);
    const qs = q.toString();
    return get<{
      totals:      { total: number; open: number; closed: number; avgDays: number };
      bySpecialty: { key: string; nameAr: string; count: number }[];
      byMainType:  { key: string; nameAr: string; count: number; closed: number; open: number }[];
      bySubType:   { id: string; nameAr: string; parentKey: string; parentName: string; count: number; closed: number; open: number }[];
      byProject:   { id: string; name: string; abbr: string; count: number; closed: number; open: number }[];
      byMonth:     { month: string; total: number; closed: number; open: number }[];
    }>(`/reports/stats${qs ? `?${qs}` : ''}`);
  },
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
export const dashboardApi = {
  getStats: (projectId?: string) => {
    const q = projectId ? `?projectId=${projectId}` : '';
    return get<any>(`/dashboard/stats${q}`);
  },
};

// ── Audit Trail ───────────────────────────────────────────────────────────────
export const auditApi = {
  getForTicket: (ticketId: string) => get<any[]>(`/audit/ticket/${ticketId}`),
};

// ── Technicians ───────────────────────────────────────────────────────────────
export const techniciansApi = {
  getAll: (params?: { includeDisabled?: boolean }) => {
    const q = params?.includeDisabled ? '?includeDisabled=true' : '';
    return get<any[]>(`/technicians${q}`);
  },
  create: (data: any)                => post<any>('/technicians', data),
  update: (id: string, data: any)    => put<any>(`/technicians/${id}`, data),
  disable: (id: string)              => put<any>(`/technicians/${id}`, { isActive: false }),
  enable:  (id: string)              => put<any>(`/technicians/${id}`, { isActive: true }),
  delete: (id: string)               => del<any>(`/technicians/${id}`),
  invite: (data: { name: string; phoneNumber: string; projectId?: string | null; supervisorId?: string | null }) =>
    post<{ technicianId: string; tempPassword: string; waSent: boolean }>('/tech/invite', data),
};

// ── Attendance (Supervisor) ───────────────────────────────────────────────────
export const attendanceApi = {
  getLive: () => get<any[]>('/attendance/live'),
  getDaily: (params?: { date?: string; projectId?: string }) => {
    const q = new URLSearchParams();
    if (params?.date) q.append('date', params.date);
    if (params?.projectId && params.projectId !== 'all') q.append('projectId', params.projectId);
    return get<any[]>(`/attendance/daily?${q.toString()}`);
  },
  getReport: (params?: { from?: string; to?: string; projectId?: string; technicianId?: string }) => {
    const q = new URLSearchParams();
    if (params?.from) q.append('from', params.from);
    if (params?.to) q.append('to', params.to);
    if (params?.projectId && params.projectId !== 'all') q.append('projectId', params.projectId);
    if (params?.technicianId && params.technicianId !== 'all') q.append('technicianId', params.technicianId);
    return get<{ shifts: any[]; summary: any }>(`/attendance/report?${q.toString()}`);
  },
  override: (data: { shiftLogId: string; clockInAt?: string; clockOutAt?: string; reason?: string }) =>
    patch<any>('/attendance/override', data),
};

// ── Appointments ──────────────────────────────────────────────────────────────
export const appointmentsApi = {
  getConflicts: (params: { supervisorIds: string[]; startDate: string; endDate: string; excludeTicketId?: string }) => {
    const q = new URLSearchParams();
    q.set('supervisorIds', params.supervisorIds.join(','));
    q.set('startDate', params.startDate);
    q.set('endDate', params.endDate);
    if (params.excludeTicketId) q.set('excludeTicketId', params.excludeTicketId);
    return get<{ conflicts: any[] }>(`/appointments/conflicts?${q.toString()}`);
  },
  getCalendar: (params: { from: string; to: string; supervisorId?: string; projectId?: string; projectIds?: string[] }) => {
    const q = new URLSearchParams();
    q.set('from', params.from);
    q.set('to', params.to);
    if (params.supervisorId) q.set('supervisorId', params.supervisorId);
    if (params.projectId) q.set('projectId', params.projectId);
    if (params.projectIds?.length && !params.projectId) q.set('projectIds', params.projectIds.join(','));
    return get<any[]>(`/appointments/calendar?${q.toString()}`);
  },
  subscribePush: (subscription: PushSubscriptionJSON) =>
    post<{ ok: boolean }>('/appointments/push-subscribe', { subscription }),
  unsubscribePush: () =>
    del<{ ok: boolean }>('/appointments/push-unsubscribe'),
  create: (data: {
    projectId: string; unitId?: string; unitNumber?: string; clientId?: string; clientName?: string;
    clientPhone?: string; date: string; time?: string; notes?: string;
    supervisorIds?: string[]; supervisors?: any[]; technicianId?: string | null; technicianIds?: string[];
    technicians?: any[]; types?: string[]; ticketIds?: string[];
  }) => post<any>('/appointments', data),
  update: (id: string, data: {
    date: string; time?: string; notes?: string; clientPhone?: string;
    supervisorIds?: string[]; supervisors?: any[]; technicianId?: string | null; technicianIds?: string[];
    technicians?: any[]; types?: string[]; status?: string;
  }) => put<any>(`/appointments/${id}`, data),
  assignTechnician: (id: string, data: { technicianId?: string | null; technicianIds?: string[]; technicians?: any[] }) =>
    fetch(`/api/appointments/${id}/assign-technician`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('retal_auth_token') || localStorage.getItem('token') || ''}`
      },
      body: JSON.stringify(data)
    }).then(async r => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText }));
        throw new Error(err.error || `HTTP ${r.status}`);
      }
      return r.json();
    }),
  getById: (id: string) => get<any>(`/appointments/${id}`),
  getByClient: (clientId: string) => get<any[]>(`/appointments/by-client/${clientId}`),
  getByUnit: (projectId: string, unitId: string) =>
    get<any[]>(`/appointments/by-unit?projectId=${encodeURIComponent(projectId)}&unitId=${encodeURIComponent(unitId)}`),
};

// ── Technician API ─────────────────────────────────────────────────────────────
export const techApi = {
  getAppointments: async (params?: { date?: string; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.date) q.set('date', params.date);
    if (params?.from) q.set('from', params.from);
    if (params?.to) q.set('to', params.to);
    const token = localStorage.getItem('tech_token') || '';
    const res = await fetch(`/api/tech/appointments?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json() as Promise<any[]>;
  },
  getTodayShift: async () => {
    const token = localStorage.getItem('tech_token') || '';
    const res = await fetch('/api/shift/today', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    return res.json();
  },
  clockIn: async (data: { lat?: number; lng?: number; accuracy?: number; projectId?: string }) => {
    const token = localStorage.getItem('tech_token') || '';
    const res = await fetch('/api/shift/clock-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
  clockOut: async (data?: { lat?: number; lng?: number; note?: string }) => {
    const token = localStorage.getItem('tech_token') || '';
    const res = await fetch('/api/shift/clock-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data || {})
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
  startBreak: async (breakType?: string) => {
    const token = localStorage.getItem('tech_token') || '';
    const res = await fetch('/api/shift/break/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ breakType: breakType || 'MEAL' })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
  endBreak: async () => {
    const token = localStorage.getItem('tech_token') || '';
    const res = await fetch('/api/shift/break/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({})
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
  claimAppointment: async (appointmentId: string) => {
    const token = localStorage.getItem('tech_token') || '';

    const res = await fetch(
      `/api/tech/appointments/${appointmentId}/claim`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({
        error: res.statusText
      }));

      throw new Error(
        err.error || `HTTP ${res.status}`
      );
    }

    return res.json();
  },

  startTravel: async (ticketId: string) => {
    const token = localStorage.getItem('tech_token') || '';
    const res = await fetch('/api/ticket-session/travel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ticketId })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
  arrive: async (ticketId: string, location?: { lat: number; lng: number; accuracy?: number }) => {
    const token = localStorage.getItem('tech_token') || '';
    const res = await fetch('/api/ticket-session/arrive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ticketId, ...location })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
  completeTicket: async (ticketId: string, notes?: string) => {
    const token = localStorage.getItem('tech_token') || '';
    const res = await fetch('/api/ticket-session/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ticketId, notes })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },
};

// ── Warranties ────────────────────────────────────────────────────────────────
export const warrantiesApi = {
  getAll: () => get<any[]>('/warranties'),
  import: async (file: File, projectId?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (projectId) form.append('projectId', projectId);

    const token = localStorage.getItem('retal_auth_token') || localStorage.getItem('token') || '';
    const res = await fetch('/api/warranties/import', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json() as Promise<{ success: boolean; updated: number; errors: string[] }>;
  },
};

// ── Notifications ─────────────────────────────────────────────────────────────
export const notificationsApi = {
  getAll: () => get<any[]>('/notifications'),
  readAll: () => post<{ ok: boolean }>('/notifications/read-all', {}),
  read: (id: string) => post<{ ok: boolean }>(`/notifications/${id}/read`, {}),
};

// ── Warehouse ─────────────────────────────────────────────────────────────────
export const warehouseApi = {
  // Items
  getItems: (projectId: string) => get<any[]>(`/warehouse/items?projectId=${encodeURIComponent(projectId)}`),
  createItem: (data: { projectId: string; name: string; category?: string; quantity?: number; unit?: string; minQuantity?: number; notes?: string }) =>
    post<any>('/warehouse/items', data),
  updateItem: (id: string, data: Partial<{ name: string; category: string; quantity: number; unit: string; minQuantity: number; notes: string }>) =>
    put<any>(`/warehouse/items/${id}`, data),
  deleteItem: (id: string) => del<any>(`/warehouse/items/${id}`),

  // Requests
  getRequests: (projectId?: string) => {
    const q = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    return get<any[]>(`/warehouse/requests${q}`);
  },
  createRequest: (data: { projectId: string; title?: string; notes?: string; items: { name: string; quantity: number; unit?: string; urgency?: string; notes?: string }[] }) =>
    post<any>('/warehouse/requests', data),
  updateRequest: (id: string, data: { title?: string; notes?: string; items: { name: string; quantity: number; unit?: string; urgency?: string; notes?: string }[] }) =>
    put<any>(`/warehouse/requests/${id}`, data),
  deleteRequest: (id: string) => del<any>(`/warehouse/requests/${id}`),
  exportRequest: (id: string) => {
    const token = localStorage.getItem('retal_auth_token') || localStorage.getItem('token') || '';
    return fetch(`/api/warehouse/requests/${id}/export`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async r => {
      if (!r.ok) throw new Error('فشل تصدير الملف');
      const blob = await r.blob();
      const cd = r.headers.get('Content-Disposition') || '';
      const m = cd.match(/filename="(.+?)"/);
      const filename = m ? m[1] : `request-${id}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    });
  },
};


