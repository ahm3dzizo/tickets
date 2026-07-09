// src/lib/contractorsApi.ts
import { Contractor, ContractorVilla } from '@/types';

const BASE = '/api/contractors';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('retal_auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json() as Promise<T>;
}

export const contractorsApi = {
  /** Get all contractors, optionally filtered to those with assignments in a specific project */
  getAll(projectId?: string): Promise<Contractor[]> {
    const params = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    return request<Contractor[]>(`${BASE}${params}`);
  },

  get(id: string): Promise<Contractor> {
    return request<Contractor>(`${BASE}/${id}`);
  },

  /** Suggest contractors for a given project/villa/specialty */
  suggest(params: {
    projectId: string;
    villaNumber?: string;
    specialtyKey?: string;
    blockNumber?: string;
  }): Promise<Contractor[]> {
    const q = new URLSearchParams({ projectId: params.projectId });
    if (params.villaNumber) q.set('villaNumber', params.villaNumber);
    if (params.specialtyKey) q.set('specialtyKey', params.specialtyKey);
    if (params.blockNumber) q.set('blockNumber', params.blockNumber);
    return request<Contractor[]>(`${BASE}/suggest?${q.toString()}`);
  },

  /** Create a new contractor — no global projectId, assignments carry their own projectId */
  create(data: {
    name: string;
    phone?: string;
    specialties?: string[];
    assignments?: Array<Partial<ContractorVilla> & { projectId: string }>;
  }): Promise<Contractor> {
    return request<Contractor>(BASE, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(id: string, data: {
    name?: string;
    phone?: string | null;
    specialties?: string[];
    assignments?: Array<Partial<ContractorVilla> & { projectId: string }>;
  }): Promise<Contractor> {
    return request<Contractor>(`${BASE}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete(id: string): Promise<{ ok: boolean }> {
    return request<{ ok: boolean }>(`${BASE}/${id}`, { method: 'DELETE' });
  },
};
