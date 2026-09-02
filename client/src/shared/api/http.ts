// Все запросы — через Vite-proxy /api: без CORS и захардкоженных хостов.
export const API_BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly details: string[];

  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function resolveImageUrl(url: string): string {
  return url.startsWith('/') ? `${API_BASE}${url}` : url;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string; errors?: string[] }
      | null;
    const details = body?.errors ?? [];
    throw new ApiError(response.status, body?.error ?? details[0] ?? response.statusText, details);
  }
  return response.json() as Promise<T>;
}
