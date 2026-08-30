/**
 * Cross-route record sync.
 *
 * A detail screen and the list behind it used to be two branches of one
 * component sharing one `rows` array, so a write in the detail could patch the
 * row it came from directly. As routes they are two screens: the list stays
 * mounted underneath the pushed detail — that is the point, its scroll and its
 * appended pages survive — but nothing hands it the record that just changed.
 *
 * This is the smallest thing that closes that gap. It is deliberately *not* a
 * cache: the list still owns its rows, it just gets told which ones moved. A
 * real query cache would have to model offset paging, the filter chips, and the
 * two endpoints that answer different shapes for the same screen — all state
 * the list already holds correctly and has no reason to hand over.
 *
 * `saved` carries the record the server answered with, so a subscriber patches
 * in place and keeps its scroll. `reload` is for the changes a patch cannot
 * express — a record that was just created, or one that left the filtered set —
 * where re-reading page one is the honest answer.
 */
import { useEffect, useRef } from 'react';

export type RecordChange<T> = { kind: 'saved'; row: T } | { kind: 'reload' };

export interface RecordBus<T> {
  publish: (change: RecordChange<T>) => void;
  subscribe: (listener: (change: RecordChange<T>) => void) => () => void;
}

/**
 * Every bus that has ever been created, so something can address all of them at
 * once without importing nine service modules to find them.
 *
 * There is exactly one caller and one reason for it: switching the active grant
 * changes *which unit kerja's rows the API answers with*, which invalidates
 * every list in the app at the same instant — not because a record changed, but
 * because the question did. That is the one event no section can learn about
 * from its own screen.
 */
const BUSES = new Set<RecordBus<unknown>>();

/**
 * One bus per section, declared next to that section's row type. Module level,
 * so it outlives every screen that talks over it — a detail route publishing
 * while its list is being unmounted is a no-op, not a crash.
 */
export function createRecordBus<T>(): RecordBus<T> {
  const listeners = new Set<(change: RecordChange<T>) => void>();
  const bus: RecordBus<T> = {
    publish(change) {
      // Copied first: a listener that unsubscribes while handling the change
      // must not shorten the set being iterated.
      for (const listener of [...listeners]) listener(change);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  BUSES.add(bus as RecordBus<unknown>);
  return bus;
}

/**
 * Tells every mounted list to re-read page one. Lists that are not mounted need
 * no telling: they fetch when they mount.
 *
 * `reload` rather than `saved` on purpose — after a context switch the old rows
 * are not stale versions of the new ones, they are rows the session can no
 * longer see at all, so there is nothing to patch in place.
 */
export function reloadAllRecords() {
  for (const bus of BUSES) bus.publish({ kind: 'reload' });
}

/**
 * Subscribes for the life of the screen. The handler is read through a ref, so
 * a list that rebuilds its callback on every appended page does not resubscribe
 * — and cannot miss a change in the gap between the two.
 */
export function useRecordBus<T>(bus: RecordBus<T>, onChange: (change: RecordChange<T>) => void) {
  const handler = useRef(onChange);
  // Refreshed in an effect rather than during render: this project builds with
  // the React Compiler, and a render that writes to a ref is the one thing it
  // is not allowed to memoize. Effects run in declaration order, so the handler
  // is current before the subscription below is ever opened.
  useEffect(() => {
    handler.current = onChange;
  });
  useEffect(() => bus.subscribe((change) => handler.current(change)), [bus]);
}
