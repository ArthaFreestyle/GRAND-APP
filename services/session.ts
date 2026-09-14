/**
 * The one authenticated session the app holds, and its persistence.
 *
 * **Split storage, on purpose.** The access and refresh tokens are the actual
 * credentials, so they live in `expo-secure-store` (Keystore on Android,
 * Keychain on iOS). Everything else — who the user is, which grants they hold —
 * is not secret and goes to `AsyncStorage`, because SecureStore values are
 * capped around 2 KB on Android and a JWT carrying several grants can get close
 * to that on its own. Both halves are written and cleared together.
 *
 * **The session survives the app being killed.** That is the point of storing
 * it: the access token expires after ~60 minutes, and without a persisted
 * refresh token a cashier would be typing their password every hour. Storing
 * the refresh token is what makes a workday-long session possible, and it is
 * exactly why it goes in the Keystore rather than beside the profile data.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import type { components } from '@/types/api';

export type Grant = components['schemas']['Grant'];
export type ActiveContext = NonNullable<components['schemas']['ActiveContext']>;
export type LoginResult = components['schemas']['LoginResult'];
export type User = components['schemas']['User'];

export interface Session {
  token: string;
  /** Absolute expiry, epoch ms — the contract sends a timestamp precisely so the client need not guess when it received the response. */
  expiresAt: number;
  /** Only `auth/login` and `auth/refresh` issue one; `auth/switch-context` does not, so it is carried over. */
  refreshToken: string | null;
  user: User;
  grants: Grant[];
  /** `null` means more than one usable grant and none picked yet: the token authorizes nothing until `auth/switch-context`. */
  active: ActiveContext | null;
  /**
   * Whether the person has *chosen* this session's context on this device,
   * rather than having had one handed to them.
   *
   * The contract activates a grant server-side whenever exactly one is usable,
   * so `active` alone cannot tell "I picked this" from "this is all there was".
   * Every sign-in now goes through `/pilih-peran` regardless — a shared counter
   * terminal is signed into by whoever is on shift, and the screen that names
   * the unit kerja and role they are about to work as is the last cheap moment
   * to catch a wrong one. This flag is what makes that possible without asking
   * a second time on every token refresh.
   *
   * **In-memory only.** `StoredProfile` does not carry it, and
   * `hydrateSession` restores it as `true`: reopening the app is not a sign-in,
   * and someone whose session survived a restart answered this question
   * already.
   */
  contextChosen: boolean;
}

const SECURE_KEY = 'grand.session.credentials';
const PROFILE_KEY = 'grand.session.profile';
const LAST_GRANT_KEY = 'grand.session.last-grant';

let current: Session | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getSession(): Session | null {
  return current;
}

/** False until `hydrateSession()` has finished, so the UI can hold the splash instead of flashing the login screen. */
export function isHydrated() {
  return hydrated;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders on login, context switch, refresh, and logout. */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession, getSession);
}

// ---- persistence ----

interface StoredCredentials {
  token: string;
  refreshToken: string | null;
  expiresAt: number;
}

type StoredProfile = Pick<Session, 'user' | 'grants' | 'active'>;

async function persist(session: Session) {
  const credentials: StoredCredentials = {
    token: session.token,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
  };
  const profile: StoredProfile = {
    user: session.user,
    grants: session.grants,
    active: session.active,
  };
  await Promise.all([
    SecureStore.setItemAsync(SECURE_KEY, JSON.stringify(credentials)),
    AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile)),
  ]);
}

async function forget() {
  await Promise.all([
    SecureStore.deleteItemAsync(SECURE_KEY),
    AsyncStorage.removeItem(PROFILE_KEY),
  ]);
}

/**
 * Writes the session through to storage. Storage failures — a locked Keystore,
 * a value over the size cap — must not take the signed-in session down with
 * them, so the in-memory session stands and only persistence is lost.
 */
export function setSession(session: Session | null) {
  current = session;
  emit();
  const write = session ? persist(session) : forget();
  write.catch(() => {
    // Nothing to surface: the user is signed in either way, they just won't
    // still be after a restart.
  });
}

export function clearSession() {
  setSession(null);
}

/**
 * Restores a persisted session at startup. Call once, before the first screen.
 * A session whose access token has already expired is still restored when a
 * refresh token came with it — refreshing is exactly what that token is for,
 * and dropping it here would log the user out every time they closed the app.
 */
export async function hydrateSession(): Promise<Session | null> {
  if (hydrated) return current;
  try {
    const [rawCredentials, rawProfile] = await Promise.all([
      SecureStore.getItemAsync(SECURE_KEY),
      AsyncStorage.getItem(PROFILE_KEY),
    ]);
    if (rawCredentials && rawProfile) {
      const credentials = JSON.parse(rawCredentials) as StoredCredentials;
      const profile = JSON.parse(rawProfile) as StoredProfile;
      const usable = credentials.refreshToken || credentials.expiresAt > Date.now();
      if (usable) {
        // `contextChosen` is not stored: see the field's note. A restored
        // session is one whose grant was picked before the app was closed, so
        // reopening must not send the user back to the picker.
        current = { ...credentials, ...profile, contextChosen: true };
      } else {
        await forget();
      }
    }
  } catch {
    // Unreadable or half-written storage is treated as no session at all.
    current = null;
  }
  hydrated = true;
  emit();
  return current;
}

/**
 * Turns a `LoginResult` into a session. `previous` carries the refresh token
 * across `auth/switch-context`, whose response leaves `refresh_token` null, and
 * carries `contextChosen` across a token refresh — a refresh mid-shift is not a
 * new sign-in and must not re-ask which grant to work as. A `login` passes no
 * `previous`, which is exactly why it comes out unchosen.
 */
export function sessionFromLoginResult(result: LoginResult, previous?: Session | null): Session {
  if (!result.token || !result.expires_at || !result.user) {
    throw new Error('Jawaban login tidak lengkap.');
  }
  const expiresAt = Date.parse(result.expires_at);
  return {
    token: result.token,
    expiresAt: Number.isNaN(expiresAt) ? Date.now() : expiresAt,
    refreshToken: result.refresh_token ?? previous?.refreshToken ?? null,
    user: result.user,
    grants: result.grants ?? [],
    active: result.aktif ?? null,
    contextChosen: previous?.contextChosen ?? false,
  };
}

/**
 * Records that the active context on screen is the one the person picked.
 *
 * Only `/pilih-peran` calls it, and only for the grant the server had already
 * activated — the single-grant case, where `auth/switch-context` would issue a
 * second token for the context the session is already running as. Every other
 * choice goes through `switchContext`, which sets the same flag as part of a
 * real switch.
 */
export function markContextChosen() {
  if (current && !current.contextChosen) setSession({ ...current, contextChosen: true });
}

// ---- the grant each user last worked as ----

/**
 * Which grant every user of *this device* last picked, keyed by user id.
 *
 * Deliberately outside the session, and deliberately **not cleared on logout**:
 * the entire point is that it is still there tomorrow morning, when the same
 * cashier signs in and would otherwise be asked again the question they already
 * answered yesterday. Someone who holds two grants uses the same one almost
 * every day; asking daily is a question with a 95% predictable answer.
 *
 * Keyed by user id because a POS terminal is shared hardware. An unkeyed "last
 * grant" would preselect the closing shift's role for whoever opens tomorrow —
 * which is worse than asking, because it is wrong silently. The map grows by
 * one small integer per person who has ever signed in here, which is why it is
 * not capped.
 *
 * It is a convenience and never an authorization: the id is only acted on when
 * the server still lists it among that login's `grants`, and
 * `auth/switch-context` re-checks it server-side regardless.
 */
type LastGrants = Record<string, number>;

async function readLastGrants(): Promise<LastGrants> {
  try {
    const raw = await AsyncStorage.getItem(LAST_GRANT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    // Anything but a plain object is treated as nothing remembered rather than
    // thrown: a corrupt convenience must not break signing in.
    return parsed && typeof parsed === 'object' ? (parsed as LastGrants) : {};
  } catch {
    return {};
  }
}

export async function rememberGrant(userId: number | undefined, idUserRole: number): Promise<void> {
  if (userId === undefined) return;
  try {
    const all = await readLastGrants();
    all[String(userId)] = idUserRole;
    await AsyncStorage.setItem(LAST_GRANT_KEY, JSON.stringify(all));
  } catch {
    // Losing the memory only costs one extra tap at the next sign-in.
  }
}

/** The `id_user_role` this user last activated here, or `null` if none is remembered. */
export async function recallGrant(userId: number | undefined): Promise<number | null> {
  if (userId === undefined) return null;
  const all = await readLastGrants();
  const remembered = all[String(userId)];
  return typeof remembered === 'number' ? remembered : null;
}

/** A session that has picked a grant, and so actually authorizes something. */
export type ActiveSession = Session & { active: ActiveContext };

/** True once the session has an active grant — the only state in which it authorizes anything. */
export function hasActiveContext(session: Session | null): session is ActiveSession {
  return session !== null && session.active !== null;
}

/**
 * True once the session both authorizes something **and** is running as the
 * grant the person picked — the state the app's own screens are guarded on.
 *
 * The two halves are separate because the server closes the first one by itself
 * for a single-grant login: such a token authorizes plenty while its holder has
 * not yet been shown, let alone confirmed, which unit kerja they are about to
 * write to.
 */
export function hasChosenContext(session: Session | null): session is ActiveSession {
  return hasActiveContext(session) && session.contextChosen;
}
