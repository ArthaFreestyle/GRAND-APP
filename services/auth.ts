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
  type User,
} from '@/services/session';
import type { components } from '@/types/api';

/** What `GET /auth/me` answers — the token's own claims, not a fresh read of `users`. Strictly less than `Session` above; see `getMe` for why it is read at all. */
export type MeSession = components['schemas']['Session'];

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
 * Changes the caller's own password. `POST /auth/me/password`, open to any
 * authenticated caller with no role guard — the same footing as `auth/me` and
 * `switch-context` — so this is called with the session's own token by hand
 * (`apiRequest`, not `services/client.ts`'s `authedRequest`) for the same
 * reason `switchContext` is: `services/client.ts` imports `refresh` from this
 * module to retry an expired token, and importing `authedRequest` back would
 * close that into a cycle. A password change is rare enough that skipping the
 * proactive-refresh-and-retry `authedRequest` gives is not worth it.
 *
 * `password_lama` is verified server-side even though the caller is already
 * authenticated — a stolen access token must not be able to lock the real
 * owner out of their own account — and a wrong one answers the same message as
 * `POST /auth/login`, undistinguished from any other cause.
 *
 * **Success revokes every refresh token this user holds**, on every device.
 * That is `POST /auth/me/password`'s own side effect, not something this app
 * does separately: another session loses access once its access token expires
 * (`jwt.ttl_minutes`, default 15 minutes), not instantly. This session's own
 * access token is still the one just used to call this endpoint, so nothing
 * here needs to sign this device out.
 */
export async function changePassword(
  passwordLama: string,
  passwordBaru: string
): Promise<User> {
  const session = getSession();
  if (!session) throw new ApiError('Sesi sudah berakhir. Masuk lagi.', 401);
  try {
    return await apiRequest<User>('/api/v1/auth/me/password', {
      method: 'POST',
      token: session.token,
      body: { password_lama: passwordLama, password_baru: passwordBaru },
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      throw new ApiError(GENERIC_LOGIN_FAILURE, 401);
    }
    throw e;
  }
}

/**
 * Reads what the current token authorizes, straight from the server.
 *
 * `app/(admin)/profil.tsx` deliberately does **not** call this for its own
 * identity block — `Session` here is strictly less than what login already put
 * in `services/session.ts`. The one caller that needs it is issue #42's own
 * self-edit trap in `app/pengguna/[id]/ubah.tsx`: saving a change to *your own*
 * grants does not refresh the token, because the active context lives inside
 * the credential and only `auth/switch-context` can change it. Reading this
 * afterwards is how that screen tells whether the grant it is still running as
 * survived the edit, without waiting for the token to expire to find out.
 */
export async function getMe(): Promise<MeSession> {
  const session = getSession();
  if (!session) throw new ApiError('Sesi sudah berakhir. Masuk lagi.', 401);
  return apiRequest<MeSession>('/api/v1/auth/me', { token: session.token });
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
