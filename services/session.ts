/**
 * The one authenticated session the app holds.
 *
 * Deliberately **in memory only**: the contract's access token is stateless and
 * cannot be revoked (`expires_at`, default 60 min, is the real limit), and this
 * app has no vetted secure-storage pattern yet — see issue #2, which defers the
 * memory-vs-device-storage decision to its own discussion. Keeping it here means
 * closing the app ends the session, which is the safe default to start from.
 */
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

let current: Session | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function getSession(): Session | null {
  return current;
}

export function setSession(session: Session | null) {
  current = session;
  emit();
}

export function clearSession() {
  setSession(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders on login, context switch, and logout. */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession, getSession);
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
