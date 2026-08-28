/**
 * The three `auth` calls the login flow needs. Sign-in is two steps whenever the
 * user holds more than one usable grant: `login` returns a token with no active
 * context, and `switchContext` exchanges it for one that actually authorizes
 * something.
 */
import { ApiError, apiRequest } from '@/services/api';
import {
  clearSession,
  getSession,
  sessionFromLoginResult,
  setSession,
  type LoginResult,
  type Session,
} from '@/services/session';

/**
 * The contract answers every login failure — unknown username, wrong password,
 * deactivated account — with one message, so telling them apart here would undo
 * that. Anything that is not a 401 keeps the server's own wording.
 */
const GENERIC_LOGIN_FAILURE = 'Nama pengguna atau kata sandi salah.';

/** `switch-context` collapses every failure into the same 403 for the same reason. */
const GENERIC_CONTEXT_FAILURE = 'Peran itu tidak lagi tersedia untuk Anda. Pilih yang lain.';

/**
 * Exchanges credentials for a token and installs the session. The result may
 * have `active: null` (more than one usable grant) or an empty `grants` list
 * (the token authorizes nothing) — the caller decides what to do about it.
 */
export async function login(username: string, password: string): Promise<Session> {
  let result: LoginResult;
  try {
    result = await apiRequest<LoginResult>('/api/v1/auth/login', {
      method: 'POST',
      body: { username, password },
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      throw new ApiError(GENERIC_LOGIN_FAILURE, 401);
    }
    throw e;
  }

  const session = sessionFromLoginResult(result);
  setSession(session);
  return session;
}

/**
 * Picks one grant as the session's active context, issuing a fresh token. The
 * previous token stays valid until it expires — switching is a least-privilege
 * control, not a revocation.
 */
export async function switchContext(idUserRole: number): Promise<Session> {
  const previous = getSession();
  if (!previous) throw new ApiError('Sesi sudah berakhir. Masuk lagi.', 401);

  let result: LoginResult;
  try {
    result = await apiRequest<LoginResult>('/api/v1/auth/switch-context', {
      method: 'POST',
      token: previous.token,
      body: { id_user_role: idUserRole },
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) {
      throw new ApiError(GENERIC_CONTEXT_FAILURE, 403);
    }
    throw e;
  }

  const session = sessionFromLoginResult(result, previous);
  setSession(session);
  return session;
}

/**
 * Revokes the refresh token and drops the session. The access token itself
 * cannot be revoked, so the local drop is what actually ends the session on this
 * device; a failed revoke must not strand the user on a screen they are trying
 * to leave, so it is swallowed.
 */
export async function logout(): Promise<void> {
  const session = getSession();
  clearSession();
  if (!session?.refreshToken) return;
  try {
    await apiRequest<unknown>('/api/v1/auth/logout', {
      method: 'POST',
      body: { refresh_token: session.refreshToken },
    });
  } catch {
    // Nothing useful to do: the session is already gone locally.
  }
}
