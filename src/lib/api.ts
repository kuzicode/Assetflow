import { API_BASE } from '../config/chains';

const AUTH_TOKEN_KEY = 'assetflow_admin_token';

export function getAdminToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAdminToken(token: string | null) {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
  else localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function getJsonHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getAdminToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...getJsonHeaders(),
      ...(options?.headers as Record<string, string> | undefined),
    },
    ...options,
  });

  let payload: any = null;
  const isJson = res.headers.get('content-type')?.includes('application/json');
  if (isJson) payload = await res.json();

  if (!res.ok) {
    throw new Error(payload?.error || `API error: ${res.status}`);
  }

  return payload;
}
