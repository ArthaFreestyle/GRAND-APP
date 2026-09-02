/**
 * A module-level `useState` for screens that are not wired to an endpoint yet.
 *
 * Two back-office sections still run on seeded in-memory data — mutasi &
 * pemakaian, and stok opname — because neither is wired yet. That was harmless
 * while each was a single route holding its rows in `useState`: the list and
 * the detail were the same component. Split into routes they are not, and a
 * detail that cannot see what the list is holding would have to invent its own
 * copy of the dataset.
 *
 * So the dataset moved out of the component and the screens subscribe to it.
 * This is deliberately the smallest possible store — no actions, no reducers,
 * no selectors — because every one of these is scaffolding to be deleted the
 * day its endpoint lands, and `services/produk.ts` shows what replaces it.
 */
import { useSyncExternalStore } from 'react';

export interface LocalStore<T> {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (onChange: () => void) => () => void;
}

export function createLocalStore<T>(initial: T): LocalStore<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
      if (Object.is(resolved, value)) return;
      value = resolved;
      for (const listener of [...listeners]) listener();
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
  };
}

/**
 * Re-renders on every write. `useSyncExternalStore` rather than an effect: the
 * value is read during render, so a screen mounting after a write must never
 * paint the state that came before it.
 */
export function useLocalStore<T>(store: LocalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
