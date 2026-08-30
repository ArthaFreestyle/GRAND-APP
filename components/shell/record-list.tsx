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
 * A row does exactly two things:
 *
 *   tap          open the record
 *   long-press   selection mode, for acting on several at once
 *
 * There is no per-row menu and no swipe drawer. A row is a summary of a record,
 * and what you can do to a record lives *on* the record - the detail's header
 * bar carries its actions. A `⋮` on every row was a second, dimmer copy of that
 * menu: it costs width on the axis that is already short, it invites the
 * mis-taps that make a list feel fragile, and it answers a question ("what can I
 * do with this?") that is better answered by the screen that shows the whole
 * record.
 *
 * Selection mode is the exception and stays, because acting on eight records at
 * once is the one thing no single detail screen can do. It runs immediately and
 * offers `UndoBar` rather than asking first.
 */
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, TextInput } from 'react-native';

import { TONES, type ToneName } from '@/components/shell/ui';
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
  /**
   * The badge's tint. Left out it is neutral, which is right for "Nonaktif" —
   * a fact about the record. A document's *status* is not a fact but a position
   * in a flow, and the palette already says which is which: DRAFT reads amber,
   * POSTED green, BATAL red. Scanning a list of thirty documents for the two
   * still sitting in draft is the whole job, so the tone travels with the item.
   */
  badgeTone?: ToneName;
  /** The line under the title - a code, a date, whatever identifies it. */
  meta: string;
  fields: RecordField[];
  /** Dims the row. For records that are archived rather than missing. */
  dimmed?: boolean;
}

/** One entry in the selection bar - the only actions a list still offers. */
export interface RecordAction {
  key: string;
  label: string;
  /** Colours it as destructive in the selection bar. */
  danger?: boolean;
}

const FIELD_GAP = 14;

/**
 * One shared empty array for the `bulkActions` default. `= []` in the parameter
 * list allocates a new one on every render, which changes `renderItem`'s
 * identity and re-renders every row - defeating the point of memoising it.
 */
const NO_ACTIONS: RecordAction[] = [];

// ---- the list's own chrome ----

/**
 * The band above the rows: search, then whatever chips the section filters by.
 *
 * It goes in `header`, which is *inside* the list card and pinned above the
 * scroll, so on a long list it stays the way back out. Every section drew this
 * itself before, from its own `StyleSheet`, which is how nine screens ended up
 * with four different paddings and three different search fields.
 */
export function ListHeader({ children }: { children: ReactNode }) {
  return <Box className="gap-2.5 border-b border-line-light p-3.5">{children}</Box>;
}

/**
 * The search field, sized for a thumb rather than a mouse: 52pt tall and 16.5px
 * type, which is also the size iOS stops zooming the page to reach.
 *
 * The magnifier is two `Box`es - a ring and a rotated stem - rather than an icon
 * font or an SVG. It is the only glyph the list needs, and it costs nothing.
 */
export function ListSearch({
  value,
  onChangeText,
  placeholder,
  editable = true,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  /** A filter that the search cannot narrow disables it rather than lying. */
  editable?: boolean;
}) {
  return (
    <Box className="relative justify-center">
      <Box
        pointerEvents="none"
        className="absolute left-[13px] z-10 h-3.5 w-3.5 rounded-full border-2 border-faint"
      />
      <Box
        pointerEvents="none"
        className="absolute left-6 top-[25px] z-10 h-0.5 w-2 bg-faint"
        style={{ transform: [{ rotate: '45deg' }] }}
      />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        placeholder={placeholder}
        className={`min-h-[52px] rounded-[10px] border border-border pl-[42px] pr-3.5 text-[16.5px] ${
          editable ? 'bg-card text-foreground' : 'bg-thead text-faint-2'
        }`}
      />
    </Box>
  );
}

/**
 * "Add one" as the list's first row rather than a button in a toolbar.
 *
 * A toolbar button competes for the horizontal axis that is already short on a
 * phone, and it is the one action that is always available - so it reads better
 * as the top of the list it adds to. It scrolls away with the rows on purpose:
 * someone hunting through page four is not looking for it.
 *
 * One line. It used to carry a second one explaining what a new record is for,
 * which is a sentence nobody needs twice a day above a list they already know.
 */
export function NewRecordRow({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="min-h-[52px] flex-row items-center gap-3 border-b border-line-lighter bg-thead px-[18px]">
      <Box className="min-h-[28px] min-w-[28px] items-center justify-center rounded-full bg-primary">
        <Text className="text-[18px] font-semibold leading-[21px] text-white">+</Text>
      </Box>
      <Text className="flex-1 text-[15.5px] font-semibold text-primary-dark">{title}</Text>
    </Pressable>
  );
}

// ---- row ----

function FieldValue({ field, dimmed }: { field: RecordField; dimmed?: boolean }) {
  return (
    // Two lines and no more: most values are a number or a date, but an address
    // is a field too, and one long enough to wrap four times turns every other
    // row in the list into a different height. `shrink` is what lets it wrap
    // inside its own column instead of shoving the label off the phone layout.
    <Text
      numberOfLines={2}
      className={`shrink text-right text-[14.5px] font-semibold ${
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
  onOpen: (id: number) => void;
  onToggle: (id: number) => void;
  onLongPress: (id: number) => void;
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
    a.item.id === b.item.id &&
    a.item.title === b.item.title &&
    a.item.meta === b.item.meta &&
    a.item.badge === b.item.badge &&
    a.item.badgeTone === b.item.badgeTone &&
    a.item.dimmed === b.item.dimmed &&
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
  onOpen,
  onToggle,
  onLongPress,
}: RowProps) {
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
          <Box
            className={`rounded-md border px-2 py-0.5 ${
              item.badgeTone ? TONES[item.badgeTone].box : 'border-line-card bg-muted'
            }`}>
            <Text
              className={`text-[11.5px] font-semibold ${
                item.badgeTone ? TONES[item.badgeTone].text : 'text-muted-foreground'
              }`}>
              {item.badge}
            </Text>
          </Box>
        )}
      </Box>
      <Text numberOfLines={1} className="text-[13px] text-faint-2">
        {item.meta}
      </Text>
    </Box>
  );

  return (
    <Box
      className={`flex-row items-center border-b border-line-lighter px-[18px] ${
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
    </Box>
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
  bulkActions = NO_ACTIONS,
  onOpen,
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
  /** Offered in the selection bar. Empty disables long-press entirely. */
  bulkActions?: RecordAction[];
  /** Tap. The only thing a row does, and always the same thing: open it. */
  onOpen: (id: number) => void;
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

  const renderItem = useCallback(
    ({ item }: { item: RecordItem }) => (
      <RecordRow
        item={item}
        wide={wide}
        selecting={selecting}
        selected={selected.includes(item.id)}
        onOpen={onOpen}
        onToggle={toggle}
        onLongPress={longPress}
      />
    ),
    [wide, selecting, selected, onOpen, toggle, longPress]
  );

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
          // too: virtualisation already keeps the rendered count small, and on
          // Android it has a long history of blanking rows it should not.
        />
      )}

      {footer}

    </Box>
  );
}
