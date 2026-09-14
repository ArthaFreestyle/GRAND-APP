/**
 * Pemasok — the supplier list, and the front door of two Beranda tiles.
 *
 * **One question: who do we buy from.** Search at the top, a chip for whether
 * retired suppliers are included, then the rows. Tapping one opens the record;
 * the docked pill adds one.
 *
 * ## Why two tiles land on one list, and what tells them apart
 *
 * Beranda draws "Pemasok" and "Utang pemasok" as separate tiles, and the
 * contract cannot give the second one a screen of its own. There is **no
 * cross-supplier debt read**: `Supplier` carries no outstanding total, and
 * `GET /supplier/{id}/utang` answers one supplier at a time. A list ranked by
 * what is owed would mean one request per supplier over the whole master, which
 * is the N+1 the contract warns about, and it would still be wrong the moment a
 * page boundary fell in the middle of it.
 *
 * So the debt tile arrives here with `?utang=1`, and the difference is where a
 * row *goes*: to the supplier in the ordinary case, and straight to that
 * supplier's open invoices in the other. The header and the note above the list
 * say which mode this is, because a list whose rows quietly lead somewhere else
 * is worse than two lists.
 *
 * `?utang=1` is safe to read on arrival here — this is a **pushed** route on the
 * root stack, mounted fresh every time, not a tab root kept alive by its
 * navigator. The rule that a parameter aimed at a section root has to be cleared
 * off the URL after it is applied does not bite here.
 *
 * ## What the list deliberately does not print
 *
 * The kode, the phone number, the address and the NPWP are all on the record.
 * They are how a supplier is *found* — `search` matches the kode and the nama
 * server-side — not what anybody reads once they have found it, and a second
 * grey line under thirty rows is thirty lines nobody acts on.
 */
import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  RamahBadge,
  RamahChip,
  RamahHeader,
  RamahInlineError,
  RamahNote,
  RamahPrimaryButton,
  RamahSearchField,
} from '@/components/shell/ramah';
import {
  RamahColors as C,
  RamahElevation as E,
  RamahIcon,
  RamahLayout as L,
  RamahRadius as R,
  RamahType as T,
} from '@/constants/theme-ramah';
import { useDockPadding } from '@/hooks/use-keyboard-height';
import { useRecordBus } from '@/hooks/use-record-bus';
import { messageOf } from '@/services/api';
import { useCanWrite } from '@/services/permissions';
import { listSupplier, supplierBus, type Supplier } from '@/services/supplier';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

export default function PemasokListScreen() {
  const router = useRouter();
  const canWrite = useCanWrite('supplier');
  /**
   * Only the bottom inset. Top, left and right are spent by `_layout.tsx`
   * outside this screen; the bottom is the docked pill's, because there is no
   * tab bar under this section to pay for that edge.
   */
  const insets = useSafeAreaInsets();
  const dockPad = useDockPadding(insets.bottom, L.dockPad);

  const params = useLocalSearchParams<{ utang?: string }>();
  /**
   * Frozen on arrival. It describes how this screen was *entered*, not what it
   * is showing, and `useState` with an initializer rather than a ref because a
   * ref read during render is what `react-hooks/refs` forbids.
   */
  const [modeUtang] = useState(() => params.utang === '1');

  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [termasukNonaktif, setTermasukNonaktif] = useState(false);

  const [rows, setRows] = useState<Supplier[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreErr, setMoreErr] = useState('');
  const [listErr, setListErr] = useState('');
  /**
   * Loading is the key wanted against the key loaded — never a boolean written
   * at the head of the fetch effect, which forces a second render before a byte
   * has been asked for and lets a stale response clear a flag a newer request
   * just set. `app/produk/index.tsx` is where this shape was worked out.
   */
  const [loadedKey, setLoadedKey] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const requestKey = `${search}|${termasukNonaktif}|${reloadToken}`;
  const loading = loadedKey !== requestKey;

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  // `search` filters in SQL against the kode and the nama, so the field is
  // debounced rather than filtering an array that is only ever a few pages deep.
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const answer = await listSupplier({
          page: 1,
          size: PAGE_SIZE,
          search: search || undefined,
          // Omitted rather than `false` when retired suppliers are wanted: the
          // parameter filters *to* a value, so leaving it out is the only way
          // to ask for both.
          is_aktif: termasukNonaktif ? undefined : true,
        });
        if (!alive) return;
        setRows(answer.data);
        setPage(1);
        setHasMore(Math.max(1, answer.paging.total_page ?? 1) > 1);
        setListErr('');
      } catch (e) {
        if (!alive) return;
        setRows([]);
        setHasMore(false);
        setListErr(messageOf(e, 'Gagal memuat daftar pemasok.'));
      } finally {
        if (!alive) return;
        // Page one is what just landed, so any halted append belongs to a query
        // that no longer exists.
        setMoreErr('');
        setLoadedKey(requestKey);
      }
    })();
    return () => {
      alive = false;
    };
  }, [search, termasukNonaktif, reloadToken, requestKey]);

  /**
   * What the detail and the two forms did while this list sat underneath them.
   *
   * A rename or a retirement is patched in place, so the reader comes back to
   * the same offset with the row already correct. A retired supplier *leaves*
   * while the list is narrowed to active ones — which is a membership change a
   * patch cannot express any other way.
   */
  useRecordBus(supplierBus, (change) => {
    if (change.kind === 'reload') {
      reload();
      return;
    }
    const saved = change.row;
    if (!saved.aktif && !termasukNonaktif) {
      setRows((list) => list.filter((r) => r.id !== saved.id));
      return;
    }
    setRows((list) => list.map((r) => (r.id === saved.id ? saved : r)));
  });

  /**
   * `onEndReached` fires more than once on one approach, so the in-flight flag
   * is the guard and the threshold is not one. A failed page halts the loop
   * behind a "Coba lagi" rather than a spinner that never ends.
   */
  const loadMore = useCallback(
    async (force = false) => {
      if (loadingMore || loading || !hasMore) return;
      if (!force && moreErr !== '') return;
      setLoadingMore(true);
      const next = page + 1;
      try {
        const answer = await listSupplier({
          page: next,
          size: PAGE_SIZE,
          search: search || undefined,
          is_aktif: termasukNonaktif ? undefined : true,
        });
        // Offset paging with no cursor anywhere, so a supplier created while
        // somebody is scrolling shifts the window and the same row can arrive
        // twice. Merging by id keeps that from becoming a duplicate key.
        setRows((list) => {
          const seen = new Set(list.map((x) => x.id));
          return [...list, ...answer.data.filter((x) => !seen.has(x.id))];
        });
        setPage(next);
        setHasMore(next < Math.max(1, answer.paging.total_page ?? 1));
        setMoreErr('');
      } catch (e) {
        setMoreErr(messageOf(e, 'Gagal memuat halaman berikutnya.'));
      } finally {
        setLoadingMore(false);
      }
    },
    [loadingMore, loading, hasMore, moreErr, page, search, termasukNonaktif]
  );

  const open = useCallback(
    (id: number) => {
      router.push(
        modeUtang
          ? { pathname: '/pemasok/[id]/utang', params: { id } }
          : { pathname: '/pemasok/[id]', params: { id } }
      );
    },
    [router, modeUtang]
  );

  /**
   * `dismiss()` targets this section's own Stack; `back()` is offered to the
   * navigator that contains the tabs first, which may answer by switching tabs
   * instead of popping this screen. The `replace` covers a cold deep link into
   * `/pemasok` with nothing underneath it to pop.
   */
  const goBack = useCallback(() => {
    if (router.canDismiss()) router.dismiss();
    else router.replace('/beranda');
  }, [router]);

  const renderRow = useCallback(
    ({ item, index }: { item: Supplier; index: number }) => (
      <PemasokRow
        row={item}
        first={index === 0}
        last={index === rows.length - 1}
        onPress={() => open(item.id)}
      />
    ),
    [rows.length, open]
  );

  return (
    <View style={styles.screen}>
      <RamahHeader title={modeUtang ? 'Utang pemasok' : 'Pemasok'} onBack={goBack} />

      <FlatList
        data={rows}
        keyExtractor={(r) => String(r.id)}
        renderItem={renderRow}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.controls}>
            <RamahSearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Cari nama atau kode pemasok"
            />
            <View style={styles.chipRow}>
              <RamahChip
                label="Termasuk nonaktif"
                selected={termasukNonaktif}
                onPress={() => setTermasukNonaktif((v) => !v)}
                accessibilityLabel={
                  termasukNonaktif
                    ? 'Sembunyikan pemasok nonaktif'
                    : 'Tampilkan juga pemasok nonaktif'
                }
              />
            </View>
            {modeUtang ? (
              <RamahNote icon="info">Pilih pemasok untuk lihat utang.</RamahNote>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Placeholder
            loading={loading}
            error={listErr}
            searching={search !== ''}
            onRetry={reload}
          />
        }
        ListFooterComponent={
          <Footer loading={loadingMore} error={moreErr} onRetry={() => loadMore(true)} />
        }
      />

      {/* Exactly one solid green pill, docked, with a verb in it — and absent
          rather than disabled for a grant that cannot write, because a
          permanently dead button is a promise the session cannot keep. It is
          also absent in debt mode: adding a supplier is not what somebody
          working through unpaid invoices came here to do. */}
      {canWrite && !modeUtang ? (
        <View style={[styles.dock, { paddingBottom: dockPad }]}>
          <RamahPrimaryButton
            label="Tambah pemasok"
            icon="plus"
            onPress={() => router.push('/pemasok/baru')}
          />
        </View>
      ) : null}
    </View>
  );
}

function PemasokRow({
  row,
  first,
  last,
  onPress,
}: {
  row: Supplier;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const [down, setDown] = useState(false);
  return (
    <View style={[styles.card, first && styles.cardFirst, last && styles.cardLast]}>
      {first ? null : <View style={styles.divider} />}
      <Pressable
        onPress={onPress}
        // `Pressable`'s `style={({ pressed }) => …}` callback silently does
        // nothing in this app: `jsxImportSource: 'nativewind'` wraps every
        // Pressable, and the wrapper normalises a non-array style into an
        // array, where React Native never calls it. Press feedback goes through
        // state instead.
        onPressIn={() => setDown(true)}
        onPressOut={() => setDown(false)}
        accessibilityRole="button"
        accessibilityLabel={`${row.nama}${row.aktif ? '' : ', nonaktif'}`}
        style={[styles.row, down && styles.rowDown]}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {row.nama}
        </Text>
        {/* The one badge a row carries, and only when it says something: every
            row printing "Aktif" is thirty pills that mean nothing. */}
        {row.aktif ? null : <RamahBadge label="Nonaktif" tone="neutral" />}
        <Feather name="chevron-right" size={RamahIcon.row} color={C.iconMuted} />
      </Pressable>
    </View>
  );
}

function Placeholder({
  loading,
  error,
  searching,
  onRetry,
}: {
  loading: boolean;
  error: string;
  searching: boolean;
  onRetry: () => void;
}) {
  if (error) return <RamahInlineError message={error} onRetry={onRetry} />;
  if (loading)
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color={C.brand} />
      </View>
    );
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>
        {searching
          ? 'Tidak ada pemasok yang cocok dengan pencarian itu.'
          : 'Belum ada pemasok. Tambahkan satu untuk mulai mencatat pembelian.'}
      </Text>
    </View>
  );
}

function Footer({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  if (error) return <RamahInlineError message={error} onRetry={onRetry} />;
  if (!loading) return null;
  return (
    <View style={styles.footer}>
      <ActivityIndicator color={C.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.surfaceSunken },
  list: { flex: 1 },
  listContent: { paddingHorizontal: L.gutter, paddingTop: L.space2, paddingBottom: L.space8 },
  controls: { gap: L.stack, paddingBottom: L.space4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: L.space2 },

  card: { backgroundColor: C.surfaceCard, borderColor: C.borderHairline, borderWidth: 1 },
  cardFirst: { borderTopLeftRadius: R.card, borderTopRightRadius: R.card },
  cardLast: { borderBottomLeftRadius: R.card, borderBottomRightRadius: R.card },
  divider: { height: 1, backgroundColor: C.borderHairline, marginHorizontal: L.cardPad },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: L.space3,
    padding: L.cardPad,
    minHeight: L.rowH,
  },
  rowDown: { backgroundColor: C.grey50 },
  rowTitle: { ...T.titleTiny, color: C.textTitle, flex: 1, minWidth: 0 },

  placeholder: { paddingVertical: L.space8, paddingHorizontal: L.space4, alignItems: 'center' },
  placeholderText: { ...T.bodySmall, color: C.textBody, textAlign: 'center' },
  footer: { paddingVertical: L.space5, alignItems: 'center' },

  dock: {
    paddingHorizontal: L.gutter,
    paddingTop: L.dockPad,
    backgroundColor: C.surfacePage,
    ...E.low,
  },
});
