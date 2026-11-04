'use client';

import { createSupabaseBrowserClient } from './supabase/browser';

interface ApiErrorBody {
  error?: {
    message?: string;
  };
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error('Your session has expired. Sign in again to continue.');
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers,
    cache: 'no-store'
  });

  if (response.status === 204) {
    if (!response.ok) {
      throw new ApiRequestError('The request could not be completed.', response.status);
    }
    return undefined as T;
  }

  const body: unknown = await response.json();
  if (!response.ok) {
    const message = (body as ApiErrorBody).error?.message;
    throw new ApiRequestError(message ?? 'The request could not be completed.', response.status);
  }

  return (body as { data: T }).data;
}
