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
  }) => {
    const q = new URLSearchParams();
    if (params?.projectId)    q.set('projectId', params.projectId);
    if (params?.projectIds?.length) q.set('projectIds', params.projectIds.join(','));
    if (params?.supervisorId) q.set('supervisorId', params.supervisorId);
    if (params?.status)       q.set('status', params.status);
    const qs = q.toString();
    return get<any[]>(`/tickets${qs ? `?${qs}` : ''}`);
  },
  get:          (id: string)                           => get<any>(`/tickets/${id}`),
  create:       (data: any)                            => post<any>('/tickets', data),
  bulkCreate:   (tickets: any[])                       => post<{ count: number }>('/tickets/bulk', { tickets }),
  update:       (id: string, data: any)                => put<any>(`/tickets/${id}`, data),
  bulkStatus:   (ids: string[], status: string)        => patch<any>('/tickets/bulk-status', { ids, status }),
  delete:       (id: string)                           => del<any>(`/tickets/${id}`),
  deleteAll:    ()                                     => del<any>('/tickets'),
};

// ── WhatsApp ──────────────────────────────────────────────────────────────────
export const whatsappApi = {
  getStatus: () =>
    get<{ running: boolean; connected: boolean; state?: string }>('/whatsapp/status'),
  getQR: () =>
    get<{ qr: string }>('/whatsapp/qr'),
  pairByPhone: (phone: string) =>
    post<{ code: string }>('/whatsapp/pair', { phone }),
  send: (phone: string, message: string) =>
    post<{ sent: boolean; fallback: boolean }>('/whatsapp/send', { phone, message }),
};

// ── Technicians ───────────────────────────────────────────────────────────────
export const techniciansApi = {
  getAll: ()                         => get<any[]>('/technicians'),
  create: (data: any)                => post<any>('/technicians', data),
  update: (id: string, data: any)    => put<any>(`/technicians/${id}`, data),
  delete: (id: string)               => del<any>(`/technicians/${id}`),
};