/**
 * The list every back-office screen shows its records in.
 *
 * This replaces `DataTable` for the list view. A table with fixed-width columns
 * needs 640-740pt before every column is on screen; a phone in portrait has
 * ~354pt after the page padding, so half the columns lived off the right edge
 * behind a scroll gesture nobody performs. The fix is not a narrower table - it
 * is not being a table. One row layout, adapting at the breakpoint:
 *
 *   phone      identity on top, fields stacked underneath as label/value pairs
 *   tablet+    identity on the left, fields ranged right in their own columns
 *
 * Neither ever scrolls horizontally.
 *
 * Row actions are gestures rather than buttons, because a button per row costs
 * width on the axis that is already short and invites the mis-taps that make a
 * list feel fragile:
 *
 *   tap          the primary action, always the same one - open the record
 *   swipe left   the quick actions, `quick: true`
 *   long-press   selection mode, for acting on several at once
 *   the menu     every action, for anyone who never discovers the swipe
 *
 * Destructive actions are deliberately not swipeable - `quick` is ignored on an
 * action marked `danger`, which keeps them behind the menu where they stay
 * deliberate. Anything reversible runs immediately and offers `UndoBar` instead
 * of asking first.
 */
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Box } from '@/components/ui/box';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { atLeast, useBreakpoint } from '@/hooks/use-breakpoint';

/** One secondary value on a record, already formatted for display. */
export interface RecordField {
  label: string;
  value: string;
  /** Draws the value in the danger colour - a stock below its reorder point. */
  danger?: boolean;
  /** Column width from `tablet` up. Ignored on a phone, where fields stack. */
  width?: number;
}

/** A record as the list shows it: the screen formats, this only arranges. */
export interface RecordItem {
  id: number;
  title: string;
  /** Sits beside the title, e.g. "Nonaktif". */
  badge?: string;
  /** The line under the title - a code, a date, whatever identifies it. */
  meta: string;
  fields: RecordField[];
  /** Dims the row. For records that are archived rather than missing. */
  dimmed?: boolean;
  /**
   * Overrides the list's `actions` for this record - "Arsipkan" and "Aktifkan"
   * are the same action pointing opposite ways, and only the record knows which.
   * It lives on the item rather than behind a `(item) => actions` callback so it
   * is built once with the item and stays referentially stable for `memo`.
   */
  actions?: RecordAction[];
}

export interface RecordAction {
  key: string;
  label: string;
  /** Offer it in the swipe drawer. Ignored when `danger` is set. */
  quick?: boolean;
  /** Keeps it out of the swipe drawer and colours it in the menu. */
  danger?: boolean;
}

const FIELD_GAP = 14;

/**
 * One shared empty array for both action defaults. `= []` in the parameter list
 * allocates a new one on every render, which changes `renderItem`'s identity and
 * fails the row comparator's `actions === actions` check - defeating the whole
 * point of memoising the row.
 */
const NO_ACTIONS: RecordAction[] = [];

// ---- row ----

function FieldValue({ field, dimmed }: { field: RecordField; dimmed?: boolean }) {
  return (
    <Text
      className={`text-[14.5px] font-semibold ${
        field.danger ? 'text-danger' : dimmed ? 'text-faint-2' : 'text-foreground'
      }`}>
      {field.value}
    </Text>
  );
}

interface RowProps {
  item: RecordItem;
  wide: boolean;
  selecting: boolean;
  selected: boolean;
  actions: RecordAction[];
  onOpen: (id: number) => void;
  onToggle: (id: number) => void;
  onLongPress: (id: number) => void;
  onAction: (key: string, item: RecordItem) => void;
  onMenu: (id: number) => void;
}

function sameFields(a: RecordField[], b: RecordField[]) {
  if (a.length !== b.length) return false;
  return a.every((f, i) => {
    const g = b[i];
    return f.label === g.label && f.value === g.value && f.danger === g.danger && f.width === g.width;
  });
}

/**
 * Compared by value, not identity.
 *
 * A screen builds its `RecordItem`s by mapping over the rows it holds, so every
 * appended page hands back a brand new object for every row already on screen.
 * Under the default shallow compare that re-renders the whole list on each page
 * - which is exactly the "large list that is slow to update" VirtualizedList
 * warns about. Nothing here is deep: a record is a title, a meta line and a
 * handful of formatted strings.
 */
function areRowPropsEqual(a: RowProps, b: RowProps) {
  return (
    a.wide === b.wide &&
    a.selecting === b.selecting &&
    a.selected === b.selected &&
    a.onOpen === b.onOpen &&
    a.onToggle === b.onToggle &&
    a.onLongPress === b.onLongPress &&
    a.onAction === b.onAction &&
    a.onMenu === b.onMenu &&
    a.actions === b.actions &&
    a.item.id === b.item.id &&
    a.item.title === b.item.title &&
    a.item.meta === b.item.meta &&
    a.item.badge === b.item.badge &&
    a.item.dimmed === b.item.dimmed &&
    a.item.actions === b.item.actions &&
    sameFields(a.item.fields, b.item.fields)
  );
}

/**
 * `memo` is what keeps a selection tap from re-rendering the whole page: the
 * row only takes primitives and stable callbacks, so React can skip the rows
 * whose selected state did not change.
 */
const RecordRow = memo(function RowBody({
  item,
  wide,
  selecting,
  selected,
  actions,
  onOpen,
  onToggle,
  onLongPress,
  onAction,
  onMenu,
}: RowProps) {
  const swipeRef = useRef<SwipeableMethods>(null);
  const rowActions = item.actions ?? actions;
  const quick = rowActions.filter((a) => a.quick && !a.danger);

  const identity = (
    <Box className="min-w-0 flex-1 gap-1">
      <Box className="flex-row items-center gap-2.5">
        <Text
          numberOfLines={1}
          className={`shrink text-[15.5px] font-semibold ${
            item.dimmed ? 'text-faint-2' : 'text-foreground'
          }`}>
          {item.title}
        </Text>
        {!!item.badge && (
          <Box className="rounded-md border border-line-card bg-muted px-2 py-0.5">
            <Text className="text-[11.5px] font-semibold text-muted-foreground">{item.badge}</Text>
          </Box>
        )}
      </Box>
      <Text numberOfLines={1} className="text-[13px] text-faint-2">
        {item.meta}
      </Text>
    </Box>
  );

  const row = (
    <Box
      className={`flex-row items-center border-b border-line-lighter pl-[18px] pr-1.5 ${
        selected ? 'bg-primary-tint' : 'bg-card'
      }`}>
      {selecting && (
        <Box
          className={`mr-3 h-[22px] w-[22px] items-center justify-center rounded-md border ${
            selected ? 'border-primary bg-primary' : 'border-border bg-card'
          }`}>
          {selected && <Text className="text-[13px] font-bold text-white">OK</Text>}
        </Box>
      )}
      <Pressable
        className="flex-1 flex-row items-center py-3"
        style={{ gap: FIELD_GAP }}
        onPress={() => (selecting ? onToggle(item.id) : onOpen(item.id))}
        onLongPress={() => onLongPress(item.id)}
        delayLongPress={350}>
        {wide ? (
          <>
            {identity}
            {item.fields.map((f) => (
              <Box key={f.label} style={{ width: f.width ?? 140 }} className="items-end">
                <FieldValue field={f} dimmed={item.dimmed} />
              </Box>
            ))}
          </>
        ) : (
          <Box className="min-w-0 flex-1 gap-2">
            {identity}
            {/* Stacked, so a 354pt phone reads every field without a sideways
                gesture. Label and value share a line: two short columns beat one
                wrapped sentence when the eye is scanning for a number. */}
            <Box className="gap-1">
              {item.fields.map((f) => (
                <Box key={f.label} className="flex-row items-baseline justify-between gap-3">
                  <Text className="text-[12.5px] uppercase tracking-wide text-faint">
                    {f.label}
                  </Text>
                  <FieldValue field={f} dimmed={item.dimmed} />
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Pressable>
      {!selecting && rowActions.length > 0 && (
        <Pressable
          onPress={() => onMenu(item.id)}
          // 44pt of touch target around a glyph that is a few points wide.
          className="h-11 w-9 items-center justify-center"
          accessibilityLabel={`Aksi untuk ${item.title}`}>
          <Text className="text-[19px] leading-[19px] text-faint">&#8942;</Text>
        </Pressable>
      )}
    </Box>
  );

  // Selection mode owns the horizontal axis - a swipe there would fight the
  // multi-select gesture and open a drawer nobody asked for.
  if (selecting || quick.length === 0) return row;

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <Box className="flex-row">
          {quick.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => {
                swipeRef.current?.close();
                onAction(a.key, item);
              }}
              className="w-[104px] items-center justify-center bg-primary px-2">
              <Text className="text-center text-[13px] font-semibold text-white">{a.label}</Text>
            </Pressable>
          ))}
        </Box>
      )}>
      {row}
    </ReanimatedSwipeable>
  );
},
areRowPropsEqual);

// ---- states ----

/**
 * Skeleton rows rather than a centred spinner: the list keeps its shape while
 * it loads, so nothing jumps when the rows land.
 */
function SkeletonRows({ count, wide }: { count: number; wide: boolean }) {
  return (
    <Box>
      {Array.from({ length: count }, (_, i) => (
        <Box
          key={i}
          className="flex-row items-center gap-3 border-b border-line-lighter px-[18px] py-3.5">
          <Box className="flex-1 gap-2">
            <Box
              className="h-3.5 rounded bg-line-light"
              style={{ width: `${55 + (i % 3) * 12}%` }}
            />
            <Box className="h-3 w-1/3 rounded bg-line-lighter" />
          </Box>
          {wide && <Box className="h-3.5 w-[90px] rounded bg-line-light" />}
        </Box>
      ))}
    </Box>
  );
}

/**
 * "Nothing here yet" and "nothing matched" are different problems and want
 * different offers - one invites a first record, the other invites clearing the
 * filter. Collapsing them into one message strands whoever hits the second.
 */
function EmptyBlock({
  filtered,
  emptyTitle,
  emptySub,
  onClear,
  onCreate,
  createLabel,
}: {
  filtered: boolean;
  emptyTitle: string;
  emptySub: string;
  onClear?: () => void;
  onCreate?: () => void;
  createLabel?: string;
}) {
  return (
    <Box className="items-center gap-3 p-10">
      <Text className="text-center text-[15px] font-semibold text-dark2">
        {filtered ? 'Tidak ada hasil' : emptyTitle}
      </Text>
      <Text className="text-center text-[13.5px] text-muted-foreground">
        {filtered ? 'Tidak ada yang cocok dengan pencarian dan filter ini.' : emptySub}
      </Text>
      {filtered && onClear && (
        <Pressable onPress={onClear} className="rounded-lg border border-border px-3.5 py-2">
          <Text className="text-[13px] font-semibold text-primary">Bersihkan filter</Text>
        </Pressable>
      )}
      {!filtered && onCreate && createLabel && (
        <Pressable onPress={onCreate} className="rounded-lg bg-primary px-3.5 py-2">
          <Text className="text-[13px] font-semibold text-white">{createLabel}</Text>
        </Pressable>
      )}
    </Box>
  );
}

/**
 * What sits under the last row while more pages exist.
 *
 * A failed page gets a button, never a spinner that turns forever: the fetch is
 * not going to recover on its own, and a list that looks busy while it is stuck
 * is worse than one that admits it.
 */
function ListEnd({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string;
  onRetry?: () => void;
}) {
  if (error !== '') {
    return (
      <Box className="items-center gap-2.5 px-6 py-5">
        <Text className="text-center text-[13px] text-danger">{error}</Text>
        {onRetry && (
          <Pressable onPress={onRetry} className="rounded-lg border border-border px-3.5 py-2">
            <Text className="text-[13px] font-semibold text-primary">Coba lagi</Text>
          </Pressable>
        )}
      </Box>
    );
  }
  if (loading) {
    return (
      <Box className="items-center py-5">
        <ActivityIndicator />
      </Box>
    );
  }
  return null;
}

// ---- undo ----

/**
 * The safety net for actions that run without asking. Five seconds is the
 * common floor for a snackbar undo - long enough to read the sentence and
 * react, short enough that the next action is not queued behind it.
 */
export function UndoBar({
  message,
  onUndo,
  onExpire,
}: {
  message: string | null;
  onUndo: () => void;
  onExpire: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onExpire, 5000);
    return () => clearTimeout(t);
  }, [message, onExpire]);

  if (!message) return null;
  return (
    <Box className="absolute bottom-5 left-5 right-5 flex-row items-center justify-between gap-4 rounded-[10px] bg-toast px-4 py-3">
      <Text className="shrink text-[13.5px] font-medium text-white">{message}</Text>
      <Pressable onPress={onUndo} hitSlop={10}>
        <Text className="text-[13.5px] font-bold uppercase tracking-wide text-gold">Batalkan</Text>
      </Pressable>
    </Box>
  );
}

// ---- selection bar ----

function SelectionBar({
  count,
  actions,
  onAction,
  onCancel,
}: {
  count: number;
  actions: RecordAction[];
  onAction: (key: string) => void;
  onCancel: () => void;
}) {
  return (
    <Box className="flex-row items-center gap-3 border-b border-line-card bg-primary-tint px-[18px] py-2.5">
      <Pressable onPress={onCancel} hitSlop={8}>
        <Text className="text-[17px] text-dark2">&#10005;</Text>
      </Pressable>
      <Text className="flex-1 text-[14px] font-semibold text-primary-dark">{count} dipilih</Text>
      {actions.map((a) => (
        <Pressable
          key={a.key}
          onPress={() => onAction(a.key)}
          className="rounded-lg border border-primary-tintline bg-card px-3 py-1.5">
          <Text className={`text-[13px] font-semibold ${a.danger ? 'text-danger' : 'text-primary'}`}>
            {a.label}
          </Text>
        </Pressable>
      ))}
    </Box>
  );
}

// ---- list ----

export function RecordList({
  items,
  loading,
  error,
  filtered,
  actions = NO_ACTIONS,
  bulkActions = NO_ACTIONS,
  onOpen,
  onAction,
  onBulkAction,
  onRetry,
  onClearFilter,
  onCreate,
  createLabel,
  emptyTitle,
  emptySub,
  footer,
  header,
  onEndReached,
  loadingMore = false,
  moreError = '',
  onRetryMore,
  leadRow,
}: {
  items: RecordItem[];
  loading: boolean;
  error: string;
  /** A search or a filter chip is active - changes which empty state shows. */
  filtered: boolean;
  actions?: RecordAction[];
  /** Offered in the selection bar. Empty disables long-press entirely. */
  bulkActions?: RecordAction[];
  onOpen: (id: number) => void;
  /** Receives the item, not just its id, so callers need no lookup - and so a
   *  handler never has to depend on the items array to find one. */
  onAction?: (key: string, item: RecordItem) => void;
  onBulkAction?: (key: string, ids: number[]) => void;
  onRetry?: () => void;
  onClearFilter?: () => void;
  onCreate?: () => void;
  createLabel?: string;
  emptyTitle: string;
  emptySub: string;
  footer?: ReactNode;
  /** Search and filter chips - pinned above the rows, never scrolled away. */
  header?: ReactNode;
  /**
   * Fetch the next page. Called on approach rather than at the very bottom, and
   * called repeatedly - `FlatList` fires this more than once per approach, so
   * the caller must guard on its own in-flight flag rather than trust the
   * threshold.
   */
  onEndReached?: () => void;
  loadingMore?: boolean;
  /** A failed page fetch. Shows a way out instead of a spinner that never ends. */
  moreError?: string;
  onRetryMore?: () => void;
  /**
   * A first entry above the records that scrolls with them - "add a new one",
   * as a row rather than a button competing for width in the header.
   */
  leadRow?: ReactNode;
}) {
  const wide = atLeast(useBreakpoint(), 'tablet');
  const [selected, setSelected] = useState<number[]>([]);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const selecting = selected.length > 0;

  // Drop only what is genuinely gone - a filter change replaces the rows and a
  // selection must not survive it, but appending a page leaves every selected
  // record right where it was. Returning the same array when nothing was
  // dropped matters: a new one here would invalidate `renderItem` on every page.
  useEffect(() => {
    setSelected((s) => {
      if (s.length === 0) return s;
      const kept = s.filter((id) => items.some((i) => i.id === id));
      return kept.length === s.length ? s : kept;
    });
  }, [items]);

  const toggle = useCallback((id: number) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }, []);

  const longPress = useCallback(
    (id: number) => {
      if (bulkActions.length === 0) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      setSelected((s) => (s.includes(id) ? s : [...s, id]));
    },
    [bulkActions.length]
  );

  const runAction = useCallback(
    (key: string, item: RecordItem) => {
      setMenuFor(null);
      onAction?.(key, item);
    },
    [onAction]
  );

  const renderItem = useCallback(
    ({ item }: { item: RecordItem }) => (
      <RecordRow
        item={item}
        wide={wide}
        selecting={selecting}
        selected={selected.includes(item.id)}
        actions={actions}
        onOpen={onOpen}
        onToggle={toggle}
        onLongPress={longPress}
        onAction={runAction}
        onMenu={setMenuFor}
      />
    ),
    [wide, selecting, selected, actions, onOpen, toggle, longPress, runAction]
  );

  const menuItem = menuFor === null ? null : (items.find((i) => i.id === menuFor) ?? null);

  return (
    <Box className="flex-1 overflow-hidden rounded-[14px] border border-line-card bg-card">
      {selecting ? (
        <SelectionBar
          count={selected.length}
          actions={bulkActions}
          onAction={(key) => {
            onBulkAction?.(key, selected);
            setSelected([]);
          }}
          onCancel={() => setSelected([])}
        />
      ) : (
        header
      )}

      {loading && items.length === 0 ? (
        <SkeletonRows count={6} wide={wide} />
      ) : error !== '' ? (
        <Box className="items-center gap-3 p-10">
          <Text className="text-center text-[15px] font-semibold text-danger">{error}</Text>
          {onRetry && (
            <Pressable onPress={onRetry} className="rounded-lg border border-border px-3.5 py-2">
              <Text className="text-[13px] font-semibold text-primary">Coba lagi</Text>
            </Pressable>
          )}
        </Box>
      ) : items.length === 0 ? (
        <EmptyBlock
          filtered={filtered}
          emptyTitle={emptyTitle}
          emptySub={emptySub}
          onClear={onClearFilter}
          onCreate={onCreate}
          createLabel={createLabel}
        />
      ) : (
        <FlatList
          data={items}
          // The record id, never the index: an index key re-binds every row to
          // different data when a page changes and defeats the `memo` above.
          keyExtractor={(i) => String(i.id)}
          renderItem={renderItem}
          ListHeaderComponent={leadRow ? <>{leadRow}</> : null}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            <ListEnd loading={loadingMore} error={moreError} onRetry={onRetryMore} />
          }
          // Nothing here saves or restores a scroll offset: opening a record
          // pushes a route, which leaves this list mounted underneath holding
          // its own position. The offset ref that used to do it by hand went
          // with the `view` state machine it was compensating for.
          //
          // No `getItemLayout`: rows are not a uniform height here - the field
          // stack on a phone grows with the field count, and any row wraps when
          // the system font size is turned up. A wrong one breaks scrolling
          // worse than its absence costs. `removeClippedSubviews` is left off
          // for the same reason: on Android it blanks rows that own a gesture,
          // and virtualisation already keeps the rendered count small.
        />
      )}

      {footer}

      {/* The menu - the discoverable route to everything the swipe hides. */}
      {menuItem && (
        <>
          <Pressable
            className="absolute bottom-0 left-0 right-0 top-0 bg-toast/20"
            onPress={() => setMenuFor(null)}
          />
          <Box className="absolute bottom-0 left-0 right-0 gap-1 rounded-t-2xl border-t border-line-card bg-card p-2 pb-5 shadow-lg">
            <Text
              numberOfLines={1}
              className="px-3 pb-1 pt-2 text-[13px] font-semibold text-muted-foreground">
              {menuItem.title}
            </Text>
            {(menuItem.actions ?? actions).map((a) => (
              <Pressable
                key={a.key}
                onPress={() => runAction(a.key, menuItem)}
                className="rounded-lg px-3 py-3">
                <Text
                  className={`text-[15px] font-semibold ${
                    a.danger ? 'text-danger' : 'text-foreground'
                  }`}>
                  {a.label}
                </Text>
              </Pressable>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}
