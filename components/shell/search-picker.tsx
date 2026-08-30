/**
 * Picking one record out of a table the client has never seen.
 *
 * `OptionPicker` renders every option as a chip, which is right for a handful
 * of fixed choices and wrong for a master table: a purchase form has to choose
 * one product out of however many the shop sells, and the list endpoints answer
 * a page at a time on purpose. So this asks the server instead — one debounced
 * `search` per keystroke burst, a page of results, and nothing held locally.
 *
 * A **chosen** value collapses to a single line with a "Ganti" button rather
 * than staying a search box. What is on screen after choosing should be the
 * answer, not the question; and re-opening the search is one tap when the answer
 * is wrong.
 *
 * The empty search term is run on mount, not treated as "nothing to show": for
 * a small table (ruang, ekspedisi) the first page *is* the whole list, and
 * making someone type before they can see three rooms is a puzzle, not a filter.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { GhostButton, TextField } from '@/components/shell/ui';
import { Box } from '@/components/ui/box';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { Colors as C } from '@/constants/theme-erp';

const DEBOUNCE_MS = 350;

export interface PickerOption {
  value: string;
  label: string;
  /** Second line: a code, a phone number, whatever tells two similar rows apart. */
  sub?: string;
  /** Still listed, still explained by `sub`, but not choosable. */
  disabled?: boolean;
}

export interface SearchPickerProps {
  /** The chosen value's label, or `null` while nothing is chosen. */
  chosen: string | null;
  onPick: (option: PickerOption) => void;
  /**
   * Runs the query. **Must be memoized** (`useCallback`) — it is an effect
   * dependency, so a fresh closure every render would re-query on every render.
   */
  search: (term: string) => Promise<PickerOption[]>;
  placeholder: string;
  /** Shown in place of the results when the query came back empty. */
  emptyHint: string;
  /** A chosen value cannot be changed — an immutable field on a saved document. */
  locked?: boolean;
}

export function SearchPicker({
  chosen,
  onPick,
  search,
  placeholder,
  emptyHint,
  locked = false,
}: SearchPickerProps) {
  const [open, setOpen] = useState(chosen === null);
  const [term, setTerm] = useState('');
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  /**
   * Bumped by every query, so a slow answer to an older term cannot paint over
   * a newer one. The debounce alone does not cover this: two queries can be in
   * flight whenever the second is typed before the first returns.
   */
  const generation = useRef(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const mine = ++generation.current;
      setLoading(true);
      search(term.trim())
        .then((result) => {
          if (cancelled || generation.current !== mine) return;
          setOptions(result);
          setErr('');
        })
        .catch(() => {
          if (cancelled || generation.current !== mine) return;
          setOptions([]);
          setErr('Gagal memuat pilihan.');
        })
        .finally(() => {
          if (!cancelled && generation.current === mine) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, term, search]);

  const pick = useCallback(
    (option: PickerOption) => {
      onPick(option);
      setOpen(false);
      setTerm('');
    },
    [onPick]
  );

  if (!open) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Box className="min-h-10 flex-1 justify-center rounded-lg border border-border bg-card px-3 py-2">
          <Text className="text-[14.5px] text-foreground">{chosen ?? '—'}</Text>
        </Box>
        {!locked && <GhostButton label="Ganti" onPress={() => setOpen(true)} />}
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <TextField value={term} onChangeText={setTerm} placeholder={placeholder} />
      <Box className="overflow-hidden rounded-lg border border-line-card bg-card">
        {/* Capped rather than unbounded: this sits inside a page that already
            scrolls, and a nested list taller than the field it belongs to
            swallows the form around it. */}
        <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {options.map((o) => (
            <Pressable
              key={o.value}
              onPress={() => {
                if (!o.disabled) pick(o);
              }}
              className={`min-h-[46px] justify-center gap-0.5 border-b border-line-lighter px-3 py-2 ${
                o.disabled ? 'bg-thead' : ''
              }`}>
              <Text
                numberOfLines={1}
                className={`text-[14.5px] ${o.disabled ? 'text-faint' : 'text-foreground'}`}>
                {o.label}
              </Text>
              {o.sub ? (
                <Text numberOfLines={1} className="text-xs text-muted-foreground">
                  {o.sub}
                </Text>
              ) : null}
            </Pressable>
          ))}
          {loading && options.length === 0 && (
            <View style={{ padding: 18, alignItems: 'center' }}>
              <ActivityIndicator color={C.primary} />
            </View>
          )}
          {!loading && err !== '' && (
            <View style={{ padding: 14 }}>
              <Text className="text-[13.5px] font-medium text-danger">{err}</Text>
            </View>
          )}
          {!loading && err === '' && options.length === 0 && (
            <View style={{ padding: 14 }}>
              <Text className="text-[13.5px] text-muted-foreground">{emptyHint}</Text>
            </View>
          )}
        </ScrollView>
      </Box>
      {chosen !== null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text className="flex-1 text-xs text-muted-foreground" numberOfLines={1}>
            Terpilih: {chosen}
          </Text>
          <GhostButton label="Batal ganti" onPress={() => setOpen(false)} />
        </View>
      )}
    </View>
  );
}
