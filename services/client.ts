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
  type Paged,
  type RequestOptions,
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

async function withFreshToken<T>(run: (token: string) => Promise<T>): Promise<T> {
  let session = getSession();
  if (!session) throw new SessionExpiredError();

  // Renew proactively when the window is nearly closed, so a long screen load
  // does not half-succeed against a token that expires mid-flight.
  if (session.refreshToken && session.expiresAt - Date.now() < REFRESH_SKEW_MS) {
    session = await refreshSession();
  }

  try {
    return await run(session.token);
  } catch (e) {
    // A 401 here means the token died earlier than its own `expires_at` said —
    // password change, revoked grants. Renew once and retry; never loop.
    if (e instanceof ApiError && e.status === 401 && getSession()?.refreshToken) {
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
