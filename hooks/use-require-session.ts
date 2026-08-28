/**
 * Guards a screen that only makes sense for a signed-in session.
 *
 * Sends the viewer back to the login screen unless the session has an **active
 * context**, not merely a token: a session that has not picked a grant is
 * answered `role tidak mencukupi` by every role-guarded endpoint, so letting it
 * onto a back-office screen would only produce a wall of 403s. Landing on `/`
 * puts it in front of the grant picker instead.
 *
 * Returns whether the screen may render, so callers can hold their content back
 * during the redirect instead of painting a frame of empty state.
 */
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { hasActiveContext, useSession } from '@/services/session';

export function useRequireSession(): boolean {
  const router = useRouter();
  const session = useSession();
  const allowed = hasActiveContext(session);

  useEffect(() => {
    if (!allowed) router.replace('/');
  }, [allowed, router]);

  return allowed;
}
