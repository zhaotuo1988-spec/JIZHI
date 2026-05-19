import { supabase, isDevMode } from './storageService';

export interface AdminManagedUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  createdAt?: string;
  lastSignInAt?: string | null;
  stats: {
    projects: number;
    logs: number;
    concreteRecords: number;
  };
}

export interface AdminCreateUserInput {
  email: string;
  password: string;
  displayName?: string;
  role: 'admin' | 'user';
}

export interface AdminUpdateUserInput {
  displayName?: string;
  role?: 'admin' | 'user';
  status?: 'active' | 'inactive';
}

const getAuthHeaders = async (): Promise<Record<string, string>> => {
  if (isDevMode()) {
    return { Authorization: 'Bearer dev-token' };
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload as T;
};

export const fetchAdminUsers = async (): Promise<AdminManagedUser[]> => {
  const response = await fetch('/api/admin/users', {
    headers: await getAuthHeaders()
  });
  const payload = await parseResponse<{ users: AdminManagedUser[] }>(response);
  return payload.users;
};

export const createAdminUser = async (input: AdminCreateUserInput): Promise<AdminManagedUser> => {
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...await getAuthHeaders()
    },
    body: JSON.stringify(input)
  });
  const payload = await parseResponse<{ user: AdminManagedUser }>(response);
  return payload.user;
};

export const updateAdminUser = async (id: string, input: AdminUpdateUserInput): Promise<AdminManagedUser> => {
  const response = await fetch(`/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...await getAuthHeaders()
    },
    body: JSON.stringify(input)
  });
  const payload = await parseResponse<{ user: AdminManagedUser }>(response);
  return payload.user;
};

export const resetAdminUserPassword = async (id: string, newPassword: string): Promise<void> => {
  const response = await fetch(`/api/admin/users/${id}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...await getAuthHeaders()
    },
    body: JSON.stringify({ newPassword })
  });
  await parseResponse<{ ok: boolean }>(response);
};
