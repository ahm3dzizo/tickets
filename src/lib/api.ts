/**
 * API client wrapper.
 * Attaches the local app JWT as a Bearer header on authenticated requests.
 */

const BASE = '/api';
const TOKEN_KEY = 'retal_auth_token';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
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
    request<{ token: string; user: any; requiresProfileCompletion?: boolean }>(
      'POST', 
      '/auth/login', 
      { identifier, password }, 
      { auth: false }
    ),
  register: (data: { displayName: string; email: string; password: string }) =>
    request<{ token: string; user: any }>('POST', '/auth/register', data, { auth: false }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ success: boolean }>('POST', '/auth/change-password', { currentPassword, newPassword }),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersApi = {
  getAll: ()                         => get<any[]>('/users'),
  getMe:  ()                         => get<any>('/users/me'),
  get:    (uid: string)              => get<any>(`/users/${uid}`),
  upsert: (data: any)                => post<any>('/users', data),
  claimPending: (data: { displayName: string; employeeId?: string; phoneNumber?: string }) =>
    post<any>('/users/claim-pending', data),
  update: (uid: string, data: any)   => put<any>(`/users/${uid}`, data),
  delete: (uid: string)              => del<any>(`/users/${uid}`),
  findByEmployee: (params: { employeeId?: string; phoneNumber?: string }) => {
    const q = params.employeeId
      ? `?employeeId=${encodeURIComponent(params.employeeId)}`
      : `?phoneNumber=${encodeURIComponent(params.phoneNumber ?? '')}`;
    return get<any | null>(`/users/find/by-employee${q}`);
  },
  // ✨ جديد: إكمال بيانات المستخدم المعلق 
  completeProfile: (data: { displayName: string; email: string; password: string }) =>
    post<{ token?: string; user: any }>('/users/complete-profile', data),
};

// ── Projects ─────────────────────────────────────────────────────────────────
export const projectsApi = {
  getAll: ()                         => get<any[]>('/projects'),
  get:    (id: string)               => get<any>(`/projects/${id}`),
  create: (data: any)                => post<any>('/projects', data),
  update: (id: string, data: any)    => put<any>(`/projects/${id}`, data),
  delete: (id: string)               => del<any>(`/projects/${id}`),
};

// ── Clients ───────────────────────────────────────────────────────────────────
export const clientsApi = {
  getAll:          ()                              => get<any[]>('/clients'),
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
    includeDirectAppts?: boolean;
  }) => {
    const q = new URLSearchParams();
    if (params?.projectId)    q.set('projectId', params.projectId);
    if (params?.projectIds?.length) q.set('projectIds', params.projectIds.join(','));
    if (params?.supervisorId) q.set('supervisorId', params.supervisorId);
    if (params?.status)       q.set('status', params.status);
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
  importExcel:  (file: File, projectId: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('projectId', projectId);
    const token = localStorage.getItem('retal_auth_token') || localStorage.getItem('token') || '';
    return fetch('/api/import-excel', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(async r => {
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || 'فشل الاستيراد');
      return json as { ok: boolean; added: number; updated: number; skippedInFile: number; skippedInDB: number; failed: number; classified: number; unclassified: number; errors: string[] };
    });
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
  send: (phone: string, message: string) =>
    post<{ sent: boolean; fallback: boolean }>('/whatsapp/send', { phone, message }),
  verify: () =>
    post<{ connected: boolean }>('/whatsapp/verify', {}),
  start: () =>
    post<{ success: boolean; message: string }>('/whatsapp/start', {}),
  restart: () =>
    post<{ success: boolean; message: string }>('/whatsapp/restart', {}),
  sendApprovalRequest: (ticketId: string) =>
    post<{ sent: boolean; fallback: boolean }>(`/whatsapp/approval/${ticketId}`, {}),
  sendAppointmentRange: (ticketId: string, data: {
    startDate: string; endDate: string; preferredTime: string;
    notes?: string; phone: string; clientName: string; villaNumber: string;
  }) => post<{ sent: boolean; fallback: boolean }>(`/whatsapp/appointment-range/${ticketId}`, data),
  previewAppointmentRange: (ticketId: string, data: {
    startDate: string; endDate: string; preferredTime: string;
    notes?: string; phone: string; clientName: string; villaNumber: string;
  }) => post<{ text: string }>(`/whatsapp/preview-appointment-range/${ticketId}`, data),
};

// ── Settings ──────────────────────────────────────────────────────────────────
type WaTemplates = { openingMsg: string; closingMsg: string; absentMsg?: string; outOfScopeMsg?: string };
export const settingsApi = {
  getWhatsAppTemplates: () =>
    get<WaTemplates>('/settings/whatsapp-templates'),
  updateWhatsAppTemplates: (data: WaTemplates) =>
    put<WaTemplates>('/settings/whatsapp-templates', data),
  getWorkHours: () =>
    get<{ label: string; value: string }[]>('/settings/work-hours'),
  updateWorkHours: (data: { label: string; value: string }[]) =>
    put<{ label: string; value: string }[]>('/settings/work-hours', data),
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
  getAll: ()                         => get<any[]>('/technicians'),
  create: (data: any)                => post<any>('/technicians', data),
  update: (id: string, data: any)    => put<any>(`/technicians/${id}`, data),
  delete: (id: string)               => del<any>(`/technicians/${id}`),
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
  getUpcoming: (supervisorId?: string, days?: number) => {
    const q = new URLSearchParams();
    if (supervisorId) q.set('supervisorId', supervisorId);
    if (days) q.set('days', String(days));
    return get<any[]>(`/appointments/upcoming?${q.toString()}`);
  },
  getCalendar: (params: { from: string; to: string; supervisorId?: string; projectId?: string }) => {
    const q = new URLSearchParams();
    q.set('from', params.from);
    q.set('to', params.to);
    if (params.supervisorId) q.set('supervisorId', params.supervisorId);
    if (params.projectId) q.set('projectId', params.projectId);
    return get<any[]>(`/appointments/calendar?${q.toString()}`);
  },
  subscribePush: (subscription: PushSubscriptionJSON) =>
    post<{ ok: boolean }>('/appointments/push-subscribe', { subscription }),
  unsubscribePush: () =>
    del<{ ok: boolean }>('/appointments/push-unsubscribe'),
};

// ── Learned Keywords ──────────────────────────────────────────────────────────
export interface LearnedKeyword { id?: string; keyword: string; type: string; confidence: number; usageCount: number; }
export const learnedKeywordsApi = {
  getAll: () => get<LearnedKeyword[]>('/learned-keywords'),
  learn: (keyword: string, type: string) => post<any>('/learned-keywords/learn', { keyword, type }),
  bulkLearn: (items: any[]) => post<any>('/learned-keywords/bulk', { items }),
};