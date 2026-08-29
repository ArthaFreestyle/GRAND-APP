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

/**
 * The message to show for a failed call.
 *
 * The server writes its own errors in Indonesian and names the actual cause —
 * a duplicate `kode_barang`, an overlapping price period — so its wording beats
 * anything a screen could invent. The fallback only covers something thrown
 * that never reached the API layer.
 *
 * Screens used to keep a private copy of this each; it lives with `ApiError`
 * now because every one of them needs exactly the same three lines.
 */
export function messageOf(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Serialized as JSON. */
  body?: unknown;
  /** Sent as `Authorization: Bearer <token>`. Every `/api/v1` route needs one except auth/login, auth/refresh, auth/logout. */
  token?: string | null;
}

/** `{ data, paging }` — list endpoints put `paging` beside `data`, not inside it. */
export type PageMetadata = components['schemas']['PageMetadata'];

export interface Paged<T> {
  data: T[];
  paging: PageMetadata;
}

/** The query parameters nearly every list endpoint in the contract accepts. */
export interface ListQuery {
  page?: number;
  size?: number;
  /** Partial match; what it matches against differs per endpoint. */
  search?: string;
  is_aktif?: boolean;
}

/**
 * Builds a query string, dropping keys that are `undefined` or `null` so
 * callers can pass optional filters straight through without pruning first.
 * Returns '' when nothing survives, keeping the caller's path unchanged.
 */
export function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Performs one API call and returns the whole envelope. Throws `ApiError` for
 * anything else — never logs the request body or the token, both of which are
 * credentials.
 */
async function requestEnvelope<T>(
  path: string,
  options: RequestOptions = {}
): Promise<ErrorEnvelope & { data?: T; paging?: PageMetadata }> {
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
  let envelope: (ErrorEnvelope & { data?: T; paging?: PageMetadata }) | null = null;
  try {
    envelope = (await response.json()) as ErrorEnvelope & { data?: T; paging?: PageMetadata };
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

  if (!envelope) {
    throw new ApiError('Jawaban server tidak sesuai kontrak.', response.status);
  }

  return envelope;
}

/** Performs one API call and returns the `data` payload. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const envelope = await requestEnvelope<T>(path, options);
  if (envelope.data === undefined) {
    throw new ApiError('Jawaban server tidak sesuai kontrak.', 200);
  }
  return envelope.data;
}

/**
 * Performs one list call and returns `data` together with `paging`. Using
 * `apiRequest` for a list endpoint silently drops `paging`, which is the only
 * place the total row count is reported.
 */
export async function apiRequestPaged<T>(
  path: string,
  options: RequestOptions = {}
): Promise<Paged<T>> {
  const envelope = await requestEnvelope<T[]>(path, options);
  if (!Array.isArray(envelope.data)) {
    throw new ApiError('Jawaban server tidak sesuai kontrak.', 200);
  }
  return { data: envelope.data, paging: envelope.paging ?? {} };
}
