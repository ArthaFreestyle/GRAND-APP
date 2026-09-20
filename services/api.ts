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

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Uploads get their own, much longer budget.
 *
 * `dokumen.max_size_mb` defaults to 10 MB, and a phone camera photo lands near
 * the top of that. Fifteen seconds is generous for a JSON round trip and cruel
 * for ten megabytes over a shop's 3G — the request would be aborted at the
 * moment it was doing exactly what it was asked to.
 */
const UPLOAD_TIMEOUT_MS = 90_000;

type ErrorEnvelope = components['responses']['ValidationError']['content']['application/json'];


/** A request that reached the server and came back as a non-2xx envelope, or never got there at all. */
export class ApiError extends Error {
  /**
   * 0 when the request never reached the server (offline, DNS, TLS, timeout).
   * -1 means the caller cancelled it on purpose (`AbortController.abort()`
   * from a UI "Batalkan" button) — a screen checks for this to skip showing it
   * as a failure at all, since the person asked for exactly this outcome.
   */
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

  get isCancelled() {
    return this.status === -1;
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

  // Serializing is not networking: a body that fails to encode (a circular
  // reference, a BigInt slipped in by a caller) must never be reported as
  // "can't reach the server" — that sends whoever is debugging it toward their
  // Wi-Fi instead of the payload. Doing this outside the try below, before the
  // controller/timeout even exist, keeps it out of the network catch entirely.
  const encodedBody = body === undefined ? undefined : JSON.stringify(body);

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
      body: encodedBody,
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    if (__DEV__) {
      // The three-line message below is deliberately vague for the person
      // using the app; this is the one place that keeps the real cause —
      // whatever `fetch` actually threw — so it can be told apart from an
      // honest dead connection instead of guessed at from the outside.
      console.log(
        '[apiRequest] fetch threw',
        '\nmethod:', method,
        '\npath:', path,
        '\nerror name:', e instanceof Error ? e.name : typeof e,
        '\nerror message:', e instanceof Error ? e.message : String(e)
      );
    }
    throw new ApiError(
      aborted
        ? 'Server tidak menjawab tepat waktu. Coba lagi.'
        : 'Tidak bisa menghubungi server. Periksa koneksi Anda.',
      0
    );
  } finally {
    clearTimeout(timeout);
  }

  return parseEnvelope<T>(response);
}

/**
 * Turns one `Response` into the contract's envelope, or throws.
 *
 * Shared by the JSON path and the multipart one below. The two differ in what
 * they *send* — a serialized body against a streamed file, fifteen seconds
 * against ninety — and in nothing at all about what comes back: every route in
 * this contract answers `{ data }` or `{ errors }`, uploads included.
 */
async function parseEnvelope<T>(
  response: Response
): Promise<ErrorEnvelope & { data?: T; paging?: PageMetadata }> {
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

/**
 * One file, in the shape React Native's `FormData` accepts.
 *
 * `uri` is a `file://` path handed over by the image picker, **not** bytes.
 * React Native's `fetch` streams the file from disk when it sees this shape, so
 * a ten-megabyte photo never lands on the JS heap — which is also why there is
 * no `base64` variant here and should not be one.
 */
export interface UploadFile {
  uri: string;
  /**
   * The name shown back to a reader. `POST /dokumen` stores it verbatim for
   * display and **never** uses it as a path — the stored name is a UUID the
   * server generates — so a caller does not have to sanitise it.
   */
  name: string;
  /**
   * What the client believes the file is. The server decides for itself from
   * the magic bytes and will refuse an HTML file called `faktur.pdf` with a
   * 400, so this is a hint for the multipart part header, not a claim anyone
   * downstream trusts.
   */
  type: string;
}

export interface UploadOptions {
  /**
   * Multipart text fields sent alongside the file — `id_supplier`, `id_ruang`,
   * an optional `tanggal`, for the OCR endpoints. `apiUpload` used to only be
   * able to send the one file part, which was correct for `POST /dokumen` and
   * wrong the moment a second endpoint wanted a file **and** parameters in the
   * same body.
   */
  fields?: Record<string, string>;
  /**
   * Overrides `UPLOAD_TIMEOUT_MS` for one call.
   *
   * That constant is sized for "send N megabytes over a shop's uplink" —
   * moving bytes, nothing else. A call that also *waits on Gemini* after the
   * bytes land is a different budget entirely (services/ocr-pembelian.ts's
   * `OCR_TIMEOUT_MS`), and raising the shared constant to cover it would make
   * every ordinary photo upload wait three minutes before reporting a dead
   * connection.
   */
  timeoutMs?: number;
  /**
   * An external cancel, wired into the same internal `AbortController` that
   * the timeout uses. This is what lets a "Batalkan" button on screen actually
   * stop the request — not just navigate away from it — which matters most for
   * a call that bills a downstream service (Gemini) for every attempt.
   */
  signal?: AbortSignal;
}

/**
 * Performs one multipart upload and returns the `data` payload.
 *
 * `Content-Type` is deliberately **not** set. Its value has to carry the
 * multipart boundary, and only the runtime that serialised the `FormData` knows
 * what that boundary was; setting the header by hand replaces it with one that
 * has no boundary at all, and the server then reads a body it cannot split into
 * parts. This is the single most common way an RN upload fails, and it fails as
 * a validation error rather than as anything that points at the header.
 */
export async function apiUpload<T>(
  path: string,
  field: string,
  file: UploadFile,
  token?: string | null,
  opts: UploadOptions = {}
): Promise<T> {
  if (__DEV__) {
    console.log(
      '[apiUpload] START',
      '\npath:', path,
      '\nfield:', field,
      '\nfile.uri:', file.uri,
      '\nfile.name:', file.name,
      '\nfile.type:', file.type,
      '\ntoken present:', !!token
    );
  }

  const form = new FormData();
  // The cast is unavoidable and is not a lie about the runtime: RN's XHR native
  // layer accepts this object shape and streams the file behind it, while the
  // DOM lib's type for `append` only knows about `Blob | string`.
  //
  // NOTE: This intentionally uses XMLHttpRequest, NOT fetch. React Native's New
  // Architecture changed fetch's FormData handling on iOS: appending a plain
  // { uri, name, type } object now throws "Unsupported FormDataPart
  // implementation" before the request ever leaves the device. XHR's native
  // layer (NSURLSession on iOS, OkHttp on Android) still accepts this pattern,
  // making XHR the only reliable way to upload a file URI in RN New Arch.
  form.append(field, file as unknown as Blob);
  for (const [key, value] of Object.entries(opts.fields ?? {})) {
    form.append(key, value);
  }

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}${path}`);
    xhr.setRequestHeader('Accept', 'application/json');
    // Content-Type is deliberately NOT set — the multipart boundary is appended
    // automatically by the XHR / native layer, for the same reason the old fetch
    // path never set it either.
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    // Native timeout: fires ontimeout if no complete response within this budget.
    xhr.timeout = opts.timeoutMs ?? UPLOAD_TIMEOUT_MS;

    // Wire up the external cancel signal (the screen's "Batalkan" button).
    const onExternalAbort = () => xhr.abort();
    opts.signal?.addEventListener('abort', onExternalAbort);
    const cleanup = () => opts.signal?.removeEventListener('abort', onExternalAbort);

    xhr.onload = () => {
      cleanup();
      let envelope: (ErrorEnvelope & { data?: T }) | null = null;
      try {
        envelope = JSON.parse(xhr.responseText) as ErrorEnvelope & { data?: T };
      } catch {
        envelope = null;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          new ApiError(
            envelope?.errors || `Server menjawab ${xhr.status}.`,
            xhr.status,
            envelope?.validation_errors
          )
        );
        return;
      }
      if (!envelope) {
        reject(new ApiError('Jawaban server tidak sesuai kontrak.', xhr.status));
        return;
      }
      if (envelope.data === undefined) {
        reject(new ApiError('Jawaban server tidak sesuai kontrak.', 200));
        return;
      }
      resolve(envelope.data);
    };

    xhr.onerror = () => {
      cleanup();
      reject(new ApiError('Tidak bisa menghubungi server. Periksa koneksi Anda.', 0));
    };

    xhr.ontimeout = () => {
      cleanup();
      reject(
        new ApiError(
          'Unggahan tidak selesai tepat waktu. Coba lagi dengan sinyal yang lebih baik.',
          0
        )
      );
    };

    xhr.onabort = () => {
      cleanup();
      // External signal means the person tapped "Batalkan" — status -1 so the
      // screen knows not to show it as an error. Any other abort (currently
      // unused) is treated the same as a timeout.
      if (opts.signal?.aborted) {
        reject(new ApiError('Dibatalkan.', -1));
      } else {
        reject(
          new ApiError(
            'Unggahan tidak selesai tepat waktu. Coba lagi dengan sinyal yang lebih baik.',
            0
          )
        );
      }
    };

    xhr.send(form);
  });
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
