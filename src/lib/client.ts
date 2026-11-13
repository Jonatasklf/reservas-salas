'use client';
/**
 * Utilitários do lado do navegador: chamadas à API e pequenos hooks.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
  /** Erros por campo vindos da validação do servidor. */
  get fields(): Record<string, string> {
    return ((this.details as { fields?: Record<string, string> })?.fields) ?? {};
  }
}

export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && url.startsWith('/api/admin') && typeof window !== 'undefined') {
      window.location.href = `/admin/login?voltar=${encodeURIComponent(window.location.pathname)}`;
    }
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? 'Não foi possível concluir a operação.', e.details);
  }
  return data as T;
}

/** Busca dados de uma URL e recarrega quando ela muda. */
export function useFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!url) return;
    const current = ++seq.current;
    setLoading(true);
    try {
      const result = await api<T>(url);
      if (current === seq.current) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (current === seq.current) setError(e as ApiError);
    } finally {
      if (current === seq.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

/** Converte resposta JSON de datas (strings ISO) em Date quando necessário. */
export const toDate = (v: string | Date) => (v instanceof Date ? v : new Date(v));
