const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(handler: () => void) {
  onUnauthorized = handler;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 401) {
    onUnauthorized?.();
    throw new ApiError(401, 'Nicht authentifiziert');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unbekannter Fehler' }));
    throw new ApiError(res.status, body.error || 'Unbekannter Fehler');
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
      // No Content-Type header — let browser set multipart boundary
    });
    if (res.status === 401) {
      onUnauthorized?.();
      throw new ApiError(401, 'Nicht authentifiziert');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Unbekannter Fehler' }));
      throw new ApiError(res.status, body.error || 'Unbekannter Fehler');
    }
    return res.json();
  },
  url: API_URL,
};
