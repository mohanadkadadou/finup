import { tr } from './serverText';

export class ApiErr extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (body as { error?: { code?: string; message?: string; details?: unknown } } | null)
      ?.error;
    throw new ApiErr(
      res.status,
      e?.code ?? 'ERROR',
      tr(e?.message ?? `Request failed (${res.status})`),
      e?.details,
    );
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) =>
    fetch(`/api${path}`, { credentials: 'same-origin' }).then((r) => handle<T>(r)),
  send: <T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown) =>
    fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  upload: <T>(path: string, form: FormData) =>
    fetch(`/api${path}`, { method: 'POST', credentials: 'same-origin', body: form }).then((r) =>
      handle<T>(r),
    ),
};

export const errMsg = (e: unknown): string =>
  e instanceof Error ? e.message : tr('Something went wrong.');
