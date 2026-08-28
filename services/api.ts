/**
 * Minimal fetch wrapper for the GRAND-ERP API described by
 * `contracts/openapi.yaml`. Every response there is the same envelope —
 * `{ data }` on success, `{ errors, validation_errors? }` on failure — so the
 * unwrapping lives here once instead of at every call site.
 */
import type { components } from '@/types/api';

/**
 * `servers:` in the contract is the local dev cluster. Point
 * `EXPO_PUBLIC_API_BASE_URL` at the real deployment for anything else; Expo
 * inlines `EXPO_PUBLIC_*` at build time, so this resolves without a runtime
 * config lookup.
 */
const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_BASE_URL).replace(
  /\/+$/,
  ''
);

/**
 * Passwords and bearer tokens only travel over TLS. Plain `http://` stays
 * allowed in dev builds (the contract's own server is `http://127.0.0.1:3000`),
 * but a release build aimed at one fails loudly instead of quietly shipping
 * credentials in the clear.
 */
if (!__DEV__ && !API_BASE_URL.startsWith('https://')) {
  throw new Error('EXPO_PUBLIC_API_BASE_URL harus memakai https:// pada build rilis.');
}

const REQUEST_TIMEOUT_MS = 15_000;

type ErrorEnvelope = components['responses']['ValidationError']['content']['application/json'];

/** A request that reached the server and came back as a non-2xx envelope, or never got there at all. */
export class ApiError extends Error {
  /** 0 when the request never reached the server (offline, DNS, TLS, timeout). */
  readonly status: number;
  readonly validationErrors?: Record<string, string>;

  constructor(message: string, status: number, validationErrors?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.validationErrors = validationErrors;
  }

  get isNetworkFailure() {
    return this.status === 0;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Serialized as JSON. */
  body?: unknown;
  /** Sent as `Authorization: Bearer <token>`. Every `/api/v1` route needs one except auth/login, auth/refresh, auth/logout. */
  token?: string | null;
}

/**
 * Performs one API call and returns the `data` payload. Throws `ApiError` for
 * anything else — never logs the request body or the token, both of which are
 * credentials.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? null : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : null),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(
      aborted
        ? 'Server tidak menjawab tepat waktu. Coba lagi.'
        : 'Tidak bisa menghubungi server. Periksa koneksi Anda.',
      0
    );
  } finally {
    clearTimeout(timeout);
  }

  // A proxy or a wrong base URL can answer with HTML; treat unparseable bodies
  // as an empty envelope rather than letting the JSON error escape as-is.
  let envelope: (ErrorEnvelope & { data?: T }) | null = null;
  try {
    envelope = (await response.json()) as ErrorEnvelope & { data?: T };
  } catch {
    envelope = null;
  }

  if (!response.ok) {
    throw new ApiError(
      envelope?.errors || `Server menjawab ${response.status}.`,
      response.status,
      envelope?.validation_errors
    );
  }

  if (!envelope || envelope.data === undefined) {
    throw new ApiError('Jawaban server tidak sesuai kontrak.', response.status);
  }

  return envelope.data;
}
