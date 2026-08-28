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
}

const SECURE_KEY = 'grand.session.credentials';
const PROFILE_KEY = 'grand.session.profile';

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
        current = { ...credentials, ...profile };
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
 * across `auth/switch-context`, whose response leaves `refresh_token` null.
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
  };
}

/** A session that has picked a grant, and so actually authorizes something. */
export type ActiveSession = Session & { active: ActiveContext };

/** True once the session has an active grant — the only state in which it authorizes anything. */
export function hasActiveContext(session: Session | null): session is ActiveSession {
  return session !== null && session.active !== null;
}
