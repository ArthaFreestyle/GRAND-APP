/**
 * The `auth` calls the login flow needs. **Sign-in is always two steps**:
 * `login` proves who you are, and the grant to work as is picked afterwards on
 * `/pilih-peran`. The contract makes the second step mandatory only when more
 * than one grant is usable — with exactly one it activates that grant itself,
 * and `login` comes back already authorizing things — but the app asks either
 * way, so the person can see the role and unit kerja they are about to write to
 * before they write to it. `Session.contextChosen` is what carries that
 * distinction; the server has no notion of it.
 */
import { ApiError, apiRequest } from '@/services/api';
import {
  clearSession,
  getSession,
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

  // A switch *is* the choice, so the session it produces is a chosen one — both
  // for the picker after login and for the role switcher inside the app.
  const session = { ...sessionFromLoginResult(result, previous), contextChosen: true };
  setSession(session);
  // Recorded after the server accepted it, not when it was tapped: what gets
  // remembered has to be a choice that actually worked, or tomorrow's sign-in
  // resumes straight into a grant that will only be refused again.
  void rememberGrant(session.user.id, idUserRole);
  return session;
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
  // `previous` is passed for `contextChosen` alone — a refresh happens mid-work
  // and must not throw the user back to the picker. The refresh token itself is
  // not carried: refresh always issues a new one, and keeping the old would
  // hold a value the server just deleted. `sessionFromLoginResult` prefers the
  // response's own token, so passing `previous` cannot resurrect it.
  const session = sessionFromLoginResult(result, getSession());
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
