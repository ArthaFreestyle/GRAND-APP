/**
 * The authenticated way to call the API. Every `/api/v1` route except
 * `auth/login`, `auth/refresh`, and `auth/logout` goes through here.
 *
 * On top of `services/api.ts` this adds the three things every screen would
 * otherwise reimplement: attaching the bearer token, renewing it before or
 * after it expires, and turning the contract's 401/403 into errors that say
 * what the caller should actually do about them.
 */
import {
  ApiError,
  apiRequest,
  apiRequestPaged,
  apiUpload,
  type Paged,
  type RequestOptions,
  type UploadFile,
  type UploadOptions,
} from '@/services/api';
import { refresh } from '@/services/auth';
import { clearSession, getSession, hasActiveContext, type Session } from '@/services/session';

/** No session at all, or one that can no longer be renewed: sign in again. */
export class SessionExpiredError extends ApiError {
  constructor(message = 'Sesi Anda sudah berakhir. Masuk lagi.') {
    super(message, 401);
    this.name = 'SessionExpiredError';
  }
}

/**
 * The session holds usable grants but has not picked one. Every role-guarded
 * endpoint answers `role tidak mencukupi` in this state — **including ones the
 * caller really does hold in another grant** — so this is a prompt to choose a
 * context, not a permission problem.
 */
export class NoActiveContextError extends ApiError {
  constructor(message = 'Pilih peran dulu sebelum melanjutkan.') {
    super(message, 403);
    this.name = 'NoActiveContextError';
  }
}

/** The active grant genuinely does not carry this permission. */
export class ForbiddenError extends ApiError {
  constructor(message = 'Peran Anda tidak punya akses ke tindakan ini.') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

/** Renew this long before `expires_at` rather than letting a request fail first. */
const REFRESH_SKEW_MS = 60_000;

/**
 * In-flight refresh, shared by every caller that needs one.
 *
 * This is not an optimization. The refresh token is rotated and deleted on
 * first use, so two requests racing to renew would burn it: the first rotates
 * it, the second replays a value the server has already dropped and gets the
 * whole session logged out. One flight, many awaiters.
 */
let inFlight: Promise<Session> | null = null;

function refreshSession(): Promise<Session> {
  if (!inFlight) {
    inFlight = performRefresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function performRefresh(): Promise<Session> {
  const session = getSession();
  if (!session?.refreshToken) {
    clearSession();
    throw new SessionExpiredError();
  }
  try {
    return await refresh(session.refreshToken);
  } catch {
    // Expired, replayed, or revoked — all of them mean the same thing here.
    clearSession();
    throw new SessionExpiredError();
  }
}

/**
 * Maps a raw `ApiError` onto the three outcomes a caller can act on. A 403 is
 * split by whether the session has picked a context yet, because the server
 * cannot tell those apart for us — it answers `role tidak mencukupi` either way.
 */
function translate(e: unknown): unknown {
  if (!(e instanceof ApiError)) return e;
  if (e.status === 401) return new SessionExpiredError();
  if (e.status === 403) {
    return hasActiveContext(getSession()) ? new ForbiddenError(e.message) : new NoActiveContextError();
  }
  return e;
}

export interface FreshTokenOptions {
  /**
   * Renew this long before expiry instead of `REFRESH_SKEW_MS`.
   *
   * A call whose own budget is longer than the default 60s skew can have the
   * token die *during* it with no window left to recover — the OCR endpoints
   * pass `OCR_TIMEOUT_MS + 60_000` here for exactly that reason (see
   * `services/ocr-pembelian.ts`).
   */
  skewMs?: number;
  /**
   * `false` disables the 401-retry-once path below. The retry re-sends the
   * whole request body, and for an upload that bills a downstream service per
   * attempt (Gemini, through the OCR endpoints), retrying automatically is
   * worse than surfacing the failure and letting a human press "Coba lagi".
   */
  retryOn401?: boolean;
}

async function withFreshToken<T>(
  run: (token: string) => Promise<T>,
  opts: FreshTokenOptions = {}
): Promise<T> {
  const { skewMs = REFRESH_SKEW_MS, retryOn401 = true } = opts;
  let session = getSession();
  if (!session) throw new SessionExpiredError();

  // Renew proactively when the window is nearly closed, so a long screen load
  // does not half-succeed against a token that expires mid-flight.
  if (session.refreshToken && session.expiresAt - Date.now() < skewMs) {
    session = await refreshSession();
  }

  try {
    return await run(session.token);
  } catch (e) {
    // A 401 here means the token died earlier than its own `expires_at` said —
    // password change, revoked grants. Renew once and retry; never loop.
    if (retryOn401 && e instanceof ApiError && e.status === 401 && getSession()?.refreshToken) {
      const renewed = await refreshSession();
      try {
        return await run(renewed.token);
      } catch (retryError) {
        throw translate(retryError);
      }
    }
    throw translate(e);
  }
}

/** An authenticated request returning the `data` payload. */
export function authedRequest<T>(
  path: string,
  options: Omit<RequestOptions, 'token'> = {}
): Promise<T> {
  return withFreshToken((token) => apiRequest<T>(path, { ...options, token }));
}

/** An authenticated list request returning `data` together with `paging`. */
export function authedList<T>(
  path: string,
  options: Omit<RequestOptions, 'token'> = {}
): Promise<Paged<T>> {
  return withFreshToken((token) => apiRequestPaged<T>(path, { ...options, token }));
}

/**
 * An authenticated multipart upload returning the `data` payload.
 *
 * It goes through `withFreshToken` like every other call rather than reading
 * the session directly, and that matters more here than anywhere else: an
 * upload can be in flight for a minute, which is long enough for the token to
 * expire *during* it. The proactive renewal above happens before the file
 * starts moving, and the 401 retry below re-sends it — the one case in this app
 * where a retry costs real bytes, and the reason the skew window exists at all.
 *
 * `opts` carries both `UploadOptions` (fields, timeoutMs, an external cancel
 * signal) and `FreshTokenOptions` (a wider skew, retry-on-401 off) in one bag,
 * because a caller with an unusual timeout budget — the OCR endpoints — always
 * needs an unusual skew to match, and passing them separately would let the
 * two drift apart.
 */
export function authedUpload<T>(
  path: string,
  field: string,
  file: UploadFile,
  opts: UploadOptions & FreshTokenOptions = {}
): Promise<T> {
  return withFreshToken((token) => apiUpload<T>(path, field, file, token, opts), opts);
}
