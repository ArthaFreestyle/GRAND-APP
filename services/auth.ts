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
  recallGrant,
  rememberGrant,
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
  // Recorded after the server accepted it, not when it was tapped: what gets
  // remembered has to be a choice that actually worked, or tomorrow's sign-in
  // resumes straight into a grant that will only be refused again.
  void rememberGrant(session.user.id, idUserRole);
  return session;
}

/**
 * Re-activates the grant this user last worked as on this device.
 *
 * Login leaves `active: null` whenever more than one grant is usable, and the
 * honest answer to that is usually not a question — the same person picks the
 * same grant nearly every day. This resumes it silently and hands back the
 * activated session; the picker is then only shown to someone who genuinely has
 * a choice to make for the first time.
 *
 * Returns `null` when there is nothing to resume, which covers every way this
 * can go stale at once: nothing remembered here yet, a grant the server no
 * longer lists (revoked, or its role or unit retired), or a switch the server
 * refused. All of them mean the same thing to the caller — ask.
 */
export async function resumeLastGrant(session: Session): Promise<Session | null> {
  if (session.active) return session;
  const remembered = await recallGrant(session.user.id);
  if (remembered === null) return null;
  // The remembered id is not evidence of anything on its own; `grants` is the
  // server's current list of what this login may actually become.
  if (!session.grants.some((g) => g.id_user_role === remembered)) return null;
  try {
    return await switchContext(remembered);
  } catch {
    return null;
  }
}

/**
 * Exchanges a refresh token for a fresh pair. The contract **rotates the token
 * on every use** — the one sent is deleted atomically before anything else
 * happens — so a replay is rejected exactly like an expired token. That is why
 * only `services/client.ts` calls this, behind a single-flight guard.
 *
 * The old token's active context is re-read from the database rather than
 * trusted from its claims, so the new token can come back **without an active
 * context** if the grant was revoked or retired in the meantime. Callers must
 * treat that like an ambiguous login, not like a failure.
 */
export async function refresh(refreshToken: string): Promise<Session> {
  const result = await apiRequest<LoginResult>('/api/v1/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  });
  // Deliberately no `previous`: refresh always issues a new refresh token, and
  // carrying the old one forward would keep a value the server just deleted.
  const session = sessionFromLoginResult(result);
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
